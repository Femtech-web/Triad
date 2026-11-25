import { instructionSchema, shipmentSchema } from '../src/index.js';
import type { CheckOutcome, Instruction, Shipment } from '../src/index.js';

// A synthetic copper shipment. Names, addresses and keys are invented for unit tests.
export const SELLER_WALLET = '0x1111111111111111111111111111111111111111';
export const ATTACKER_WALLET = '0x9999999999999999999999999999999999999999';

export const shipment: Shipment = shipmentSchema.parse({
  id: 'shp-cu-0001',
  reference: 'CU-2026-0117',
  commodity: 'Copper cathodes, LME grade A',
  quantity: '2,000 t',
  amount: { value: '25000000000', currency: 'USDC', decimals: 6 },
  buyer: { id: 'buyer', legalName: 'Halden Metals Trading AG', country: 'CH', domain: 'haldenmetals.ch', contacts: [] },
  seller: {
    id: 'seller', legalName: 'Andesite Copper SA', country: 'CL', registrationId: '96.555.123-4', vatNumber: 'CL965551234', domain: 'andesitecopper.cl',
    contacts: [
      { id: 'maria', name: 'María Rojas', email: 'm.rojas@andesitecopper.cl', phone: '+56221234567', role: 'Head of treasury' },
      { id: 'tomas', name: 'Tomás Vidal', email: 't.vidal@andesitecopper.cl', role: 'Logistics' },
    ],
  },
  consignee: { id: 'consignee', legalName: 'Halden Metals Trading AG', country: 'CH', contacts: [] },
  payout: { holderName: 'Andesite Copper SA', rail: 'sepolia', address: SELLER_WALLET, bankRef: 'CL-BCI-0001' },
  vessel: { name: 'Pacific Ore', imo: 'IMO9412345' },
  loadPort: 'San Antonio, CL',
  dischargePort: 'Rotterdam, NL',
  documents: [{ kind: 'bill_of_lading', reference: 'BL-SA-77812', sha256: 'a'.repeat(64) }],
  authorizedContactIds: ['maria', 'tomas'],
  releaseOfficer: { name: 'Halden release desk', rail: 'sepolia', publicKey: '0x2222222222222222222222222222222222222222' },
});

export function instruction(overrides: { from?: string; displayName?: string; replyTo?: string; changes?: Instruction['changes'] } = {}): Instruction {
  return instructionSchema.parse({
    id: 'ins-0001', shipmentId: shipment.id, receivedAt: '2026-11-23T09:00:00Z',
    channel: { kind: 'email', from: overrides.from ?? 'm.rojas@andesitecopper.cl', displayName: overrides.displayName ?? 'María Rojas', ...(overrides.replyTo ? { replyTo: overrides.replyTo } : {}) },
    summary: 'Please note our updated remittance details for CU-2026-0117.',
    changes: overrides.changes ?? {},
  });
}

export const newAccount = (holderName = 'Andesite Copper SA') => ({ holderName, rail: 'sepolia' as const, address: ATTACKER_WALLET, bankRef: 'CL-SANT-4410' });

// Answers as the intel package hands them over: already bound to the entity asked about.
export function answered(checkId: string, fields: Record<string, unknown>): CheckOutcome {
  const purchase = { rail: 'sepolia-escrow' as const, receiptHash: '0x' + 'b'.repeat(64), signalHash: '0x' + 'c'.repeat(64), amountUusdc: '10000', minerId: '1', latencyMs: 900 };
  return { checkId, status: 'answered', fields, detail: 'answered', sources: [{ kind: 'telegraph', name: 'Fixture Miner', status: 'answered', fields, detail: 'answered', purchase }] };
}
export const cleanEvidence = (roles: string[] = ['seller']): CheckOutcome[] => roles.flatMap((role) => [
  answered(`registry:${role}`, { active: true, registration_id: '96.555.123-4' }),
  answered(`sanctions:${role}`, { matched: false }),
  answered(`vat:${role}`, { valid: true }),
]);
