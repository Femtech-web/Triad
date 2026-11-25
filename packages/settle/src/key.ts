import { createHash } from 'node:crypto';

// One 32-byte key per shipment, the same on both chains: bytes32 on Sepolia, the escrow PDA seed on Solana.
export function shipmentKey(shipmentId: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`triad:shipment:${shipmentId}`).digest());
}

export const toHex = (bytes: Uint8Array): `0x${string}` => `0x${Buffer.from(bytes).toString('hex')}`;

export function fromHex(hex: string, length = 32): Uint8Array {
  if (!/^0x[0-9a-fA-F]*$/.test(hex) || hex.length !== 2 + length * 2) throw new Error(`Expected ${length} bytes of hex.`);
  return new Uint8Array(Buffer.from(hex.slice(2), 'hex'));
}

// What a release officer signed on either rail, and the signature.
export interface ReleaseAuthorization {
  rail: 'sepolia' | 'solana-devnet';
  shipmentKey: `0x${string}`;
  payee: string;
  amount: string;
  evidenceHash: `0x${string}`;
  validUntil: number;
  signer: string;
  signature: string;
}
