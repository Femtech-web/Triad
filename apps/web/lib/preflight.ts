import { decide, detectChanges, planChecks } from '@triad/core';
import type { Instruction, Shipment } from '@triad/core';

// What Triad sees before spending anything, computed in the browser with the same code the server runs.
export function preflight(shipment: Shipment, instruction: Instruction) {
  const changeSet = detectChanges(shipment, instruction);
  const fromEmail = decide({ shipment, instruction, changeSet, plan: [], outcomes: [] });
  const blocked = fromEmail.decision === 'BLOCK';
  const plan = blocked ? [] : planChecks(shipment, changeSet);
  return { changeSet, plan, hits: fromEmail.hits, blocked, maxCalls: plan.reduce((n, c) => n + (c.required ? 2 : 1), 0) };
}
