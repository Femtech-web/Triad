//! Triad escrow on LiteSVM: the same guarantees as contracts/evm/test/ShipmentEscrow.t.sol, plus the Solana-specific
//! attack of pointing the ed25519 instruction at bytes outside itself.
use {
    anchor_lang::{prelude::Pubkey, solana_program::instruction::Instruction, AccountDeserialize, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    solana_account::Account,
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_program_option::COption,
    solana_program_pack::Pack,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    spl_associated_token_account_interface::address::get_associated_token_address,
    spl_token_interface::state::{Account as TokenAccount, AccountState, Mint},
    triad_escrow::{release_message, Escrow, EscrowState, ESCROW_SEED},
};

const AMOUNT: u64 = 25_000_000_000;
const NOW: i64 = 1_795_400_000;
const SHIPMENT: [u8; 32] = [7; 32];
const EVIDENCE: [u8; 32] = [9; 32];

struct World {
    svm: LiteSVM,
    buyer: Keypair,
    officer: Keypair,
    mint: Pubkey,
    seller: Pubkey,
    attacker: Pubkey,
}

fn token_account(svm: &mut LiteSVM, address: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64) {
    let mut data = vec![0; TokenAccount::LEN];
    TokenAccount { mint, owner, amount, delegate: COption::None, state: AccountState::Initialized, is_native: COption::None, delegated_amount: 0, close_authority: COption::None }.pack_into_slice(&mut data);
    svm.set_account(address, Account { lamports: 2_039_280, data, owner: spl_token_interface::ID, executable: false, rent_epoch: 0 }).unwrap();
}

fn world() -> World {
    let mut svm = LiteSVM::new();
    svm.add_program(triad_escrow::id(), include_bytes!("../../../target/deploy/triad_escrow.so")).unwrap();
    svm.set_sysvar(&Clock { unix_timestamp: NOW, ..Clock::default() });
    let (buyer, officer) = (Keypair::new(), Keypair::new());
    svm.airdrop(&buyer.pubkey(), 10_000_000_000).unwrap();
    let mint = Pubkey::new_unique();
    let mut data = vec![0; Mint::LEN];
    Mint { mint_authority: COption::None, supply: AMOUNT, decimals: 6, is_initialized: true, freeze_authority: COption::None }.pack_into_slice(&mut data);
    svm.set_account(mint, Account { lamports: 1_461_600, data, owner: spl_token_interface::ID, executable: false, rent_epoch: 0 }).unwrap();
    let (seller, attacker) = (Pubkey::new_unique(), Pubkey::new_unique());
    token_account(&mut svm, get_associated_token_address(&buyer.pubkey(), &mint), mint, buyer.pubkey(), AMOUNT);
    token_account(&mut svm, get_associated_token_address(&seller, &mint), mint, seller, 0);
    token_account(&mut svm, get_associated_token_address(&attacker, &mint), mint, attacker, 0);
    let mut w = World { svm, buyer, officer, mint, seller, attacker };
    let officer = w.officer.pubkey();
    let fund = fund_ix(&w, officer, NOW + 30 * 86_400);
    send(&mut w, &[fund], None).expect("fund");
    w
}

fn escrow_address() -> Pubkey {
    Pubkey::find_program_address(&[ESCROW_SEED, &SHIPMENT], &triad_escrow::id()).0
}

fn fund_ix(w: &World, release_officer: Pubkey, refund_after: i64) -> Instruction {
    let escrow = escrow_address();
    Instruction::new_with_bytes(
        triad_escrow::id(),
        &triad_escrow::instruction::Fund { shipment_id: SHIPMENT, amount: AMOUNT, release_officer, refund_after }.data(),
        triad_escrow::accounts::Fund {
            buyer: w.buyer.pubkey(), mint: w.mint, buyer_token: get_associated_token_address(&w.buyer.pubkey(), &w.mint), escrow,
            vault: get_associated_token_address(&escrow, &w.mint), token_program: spl_token_interface::ID,
            associated_token_program: spl_associated_token_account_interface::program::ID, system_program: anchor_lang::system_program::ID,
        }.to_account_metas(None),
    )
}

fn release_ix(w: &World, payee: Pubkey, evidence: [u8; 32], valid_until: i64) -> Instruction {
    let escrow = escrow_address();
    Instruction::new_with_bytes(
        triad_escrow::id(),
        &triad_escrow::instruction::Release { shipment_id: SHIPMENT, evidence_hash: evidence, valid_until }.data(),
        triad_escrow::accounts::Release {
            relayer: w.buyer.pubkey(), escrow, buyer: w.buyer.pubkey(), mint: w.mint, vault: get_associated_token_address(&escrow, &w.mint),
            payee, payee_token: get_associated_token_address(&payee, &w.mint),
            instructions: anchor_lang::compat::solana_instructions_sysvar::ID, token_program: spl_token_interface::ID,
        }.to_account_metas(None),
    )
}

fn refund_ix(w: &World, buyer: Pubkey) -> Instruction {
    let escrow = escrow_address();
    Instruction::new_with_bytes(
        triad_escrow::id(),
        &triad_escrow::instruction::Refund { shipment_id: SHIPMENT }.data(),
        triad_escrow::accounts::Refund {
            buyer, escrow, mint: w.mint, vault: get_associated_token_address(&escrow, &w.mint),
            buyer_token: get_associated_token_address(&buyer, &w.mint), token_program: spl_token_interface::ID,
        }.to_account_metas(None),
    )
}

/// The officer's ed25519 authorization over the canonical release message.
fn authorization(signer: &Keypair, payee: Pubkey, mint: Pubkey, amount: u64, evidence: [u8; 32], valid_until: i64) -> Instruction {
    let message = release_message(&triad_escrow::id(), &SHIPMENT, &payee, &mint, amount, &evidence, valid_until);
    let signature: [u8; 64] = signer.sign_message(&message).as_ref().try_into().unwrap();
    solana_ed25519_program::new_ed25519_instruction_with_signature(&message, &signature, &signer.pubkey().to_bytes())
}

fn send(w: &mut World, instructions: &[Instruction], signer: Option<&Keypair>) -> Result<(), String> {
    let payer = signer.unwrap_or(&w.buyer);
    w.svm.expire_blockhash();
    let message = Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &w.svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer]).unwrap();
    w.svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?} {:?}", e.err, e.meta.logs))
}

