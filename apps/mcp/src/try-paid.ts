// Exercises the agent path end to end against a running app: free checks until the allowance is used, then one paid
// check over x402. Usage: TRIAD_URL=http://localhost:4317 TRIAD_PAYER_KEYFILE=<solana keypair> node --import tsx src/try-paid.ts
import { createTriadClient } from './client.js';

const client = createTriadClient({ baseUrl: process.env.TRIAD_URL ?? 'http://localhost:4317', payerKeyFile: process.env.TRIAD_PAYER_KEYFILE!, ...(process.env.SOLANA_RPC_URL ? { rpcUrl: process.env.SOLANA_RPC_URL } : {}) });
const input = {
  supplier: { legalName: 'GLENCORE INTERNATIONAL AG', country: 'CH', domain: 'glencore.com' },
  account: { holder: 'GLENCORE INTERNATIONAL AG', number: 'CH9300762011623852957' },
  contact: { name: 'Glencore Treasury Desk', email: 'treasury.desk@glencore.com', phone: '+41410001005' },
  email: { fromName: 'Glencore Treasury Desk', from: 'treasury.desk@glencor.com', message: 'Our bank account has changed with immediate effect.' },
  change: { kind: 'payout', holder: 'GLENCORE INTERNATIONAL AG', number: 'CH5604835012345678009' },
};
for (let i = 1; i <= 6; i++) {
  const a = await client.check(input);
  console.log(i, a.decision, JSON.stringify(a.billing), a.headline);
}
