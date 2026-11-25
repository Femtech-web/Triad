// Tops up a wallet's Telegraph escrow balance on Sepolia, which paid checks draw from per call. Dry run unless --send.
//   tsx scripts/ops/telegraph-deposit.ts --from <keyfile> --usdc 1.5 [--send]
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { TELEGRAPH_TESTNET } from '@triad/intel';
import { loadEvmAccount, SEPOLIA_RPC, SEPOLIA_TEST_USDC } from './keys.js';

const arg = (flag: string) => { const at = process.argv.indexOf(flag); return at >= 0 ? process.argv[at + 1] : undefined; };
const from = arg('--from');
const amount = parseUnits(arg('--usdc') ?? '0', 6);
if (!from || amount <= 0n) throw new Error('Usage: telegraph-deposit --from <keyfile> --usdc <amount> [--send]');
const diamond = TELEGRAPH_TESTNET.sepolia.diamond;
const erc20 = parseAbi(['function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)', 'function balanceOf(address owner) view returns (uint256)']);
const ledger = parseAbi(['function depositUSDC(uint256 amount)']);

const account = await loadEvmAccount(from);
const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(SEPOLIA_RPC) });
const held = await publicClient.readContract({ address: SEPOLIA_TEST_USDC, abi: erc20, functionName: 'balanceOf', args: [account.address] });
console.log(JSON.stringify({ wallet: account.address, diamond, deposit: formatUnits(amount, 6), walletUsdc: formatUnits(held, 6) }, null, 1));
if (held < amount) throw new Error('The wallet holds less test USDC than the deposit.');
if (!process.argv.includes('--send')) { console.log('Dry run: add --send to deposit.'); process.exit(0); }

const confirm = async (hash: `0x${string}`) => { const r = await publicClient.waitForTransactionReceipt({ hash }); if (r.status !== 'success') throw new Error(`${hash} reverted`); return hash; };
if (await publicClient.readContract({ address: SEPOLIA_TEST_USDC, abi: erc20, functionName: 'allowance', args: [account.address, diamond] }) < amount) {
  console.log(`approve ${await confirm(await wallet.writeContract({ address: SEPOLIA_TEST_USDC, abi: erc20, functionName: 'approve', args: [diamond, amount] }))}`);
}
console.log(`deposit https://sepolia.etherscan.io/tx/${await confirm(await wallet.writeContract({ address: diamond as `0x${string}`, abi: ledger, functionName: 'depositUSDC', args: [amount] }))}`);