fn balance(w: &World, owner: &Pubkey) -> u64 {
    TokenAccount::unpack(&w.svm.get_account(&get_associated_token_address(owner, &w.mint)).unwrap().data).unwrap().amount
}

fn state(w: &World) -> Escrow {
    Escrow::try_deserialize(&mut w.svm.get_account(&escrow_address()).unwrap().data.as_slice()).unwrap()
}

#[test]
fn release_pays_the_signed_payee_once_and_records_the_evidence() {
    let mut w = world();
    let valid_until = NOW + 3600;
    let auth = authorization(&w.officer, w.seller, w.mint, AMOUNT, EVIDENCE, valid_until);
    let release = release_ix(&w, w.seller, EVIDENCE, valid_until);
    send(&mut w, &[auth.clone(), release.clone()], None).expect("release");
    assert_eq!(balance(&w, &w.seller), AMOUNT);
    let escrow = state(&w);
    assert_eq!((escrow.state, escrow.evidence_hash), (EscrowState::Released, EVIDENCE));
    assert!(w.svm.get_account(&get_associated_token_address(&escrow_address(), &w.mint)).map_or(true, |a| a.lamports == 0), "vault closed");
    assert!(send(&mut w, &[auth, release], None).is_err(), "a shipment is released once");
}

#[test]
fn any_change_to_the_authorization_is_refused() {
    let mut w = world();
    let valid_until = NOW + 3600;
    let signed = authorization(&w.officer, w.seller, w.mint, AMOUNT, EVIDENCE, valid_until);
    let to_attacker = release_ix(&w, w.attacker, EVIDENCE, valid_until);
    let other_evidence = release_ix(&w, w.seller, [1; 32], valid_until);
    let later = release_ix(&w, w.seller, EVIDENCE, valid_until + 1);
    let impostor = authorization(&Keypair::new(), w.seller, w.mint, AMOUNT, EVIDENCE, valid_until);
    let partial = authorization(&w.officer, w.seller, w.mint, AMOUNT - 1, EVIDENCE, valid_until);
    let right = release_ix(&w, w.seller, EVIDENCE, valid_until);
    for attempt in [vec![signed.clone(), to_attacker], vec![signed.clone(), other_evidence], vec![signed, later], vec![impostor, right.clone()], vec![partial, right.clone()], vec![right]] {
        let logs = send(&mut w, &attempt, None).expect_err("must be refused");
        assert!(logs.contains("BadAuthorization") || logs.contains("MissingAuthorization"), "{logs}");
    }
    assert_eq!(balance(&w, &w.attacker), 0);
    assert_eq!(state(&w).state, EscrowState::Funded);
}

