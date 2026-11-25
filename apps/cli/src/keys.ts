import { lstat, readFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';

// Loads an EVM key from an owner-only JSON file ({ private_key }). Only the address ever leaves this function's caller.
export async function loadEvmAccount(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error(`${path} must be a regular file readable only by its owner.`);
  const key = (JSON.parse(await readFile(path, 'utf8')) as { private_key?: unknown }).private_key;
  if (typeof key !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${path} holds no private_key.`);
  return privateKeyToAccount(key as `0x${string}`);
}

export const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
export const SEPOLIA_TEST_USDC = '0xcc194e1a843B658526D0D5C431f670028582Ae17' as const;

// A Solana keypair file as solana-keygen writes it: a JSON array of the 64 secret-key bytes. Owner-only.
export async function loadSolanaSigner(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error(`${path} must be a regular file readable only by its owner.`);
  const bytes = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!Array.isArray(bytes) || bytes.length !== 64) throw new Error(`${path} is not a Solana keypair file.`);
  const { createKeyPairSignerFromBytes } = await import('@solana/kit');
  return createKeyPairSignerFromBytes(new Uint8Array(bytes as number[]));
}

export const SOLANA_DEVNET_RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
