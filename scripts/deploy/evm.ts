// Deploys ShipmentEscrow to Sepolia from the Foundry artifact and records it in deployments/sepolia.json.
// Refuses to overwrite an existing deployment record. Dry run unless --send.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, formatEther, http } from 'viem';
import type { Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { loadEvmAccount, SEPOLIA_RPC } from '../ops/keys.js';

const ROOT = resolve(import.meta.dirname, '../..');
const artifact = JSON.parse(await readFile(resolve(ROOT, 'contracts/evm/out/ShipmentEscrow.sol/ShipmentEscrow.json'), 'utf8')) as { bytecode: { object: Hex }; metadata: { compiler: { version: string } } };
const bytecode = artifact.bytecode.object;
const account = await loadEvmAccount(resolve(ROOT, '.secrets/evm-operator.json'));
const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(SEPOLIA_RPC) });
const gas = await publicClient.estimateGas({ account: account.address, data: bytecode });
const price = await publicClient.getGasPrice();
console.log(JSON.stringify({ deployer: account.address, balance: formatEther(await publicClient.getBalance({ address: account.address })), gas: gas.toString(), estimatedCost: formatEther(gas * price), compiler: artifact.metadata.compiler.version }, null, 1));
if (!process.argv.includes('--send')) { console.log('Dry run: add --send to deploy.'); process.exit(0); }

const hash = await wallet.deployContract({ abi: [], bytecode });
const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 300_000 });
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Deployment ${hash} failed.`);
const record = {
  network: 'sepolia', chainId: sepolia.id, contract: 'ShipmentEscrow', address: receipt.contractAddress, transaction: hash, blockNumber: receipt.blockNumber.toString(),
  deployer: account.address, compiler: artifact.metadata.compiler.version, bytecodeSha256: createHash('sha256').update(bytecode).digest('hex'), deployedAt: new Date().toISOString(),
};
await writeFile(resolve(ROOT, 'deployments/sepolia.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(record, null, 1));
