import {
  AccountRole, address, appendTransactionMessageInstructions, createTransactionMessage, getAddressDecoder, getAddressEncoder,
  getProgramDerivedAddress, getSignatureFromTransaction, getUtf8Encoder, pipe, sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, signBytes, signTransactionMessageWithSigners,
} from '@solana/kit';
import type { Address, Instruction, Rpc, RpcSubscriptions, SolanaRpcApi, SolanaRpcSubscriptionsApi, TransactionSigner } from '@solana/kit';
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { fromHex, toHex } from './key.js';
import type { ReleaseAuthorization } from './key.js';

// The Solana rail: programs/solana/programs/triad-escrow. Encodings mirror the Rust program byte for byte; the shared
// vectors in test/vectors.test.ts and the program's tests pin them. Discriminators come from the generated IDL.

export const ED25519_PROGRAM_ADDRESS = address('Ed25519SigVerify111111111111111111111111111');
export const INSTRUCTIONS_SYSVAR_ADDRESS = address('Sysvar1nstructions1111111111111111111111111');
export const SYSTEM_PROGRAM_ADDRESS = address('11111111111111111111111111111111');
const RELEASE_DOMAIN = new Uint8Array(getUtf8Encoder().encode('TRIADRL1'));
const DISCRIMINATOR = {
  fund: [218, 188, 111, 221, 152, 113, 174, 7],
  release: [253, 249, 15, 206, 28, 127, 193, 241],
  refund: [2, 96, 183, 251, 63, 208, 46, 46],
  escrowAccount: [31, 213, 123, 187, 186, 22, 218, 155],
} as const;
export const SOLANA_STATES = ['Funded', 'Released', 'Refunded'] as const;

