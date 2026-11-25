// Moves Sepolia ETH and test USDC between our own test wallets. Dry run unless --send.
//   tsx scripts/ops/transfer.ts --from <keyfile> --to <address> [--eth 0.03] [--usdc 3] [--send]
import { createPublicClient, createWalletClient, formatEther, formatUnits, http, parseAbi, parseEther, parseUnits } from 'viem';
import type { Address } from 'viem';
import { sepolia } from 'viem/chains';
import { loadEvmAccount, SEPOLIA_RPC, SEPOLIA_TEST_USDC } from './keys.js';

const arg = (flag: string) => { const at = process.argv.indexOf(flag); return at >= 0 ? process.argv[at + 1] : undefined; };
const from = arg('--from');
const to = arg('--to') as Address | undefined;
if (!from || !to || !/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error('Usage: transfer --from <keyfile> --to <address> [--eth N] [--usdc N] [--send]');
const eth = parseEther(arg('--eth') ?? '0');
const usdc = parseUnits(arg('--usdc') ?? '0', 6);
const erc20 = parseAbi(['function transfer(address to, uint256 amount) returns (bool)', 'function balanceOf(address owner) view returns (uint256)']);

const account = await loadEvmAccount(from);
const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(SEPOLIA_RPC) });
const balances = async (who: Address) => ({ eth: formatEther(await publicClient.getBalance({ address: who })), usdc: formatUnits(await publicClient.readContract({ address: SEPOLIA_TEST_USDC, abi: erc20, functionName: 'balanceOf', args: [who] }), 6) });
console.log(JSON.stringify({ from: account.address, to, eth: formatEther(eth), usdc: formatUnits(usdc, 6), before: { from: await balances(account.address), to: await balances(to) } }, null, 1));
if (!process.argv.includes('--send')) { console.log('Dry run: add --send to transfer.'); process.exit(0); }

if (eth > 0n) {
  const hash = await wallet.sendTransaction({ to, value: eth });
  console.log(`ETH ${hash} ${(await publicClient.waitForTransactionReceipt({ hash })).status}`);
}
if (usdc > 0n) {
  const hash = await wallet.writeContract({ address: SEPOLIA_TEST_USDC, abi: erc20, functionName: 'transfer', args: [to, usdc] });
  console.log(`USDC ${hash} ${(await publicClient.waitForTransactionReceipt({ hash })).status}`);
}
console.log(JSON.stringify({ after: { from: await balances(account.address), to: await balances(to) } }, null, 1));
