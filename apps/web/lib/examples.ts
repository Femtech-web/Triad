import type { CheckInput } from './check-model';

// Starting points for the everyday check. The companies are real; the people, mailboxes, phone numbers and the
// accounts (standard example IBANs) are not.
const glencore = {
  supplier: { legalName: 'GLENCORE INTERNATIONAL AG', country: 'CH', domain: 'glencore.com', registrationId: '213800PSSU2QXF1WLR89' },
  account: { holder: 'GLENCORE INTERNATIONAL AG', number: 'CH93 0076 2011 6238 5295 7' },
  contact: { name: 'Glencore Treasury Desk', email: 'treasury.desk@glencore.com', phone: '+41 41 000 10 05' },
};
const newAccount = { kind: 'payout' as const, holder: 'GLENCORE INTERNATIONAL AG', number: 'CH56 0483 5012 3456 7800 9' };

export const EXAMPLES: { id: string; label: string; input: CheckInput }[] = [
  {
    id: 'lookalike', label: 'Look-alike domain',
    input: { ...glencore, change: newAccount, email: { fromName: 'Glencore Treasury Desk', from: 'treasury.desk@glencor.com', message: 'Due to an internal audit our bank account has changed with immediate effect. Please remit the open invoice to the account below and confirm by return.' } },
  },
  {
    id: 'genuine', label: 'Real mailbox, new account',
    input: { ...glencore, change: newAccount, email: { fromName: 'Glencore Treasury Desk', from: 'treasury.desk@glencore.com', message: 'We have moved our USD receiving account to a new bank. Please use the details below for all open invoices.' } },
  },
  {
    id: 'sanctioned', label: 'Sanctioned pickup agent',
    input: {
      supplier: { legalName: 'ANTOFAGASTA PLC', country: 'GB', domain: 'antofagasta.co.uk', registrationId: '213800MY6QVH4FVLD628' },
      account: { holder: 'ANTOFAGASTA PLC', number: 'GB29 NWBK 6016 1331 9268 19' },
      contact: { name: 'Antofagasta Logistics Desk', email: 'logistics.desk@antofagasta.co.uk', phone: '+44 20 7000 1001' },
      email: { fromName: 'Antofagasta Logistics Desk', from: 'logistics.desk@antofagasta.co.uk', message: 'Change of forwarding agent: please release the cargo at Rotterdam to our new agent below, who will collect on arrival.' },
      change: { kind: 'pickup', legalName: 'PAO Sovcomflot', country: 'RU' },
    },
  },
  {
    id: 'asagreed', label: 'Pay as agreed',
    input: {
      supplier: { legalName: 'Aurubis AG', country: 'DE', domain: 'aurubis.com', registrationId: '5299005SHIN9ZK7GW242' },
      account: { holder: 'Aurubis AG', number: 'DE89 3704 0044 0532 0130 00' },
      contact: { name: 'Aurubis Treasury Desk', email: 'treasury.desk@aurubis.com', phone: '+49 40 0000 1002' },
      email: { fromName: 'Aurubis Treasury Desk', from: 'treasury.desk@aurubis.com', message: 'Delivery confirmed at Hamburg. Please settle the invoice as agreed.' },
      change: { kind: 'none' },
    },
  },
];
