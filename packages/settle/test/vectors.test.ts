import { test } from 'node:test';
import assert from 'node:assert/strict';
import { address, generateKeyPair, signBytes, verifySignature } from '@solana/kit';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import { authorizeEvmRelease, ed25519Instruction, evmReleaseDigest, fromHex, releaseMessage, releaseTypedData, shipmentKey, toHex } from '../src/index.js';

// The same bytes are pinned in programs/solana/.../tests/escrow.rs and contracts/evm/test/ShipmentEscrow.t.sol, so the
// TypeScript encoders, the Anchor program and the Solidity contract cannot drift apart unnoticed.
const KEY = shipmentKey('shp-cu-0001');
const EVIDENCE = '0x7f83957f16dea1bb5b15c002f408ef5c4317a04bcaf1c126e1129c9174dea93d';
const SOLANA = { programAddress: address('7hRAkLUZ2EMuFpsc3mtKfKnfxUJvcbgJqhWDShtxz567'), shipmentKey: KEY, payee: address('DcmvuRErWwHBsT6bcCuHU7tncb523dYxRbwY2q8xwjSd'), mint: address('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'), amount: 25_000_000_000n, evidenceHash: fromHex(EVIDENCE), validUntil: 1795400000n };
const EVM = { chainId: 11155111, escrow: '0xe5c0000000000000000000000000000000000001', shipmentKey: toHex(KEY), payee: '0x1111111111111111111111111111111111111111', amount: 25_000_000_000n, evidenceHash: EVIDENCE, validUntil: 1795400000n } as const;

test('shipment keys and release encodings match the pinned cross-language vectors', () => {
  assert.equal(toHex(KEY), '0xea342a6c9f584e993feca5f6797b9e198c6d6bb89ec54b736046614130be2134');
  assert.equal(toHex(releaseMessage(SOLANA)), '0x5452494144524c316380ae4ab7ce1cba4002b8bd680a52f5d74a264cf97c102fdaf1bf2eab3a5470ea342a6c9f584e993feca5f6797b9e198c6d6bb89ec54b736046614130be2134bb765f8cac899feed0b55dc17455faaab0201e3c5ca981f5cfb89df18cff01763b442cb3912157f13a933d0134282d032b5ffecd01a2dbf1b7790608df002ea700ba1dd2050000007f83957f16dea1bb5b15c002f408ef5c4317a04bcaf1c126e1129c9174dea93d40a1036b00000000');
  assert.equal(releaseMessage(SOLANA).length, 184);
  assert.equal(evmReleaseDigest(EVM), '0x7d609ed551df407d2c80265952d21018f8231a82e341384dd7c1a0494b4cbed3');
});

test('an EIP-712 release recovers to the release officer', async () => {
  const officer = privateKeyToAccount('0x' + '11'.repeat(32) as `0x${string}`);
  const auth = await authorizeEvmRelease(officer, EVM);
  assert.equal(await recoverTypedDataAddress({ ...releaseTypedData(EVM), signature: auth.signature as `0x${string}` }), officer.address);
  assert.deepEqual([auth.rail, auth.amount, auth.validUntil], ['sepolia', '25000000000', 1795400000]);
});

test('the ed25519 instruction uses the native single-signature layout with every offset inside itself', async () => {
  const keyPair = await generateKeyPair();
  const message = releaseMessage(SOLANA);
  const signature = new Uint8Array(await signBytes(keyPair.privateKey, message));
  assert.ok(await verifySignature(keyPair.publicKey, signature as never, message));
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const { data } = ed25519Instruction(message, signature, publicKey);
  const view = new DataView(data!.buffer, data!.byteOffset);
  assert.deepEqual([data![0], data![1]], [1, 0]);
  assert.deepEqual([2, 4, 6, 8, 10, 12, 14].map((at) => view.getUint16(at, true)), [48, 0xffff, 16, 0xffff, 112, 184, 0xffff]);
  assert.deepEqual([...data!.subarray(16, 48)], [...publicKey]);
  assert.deepEqual([...data!.subarray(112)], [...message]);
});
