import { hashTypedData, parseAbi } from 'viem';
import type { Account, Address, Chain, Hex, PublicClient, Transport, WalletClient } from 'viem';
import type { ReleaseAuthorization } from './key.js';

// The Sepolia rail: contracts/evm/src/ShipmentEscrow.sol. Its EIP-712 domain and type must match the contract exactly;
// the shared vector in test/vectors.test.ts and the Foundry suite pin the same digest.

export const shipmentEscrowAbi = parseAbi([
  'function fund(bytes32 shipmentId, address token, uint256 amount, address releaseOfficer, uint64 refundAfter)',
  'function release(bytes32 shipmentId, address payee, bytes32 evidenceHash, uint64 validUntil, bytes signature)',
  'function refund(bytes32 shipmentId)',
  'function escrows(bytes32 shipmentId) view returns (address buyer, address token, uint256 amount, address releaseOfficer, uint64 refundAfter, uint8 state)',
  'function releaseDigest(bytes32 shipmentId, address payee, uint256 amount, bytes32 evidenceHash, uint64 validUntil) view returns (bytes32)',
  'event Funded(bytes32 indexed shipmentId, address indexed buyer, address token, uint256 amount, address releaseOfficer, uint64 refundAfter)',
  'event Released(bytes32 indexed shipmentId, address indexed payee, uint256 amount, bytes32 evidenceHash)',
  'event Refunded(bytes32 indexed shipmentId, address indexed buyer, uint256 amount)',
  'error AlreadyFunded()', 'error InvalidEscrow()', 'error NotFunded()', 'error AuthorizationExpired()', 'error NotReleaseOfficer()', 'error NotBuyer()', 'error RefundTooEarly()',
]);
export const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]);

export const EVM_STATES = ['None', 'Funded', 'Released', 'Refunded'] as const;

export interface EvmRelease { chainId: number; escrow: Address; shipmentKey: Hex; payee: Address; amount: bigint; evidenceHash: Hex; validUntil: bigint }

export function releaseTypedData(r: EvmRelease) {
  return {
    domain: { name: 'Triad ShipmentEscrow', version: '1', chainId: r.chainId, verifyingContract: r.escrow },
    types: { Release: [
      { name: 'shipmentId', type: 'bytes32' }, { name: 'payee', type: 'address' }, { name: 'amount', type: 'uint256' },
      { name: 'evidenceHash', type: 'bytes32' }, { name: 'validUntil', type: 'uint64' },
    ] },
    primaryType: 'Release',
    message: { shipmentId: r.shipmentKey, payee: r.payee, amount: r.amount, evidenceHash: r.evidenceHash, validUntil: r.validUntil },
  } as const;
}

export const evmReleaseDigest = (r: EvmRelease): Hex => hashTypedData(releaseTypedData(r));

type TypedDataSigner = { address: Address; signTypedData: (data: ReturnType<typeof releaseTypedData>) => Promise<Hex> };

export async function authorizeEvmRelease(officer: TypedDataSigner, r: EvmRelease): Promise<ReleaseAuthorization> {
  const signature = await officer.signTypedData(releaseTypedData(r));
  return { rail: 'sepolia', shipmentKey: r.shipmentKey, payee: r.payee, amount: r.amount.toString(), evidenceHash: r.evidenceHash, validUntil: Number(r.validUntil), signer: officer.address, signature };
}

export function createEvmSettlement({ publicClient, wallet, escrow }: { publicClient: PublicClient; wallet: WalletClient<Transport, Chain, Account>; escrow: Address }) {
  const confirm = async (hash: Hex) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted.`);
    return { hash, blockNumber: receipt.blockNumber };
  };
  // Public RPCs are load-balanced: the node estimating gas can be a block behind a transaction just confirmed, and
  // revert on state it hasn't seen yet. Only that revert is retried.
  const afterFreshState = async (stale: RegExp, send: () => Promise<Hex>) => {
    for (let attempt = 1; ; attempt++) {
      try { return await confirm(await send()); }
      catch (error) {
        if (attempt >= 5 || !stale.test((error as Error).message)) throw error;
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
  };
  return {
    async read(shipmentKey: Hex) {
      const [buyer, token, amount, releaseOfficer, refundAfter, state] = await publicClient.readContract({ address: escrow, abi: shipmentEscrowAbi, functionName: 'escrows', args: [shipmentKey] });
      return { buyer, token, amount, releaseOfficer, refundAfter, state: EVM_STATES[state] ?? 'None' };
    },
    async fund(f: { shipmentKey: Hex; token: Address; amount: bigint; releaseOfficer: Address; refundAfter: bigint }) {
      const allowance = () => publicClient.readContract({ address: f.token, abi: erc20Abi, functionName: 'allowance', args: [wallet.account.address, escrow] });
      if (await allowance() < f.amount) await confirm(await wallet.writeContract({ address: f.token, abi: erc20Abi, functionName: 'approve', args: [escrow, f.amount] }));
      return afterFreshState(/insufficient allowance/i, () => wallet.writeContract({ address: escrow, abi: shipmentEscrowAbi, functionName: 'fund', args: [f.shipmentKey, f.token, f.amount, f.releaseOfficer, f.refundAfter] }));
    },
    async release(a: ReleaseAuthorization) {
      return afterFreshState(/NotFunded/, () => wallet.writeContract({ address: escrow, abi: shipmentEscrowAbi, functionName: 'release',
        args: [a.shipmentKey, a.payee as Address, a.evidenceHash, BigInt(a.validUntil), a.signature as Hex] }));
    },
    async refund(shipmentKey: Hex) {
      return confirm(await wallet.writeContract({ address: escrow, abi: shipmentEscrowAbi, functionName: 'refund', args: [shipmentKey] }));
    },
  };
}
