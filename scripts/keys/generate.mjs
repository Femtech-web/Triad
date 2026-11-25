#!/usr/bin/env node
// Generates Triad's testnet keys into .secrets/ (git-ignored, owner-only). Existing keys are never overwritten.
// Prints addresses only. Fund the operator addresses; release officers only sign and need no funds.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { privateKeyToAddress } from 'viem/accounts';

const dir = resolve(import.meta.dirname, '../../.secrets');
mkdirSync(dir, { recursive: true, mode: 0o700 });

const evm = (role) => {
  const file = resolve(dir, `evm-${role}.json`);
  if (!existsSync(file)) {
    const key = `0x${randomBytes(32).toString('hex')}`;
    writeFileSync(file, JSON.stringify({ format: 'triad-evm-key-v1', role, address: privateKeyToAddress(key), private_key: key }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  return JSON.parse(execFileSync('node', ['-e', `console.log(JSON.stringify(require(${JSON.stringify(file)}).address))`]).toString());
};
const solana = (role) => {
  const file = resolve(dir, `solana-${role}.json`);
  if (!existsSync(file)) execFileSync('solana-keygen', ['new', '--no-bip39-passphrase', '--silent', '--outfile', file], { stdio: 'ignore' });
  execFileSync('chmod', ['600', file]);
  return execFileSync('solana-keygen', ['pubkey', file]).toString().trim();
};

console.log(JSON.stringify({
  'evm-operator (Sepolia: deploys, funds escrows, pays Telegraph; needs ETH + test USDC)': evm('operator'),
  'evm-release-officer (signs EIP-712 releases; no funds)': evm('release-officer'),
  'solana-operator (devnet: deploys the program, funds escrows, pays x402; needs SOL + devnet USDC)': solana('operator'),
  'solana-release-officer (signs ed25519 releases; no funds)': solana('release-officer'),
  'evm-demo-seller (receives demo releases on Sepolia; no funds)': evm('demo-seller'),
  'solana-demo-seller (receives demo releases on devnet; no funds)': solana('demo-seller'),
}, null, 2));
