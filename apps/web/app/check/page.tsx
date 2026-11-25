import type { Metadata } from 'next';
import { Check } from './check';

export const metadata: Metadata = {
  title: 'Check a payment change · Triad',
  description: 'Received an email asking you to change bank details or a pickup agent? Check it before you act: Triad checks the sender, buys independent checks on what changed, and tells you what to do next.',
};

export default function CheckPage() {
  return <Check />;
}
