import { z } from 'zod';

// The trusted record and the incoming instruction. Everything entering Triad is parsed through these schemas,
// so the rest of the system works on validated, typed data.

export const RAILS = ['sepolia', 'solana-devnet'] as const;
export type Rail = typeof RAILS[number];

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'lowercase id');
const email = z.string().email().max(254).transform((v) => v.toLowerCase());
const domain = z.string().regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'domain').transform((v) => v.toLowerCase());

export const contactSchema = z.object({
  id,
  name: z.string().min(1).max(120),
  email,
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
  role: z.string().min(1).max(80),
}).strict();
export type Contact = z.infer<typeof contactSchema>;

export const partySchema = z.object({
  id,
  legalName: z.string().min(2).max(200),
  // ISO 3166-1 alpha-2, the form registries are queried with.
  country: z.string().regex(/^[A-Z]{2}$/),
  registrationId: z.string().min(2).max(64).optional(),
  vatNumber: z.string().regex(/^[A-Z0-9-]{4,20}$/).optional(),
  domain: domain.optional(),
  contacts: z.array(contactSchema).max(10),
}).strict();
export type Party = z.infer<typeof partySchema>;

// Where money goes. On a testnet rail the account is the on-chain address the escrow pays; `bankRef` keeps the
// real-world bank details the change names, so a scenario can model both.
export const payoutSchema = z.object({
  holderName: z.string().min(2).max(200),
  rail: z.enum(RAILS),
  address: z.string().min(32).max(64),
  bankRef: z.string().max(64).optional(),
}).strict();
export type Payout = z.infer<typeof payoutSchema>;

export const vesselSchema = z.object({
  name: z.string().min(2).max(80),
  imo: z.string().regex(/^IMO\d{7}$/),
  mmsi: z.string().regex(/^\d{9}$/).optional(),
}).strict();
export type Vessel = z.infer<typeof vesselSchema>;

export const documentSchema = z.object({
  kind: z.enum(['bill_of_lading', 'commercial_invoice', 'bank_letter', 'certificate_of_origin', 'other']),
  reference: z.string().min(1).max(80),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  // Text or a public link, as DOCUMENT_AUTHENTICITY accepts it. Never a private file.
  content: z.string().max(16_000).optional(),
}).strict();
export type TradeDocument = z.infer<typeof documentSchema>;

export const shipmentSchema = z.object({
  id,
  reference: z.string().min(1).max(40),
  commodity: z.string().min(2).max(80),
  quantity: z.string().min(1).max(40),
  // Minor units (cents, micro-USDC) as a decimal string: amounts never pass through floating point.
  amount: z.object({ value: z.string().regex(/^\d{1,18}$/), currency: z.enum(['USD', 'USDC']), decimals: z.number().int().min(0).max(18) }).strict(),
  buyer: partySchema,
  seller: partySchema,
  consignee: partySchema,
  pickupParty: partySchema.optional(),
  payout: payoutSchema,
  // Not every payment has a vessel or ports on record yet, for example a change received before loading.
  vessel: vesselSchema.optional(),
  loadPort: z.string().min(2).max(80).optional(),
  dischargePort: z.string().min(2).max(80).optional(),
  documents: z.array(documentSchema).max(10),
  // Contacts allowed to change this shipment's instructions, by id within the seller's contacts.
  authorizedContactIds: z.array(id).min(1).max(5),
  releaseOfficer: z.object({ name: z.string().min(1).max(120), rail: z.enum(RAILS), publicKey: z.string().min(32).max(132) }).strict(),
}).strict().superRefine((s, ctx) => {
  const sellerContacts = new Set(s.seller.contacts.map((c) => c.id));
  for (const cid of s.authorizedContactIds) if (!sellerContacts.has(cid)) ctx.addIssue({ code: 'custom', path: ['authorizedContactIds'], message: `${cid} is not a seller contact` });
  if (s.payout.rail !== s.releaseOfficer.rail) ctx.addIssue({ code: 'custom', path: ['releaseOfficer', 'rail'], message: 'release officer and payout must use the same rail' });
});
export type Shipment = z.infer<typeof shipmentSchema>;

// An instruction as received: who it claims to be from, how it arrived, and what it asks to change.
export const instructionSchema = z.object({
  id,
  shipmentId: id,
  receivedAt: z.string().datetime(),
  channel: z.object({
    kind: z.literal('email'),
    from: email,
    displayName: z.string().max(120),
    replyTo: email.optional(),
  }).strict(),
  summary: z.string().min(1).max(2000),
  changes: z.object({
    payout: payoutSchema.optional(),
    consignee: partySchema.optional(),
    pickupParty: partySchema.optional(),
    // A substitute vessel: how sanctioned tonnage is slipped into a trade.
    vessel: vesselSchema.optional(),
    documents: z.array(documentSchema).max(5).optional(),
  }).strict(),
}).strict();
export type Instruction = z.infer<typeof instructionSchema>;

export function domainOf(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase();
}