const addressBytes = (a: Address) => new Uint8Array(getAddressEncoder().encode(a));
const u64 = (n: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; };
const i64 = (n: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, n, true); return b; };
const concat = (...parts: (Uint8Array | readonly number[])[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

export interface SolanaRelease { programAddress: Address; shipmentKey: Uint8Array; payee: Address; mint: Address; amount: bigint; evidenceHash: Uint8Array; validUntil: bigint }

export function releaseMessage(r: SolanaRelease): Uint8Array {
  return concat(RELEASE_DOMAIN, addressBytes(r.programAddress), r.shipmentKey, addressBytes(r.payee), addressBytes(r.mint), u64(r.amount), r.evidenceHash, i64(r.validUntil));
}

// The ed25519 program's single-signature layout, every offset inside this instruction (index u16::MAX).
export function ed25519Instruction(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Instruction {
  const keyOffset = 16;
  const signatureOffset = keyOffset + 32;
  const messageOffset = signatureOffset + 64;
  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  header[0] = 1;
  [signatureOffset, 0xffff, keyOffset, 0xffff, messageOffset, message.length, 0xffff].forEach((v, i) => view.setUint16(2 + i * 2, v, true));
  return { programAddress: ED25519_PROGRAM_ADDRESS, accounts: [], data: concat(header, publicKey, signature, message) };
}

export async function escrowAddress(programAddress: Address, shipmentKey: Uint8Array): Promise<Address> {
  return (await getProgramDerivedAddress({ programAddress, seeds: [getUtf8Encoder().encode('escrow'), shipmentKey] }))[0];
}
const ata = async (owner: Address, mint: Address) => (await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0];

export async function authorizeSolanaRelease(officer: { address: Address; keyPair: CryptoKeyPair }, r: SolanaRelease): Promise<ReleaseAuthorization> {
  const signature = await signBytes(officer.keyPair.privateKey, releaseMessage(r));
  return { rail: 'solana-devnet', shipmentKey: toHex(r.shipmentKey), payee: r.payee, amount: r.amount.toString(), evidenceHash: toHex(r.evidenceHash), validUntil: Number(r.validUntil), signer: officer.address, signature: toHex(new Uint8Array(signature)) };
}

export async function fundInstruction(p: { programAddress: Address; buyer: TransactionSigner; mint: Address; shipmentKey: Uint8Array; amount: bigint; releaseOfficer: Address; refundAfter: bigint }): Promise<Instruction> {
  const escrow = await escrowAddress(p.programAddress, p.shipmentKey);
  return {
    programAddress: p.programAddress,
    accounts: [
      { address: p.buyer.address, role: AccountRole.WRITABLE_SIGNER, signer: p.buyer },
      { address: p.mint, role: AccountRole.READONLY },
      { address: await ata(p.buyer.address, p.mint), role: AccountRole.WRITABLE },
      { address: escrow, role: AccountRole.WRITABLE },
      { address: await ata(escrow, p.mint), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: concat(DISCRIMINATOR.fund, p.shipmentKey, u64(p.amount), addressBytes(p.releaseOfficer), i64(p.refundAfter)),
  } as Instruction;
}

export async function releaseInstructions(p: { programAddress: Address; relayer: TransactionSigner; buyer: Address; mint: Address; authorization: ReleaseAuthorization }): Promise<Instruction[]> {
  const a = p.authorization;
  const shipmentKey = fromHex(a.shipmentKey);
  const evidenceHash = fromHex(a.evidenceHash);
  const payee = address(a.payee);
  const escrow = await escrowAddress(p.programAddress, shipmentKey);
  const message = releaseMessage({ programAddress: p.programAddress, shipmentKey, payee, mint: p.mint, amount: BigInt(a.amount), evidenceHash, validUntil: BigInt(a.validUntil) });
  const release = {
    programAddress: p.programAddress,
    accounts: [
      { address: p.relayer.address, role: AccountRole.WRITABLE_SIGNER, signer: p.relayer },
      { address: escrow, role: AccountRole.WRITABLE },
      { address: p.buyer, role: AccountRole.WRITABLE },
      { address: p.mint, role: AccountRole.READONLY },
      { address: await ata(escrow, p.mint), role: AccountRole.WRITABLE },
      { address: payee, role: AccountRole.READONLY },
      { address: await ata(payee, p.mint), role: AccountRole.WRITABLE },
      { address: INSTRUCTIONS_SYSVAR_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: concat(DISCRIMINATOR.release, shipmentKey, evidenceHash, i64(BigInt(a.validUntil))),
  } as Instruction;
  // The authorization must come immediately before the release: the program reads the previous instruction.
  return [ed25519Instruction(message, fromHex(a.signature, 64), addressBytes(address(a.signer))), release];
}

export async function refundInstruction(p: { programAddress: Address; buyer: TransactionSigner; mint: Address; shipmentKey: Uint8Array }): Promise<Instruction> {
  const escrow = await escrowAddress(p.programAddress, p.shipmentKey);
  return {
    programAddress: p.programAddress,
    accounts: [
      { address: p.buyer.address, role: AccountRole.WRITABLE_SIGNER, signer: p.buyer },
      { address: escrow, role: AccountRole.WRITABLE },
      { address: p.mint, role: AccountRole.READONLY },
      { address: await ata(escrow, p.mint), role: AccountRole.WRITABLE },
      { address: await ata(p.buyer.address, p.mint), role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: concat(DISCRIMINATOR.refund, p.shipmentKey),
  } as Instruction;
}

export interface SolanaEscrowState { buyer: Address; mint: Address; amount: bigint; releaseOfficer: Address; refundAfter: bigint; state: typeof SOLANA_STATES[number]; evidenceHash: `0x${string}` }

export function decodeEscrow(data: Uint8Array): SolanaEscrowState {
  if (!DISCRIMINATOR.escrowAccount.every((b, i) => data[i] === b)) throw new Error('Not a Triad escrow account.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const key = (at: number) => getAddressDecoder().decode(data.subarray(at, at + 32));
  const state = SOLANA_STATES[data[8 + 32 + 32 + 32 + 8 + 32 + 8]!];
  if (!state) throw new Error('Unknown escrow state.');
  return {
    buyer: key(40), mint: key(72), amount: view.getBigUint64(104, true), releaseOfficer: key(112), refundAfter: view.getBigInt64(144, true),
    state, evidenceHash: toHex(data.subarray(153, 185)),
  };
}

export function createSolanaSettlement({ rpc, rpcSubscriptions, programAddress, payer }: {
  rpc: Rpc<SolanaRpcApi>; rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>; programAddress: Address; payer: TransactionSigner;
}) {
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  const send = async (instructions: Instruction[]) => {
    const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );
    const signed = await signTransactionMessageWithSigners(message);
    await sendAndConfirm(signed as Parameters<typeof sendAndConfirm>[0], { commitment: 'confirmed' });
    return { signature: getSignatureFromTransaction(signed) };
  };
  return {
    async read(shipmentKey: Uint8Array): Promise<SolanaEscrowState | null> {
      const { value } = await rpc.getAccountInfo(await escrowAddress(programAddress, shipmentKey), { encoding: 'base64' }).send();
      return value ? decodeEscrow(new Uint8Array(Buffer.from(value.data[0], 'base64'))) : null;
    },
    async fund(f: { mint: Address; shipmentKey: Uint8Array; amount: bigint; releaseOfficer: Address; refundAfter: bigint }) {
      return send([await fundInstruction({ programAddress, buyer: payer, ...f })]);
    },
    async release(a: ReleaseAuthorization, buyer: Address, mint: Address) {
      return send(await releaseInstructions({ programAddress, relayer: payer, buyer, mint, authorization: a }));
    },
    async refund(f: { mint: Address; shipmentKey: Uint8Array }) {
      return send([await refundInstruction({ programAddress, buyer: payer, ...f })]);
    },
  };
}
