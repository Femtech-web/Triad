#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createTriadClient, verifyEvidenceFile } from './client.js';

// Triad for agents over MCP (stdio). An agent about to pay a supplier, or release cargo, on a changed instruction asks
// check_payment_change first; if Triad holds for a callback, a person makes the call and the agent records the answer.
//   TRIAD_URL           the Triad app (default: the live testnet deployment)
//   TRIAD_PAYER_KEYFILE optional Solana devnet keypair with devnet USDC, to pay $0.05 a check once the free allowance is used

const client = createTriadClient({
  baseUrl: (process.env.TRIAD_URL ?? 'https://triad-five-steel.vercel.app').replace(/\/$/, ''),
  ...(process.env.TRIAD_PAYER_KEYFILE ? { payerKeyFile: process.env.TRIAD_PAYER_KEYFILE } : {}),
  ...(process.env.SOLANA_RPC_URL ? { rpcUrl: process.env.SOLANA_RPC_URL } : {}),
});
const server = new McpServer({ name: 'triad', version: '0.1.0' });
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

const iso = z.string().length(2).describe('ISO 3166-1 alpha-2 country code, such as CH');
server.registerTool('check_payment_change', {
  title: 'Check a payment or cargo change before acting on it',
  description: 'Give Triad who you pay (as you had it before the email) and the email asking for a change. It checks the sender, buys independent checks through Telegraph, and returns CLEAR, HOLD or BLOCK with plain next steps and a signed evidence file. Never pay or release on HOLD or BLOCK.',
  inputSchema: {
    supplier: z.object({ legalName: z.string(), country: iso, domain: z.string().describe('the supplier\'s real website domain'), registrationId: z.string().optional() }),
    account: z.object({ holder: z.string(), number: z.string().describe('the account you pay today: number or IBAN') }),
    contact: z.object({ name: z.string(), email: z.string(), phone: z.string().optional().describe('international format; Triad will tell you to call it') }),
    email: z.object({ fromName: z.string(), from: z.string(), replyTo: z.string().optional(), message: z.string() }),
    change: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('none') }),
      z.object({ kind: z.literal('payout'), holder: z.string(), number: z.string() }),
      z.object({ kind: z.literal('pickup'), legalName: z.string(), country: iso }),
    ]),
  },
}, async (input) => {
  const a = await client.check(input);
  return json({ decision: a.decision, headline: a.headline, nextSteps: a.nextSteps, needs: a.needs, callbackTarget: a.callbackTarget,
    rules: a.rules, paidChecks: a.paidChecks, evidence_sha256: a.evidence_sha256, signedBy: a.attestation?.signer ?? null, billing: a.billing });
});

server.registerTool('record_callback_answer', {
  title: 'Record what the trusted contact said',
  description: 'After a HOLD that needs a callback, a person calls the contact on record (never a number from the email) and asks whether they sent the change. Record their answer; Triad decides again on the same evidence, buying nothing.',
  inputSchema: { evidence_sha256: z.string(), outcome: z.enum(['confirmed', 'denied']) },
}, async ({ evidence_sha256, outcome }) => {
  const issued = await client.recordCallback(evidence_sha256, outcome);
  return json({ decision: issued.evidence.decision.decision, needs: issued.evidence.decision.needs, evidence_sha256: issued.evidence_sha256 });
});

server.registerTool('share_decision', {
  title: 'Publish a decision\'s evidence file',
  description: 'Publishes the full evidence file of a decision made in this session under a permalink. Only do this when the person you act for agrees: it contains the supplier and account details.',
  inputSchema: { evidence_sha256: z.string() },
}, async ({ evidence_sha256 }) => json({ permalink: await client.share(evidence_sha256) }));

server.registerTool('verify_evidence', {
  title: 'Verify a Triad evidence file',
  description: 'Recomputes the file\'s SHA-256 from its canonical bytes, checks every paid answer has a receipt, and recovers who signed it. Trusts nothing from Triad.',
  inputSchema: { file: z.string().describe('the evidence file as JSON text: { evidence_sha256, evidence, attestation }') },
}, async ({ file }) => json(await verifyEvidenceFile(JSON.parse(file))));

await server.connect(new StdioServerTransport());