#[test]
fn an_ed25519_instruction_that_borrows_its_message_from_elsewhere_is_refused() {
    let mut w = world();
    let valid_until = NOW + 3600;
    let mut forged = authorization(&w.officer, w.seller, w.mint, AMOUNT, EVIDENCE, valid_until);
    // Point the message at instruction 1 (the release itself) instead of this instruction.
    forged.data[14..16].copy_from_slice(&1u16.to_le_bytes());
    let release = release_ix(&w, w.seller, EVIDENCE, valid_until);
    assert!(send(&mut w, &[forged, release], None).is_err());
    assert_eq!(state(&w).state, EscrowState::Funded);
}

#[test]
fn an_expired_authorization_is_refused() {
    let mut w = world();
    let valid_until = NOW + 3600;
    let auth = authorization(&w.officer, w.seller, w.mint, AMOUNT, EVIDENCE, valid_until);
    let release = release_ix(&w, w.seller, EVIDENCE, valid_until);
    w.svm.set_sysvar(&Clock { unix_timestamp: valid_until + 1, ..Clock::default() });
    let logs = send(&mut w, &[auth, release], None).expect_err("expired");
    assert!(logs.contains("AuthorizationExpired"), "{logs}");
}

#[test]
fn refund_only_by_the_buyer_after_the_deadline_and_never_after_release() {
    let mut w = world();
    let too_early = refund_ix(&w, w.buyer.pubkey());
    assert!(send(&mut w, &[too_early], None).expect_err("early").contains("RefundTooEarly"));
    w.svm.set_sysvar(&Clock { unix_timestamp: NOW + 30 * 86_400, ..Clock::default() });
    let stranger = Keypair::new();
    w.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let mint = w.mint;
    token_account(&mut w.svm, get_associated_token_address(&stranger.pubkey(), &mint), mint, stranger.pubkey(), 0);
    let by_stranger = refund_ix(&w, stranger.pubkey());
    assert!(send(&mut w, &[by_stranger], Some(&stranger)).is_err());
    let refund = refund_ix(&w, w.buyer.pubkey());
    send(&mut w, &[refund], None).expect("refund");
    assert_eq!((balance(&w, &w.buyer.pubkey()), state(&w).state), (AMOUNT, EscrowState::Refunded));
    let valid_until = NOW + 31 * 86_400;
    let auth = authorization(&w.officer, w.seller, w.mint, AMOUNT, EVIDENCE, valid_until);
    let release = release_ix(&w, w.seller, EVIDENCE, valid_until);
    assert!(send(&mut w, &[auth, release], None).is_err());
}

#[test]
fn a_shipment_is_funded_once() {
    let mut w = world();
    let officer = w.officer.pubkey();
    let again = fund_ix(&w, officer, NOW + 86_400);
    assert!(send(&mut w, &[again], None).is_err());
}

#[test]
fn the_release_message_matches_the_typescript_encoder() {
    // Pinned in packages/settle/test/vectors.test.ts: the client signs exactly the bytes the program checks.
    let hex = |s: &str| (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect::<Vec<u8>>();
    let key: [u8; 32] = hex("ea342a6c9f584e993feca5f6797b9e198c6d6bb89ec54b736046614130be2134").try_into().unwrap();
    let evidence: [u8; 32] = hex("7f83957f16dea1bb5b15c002f408ef5c4317a04bcaf1c126e1129c9174dea93d").try_into().unwrap();
    let message = release_message(
        &"7hRAkLUZ2EMuFpsc3mtKfKnfxUJvcbgJqhWDShtxz567".parse().unwrap(),
        &key,
        &"DcmvuRErWwHBsT6bcCuHU7tncb523dYxRbwY2q8xwjSd".parse().unwrap(),
        &"4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU".parse().unwrap(),
        25_000_000_000,
        &evidence,
        1_795_400_000,
    );
    assert_eq!(message.to_vec(), hex("5452494144524c316380ae4ab7ce1cba4002b8bd680a52f5d74a264cf97c102fdaf1bf2eab3a5470ea342a6c9f584e993feca5f6797b9e198c6d6bb89ec54b736046614130be2134bb765f8cac899feed0b55dc17455faaab0201e3c5ca981f5cfb89df18cff01763b442cb3912157f13a933d0134282d032b5ffecd01a2dbf1b7790608df002ea700ba1dd2050000007f83957f16dea1bb5b15c002f408ef5c4317a04bcaf1c126e1129c9174dea93d40a1036b00000000"));
}
