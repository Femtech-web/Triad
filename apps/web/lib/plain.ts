import type { RuleId } from '@triad/core';
import type { EvidenceFile } from '@triad/evidence/canonical';

// A decision in the words of the person about to pay: what it means, and what to do next.

const BLOCK_HEADLINE: Partial<Record<RuleId, string>> = {
  'R-SENDER-LOOKALIKE': 'Don’t pay. The email comes from a domain that imitates your supplier’s.',
  'R-DISPLAY-NAME-SPOOF': 'Don’t pay. The sender borrows your contact’s name from an outside address.',
  'R-REPLY-TO-LOOKALIKE': 'Don’t pay. Replies would go to a look-alike of your supplier’s domain.',
  'R-SANCTIONS-MATCH': 'Don’t release. A party in this change is on a sanctions list.',
  'R-ENTITY-INACTIVE': 'Don’t pay. The company isn’t active in its registry.',
  'R-DOCUMENT-FORGED': 'Don’t pay. The attached document looks forged.',
  'R-CALLBACK-DENIED': 'Don’t pay. Your contact says they never sent this.',
  'R-VAT-INVALID': 'Don’t pay. The tax number doesn’t belong to this company.',
};

export function headline(e: EvidenceFile): string {
  const d = e.decision;
  const target = d.callback.target;
  if (d.decision === 'BLOCK') return BLOCK_HEADLINE[d.hits.find((h) => h.effect === 'block')?.rule as RuleId] ?? 'Don’t pay. This instruction is fraudulent or prohibited.';
  if (d.decision === 'HOLD') {
    if (d.needs.includes('callback') && target) return `Don’t pay yet. Confirm it with ${target.name} first.`;
    if (d.needs.includes('callback')) return 'Don’t pay yet. There is no safe way to confirm this with your contact.';
    return 'Don’t pay yet. Some checks couldn’t be completed.';
  }
  if (d.callback.accepted) return `Safe to proceed. ${target?.name ?? 'Your contact'} confirmed it, and every required check passed.`;
  return e.changeSet.changes.length ? 'Safe to proceed. Every required check passed.' : 'Safe to pay as agreed. Nothing about where the money goes has changed.';
}

export function nextSteps(e: EvidenceFile): string[] {
  const d = e.decision;
  const target = d.callback.target;
  const reach = target ? (target.channel === 'phone' ? `Call ${target.name} on ${target.address}` : `Write a new email (not a reply) to ${target.name} at ${target.address}`) : null;
  if (d.decision === 'BLOCK') {
    return [
      'Don’t pay, and don’t reply to the email or use any link or number in it.',
      'Forward it to your security or IT team.',
      'If a payment already went out, call your bank now and ask them to recall it.',
      ...(reach && d.hits.some((h) => h.rule.startsWith('R-SENDER') || h.rule.startsWith('R-DISPLAY') || h.rule.startsWith('R-REPLY'))
        ? [`${reach} to warn them someone is imitating them.`] : []),
    ];
  }
  if (d.decision === 'HOLD') {
    return [
      ...(d.needs.includes('callback') && reach ? [`${reach}. That’s the contact you had before this email. Don’t use anything from the email to reach them.`, 'Ask whether they sent this request, then record their answer below.'] : []),
      ...(d.needs.includes('callback') && !reach ? ['Find a phone number for your supplier that you had before this email, call them, and ask whether they sent it.'] : []),
      ...(d.needs.includes('evidence') ? ['Some checks had no usable answer. Run the check again later, or confirm these yourself before paying:', ...d.unknowns.slice(0, 3)] : []),
    ];
  }
  return ['Pay as agreed.', 'Keep the evidence file with the payment record: it shows what was checked and who confirmed it.'];
}
