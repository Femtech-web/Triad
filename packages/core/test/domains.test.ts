import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDomains, compareNames, registrableDomain } from '../src/index.js';

test('sender domains that imitate the trusted one are caught without any network call', () => {
  const relation = (sender: string) => compareDomains(sender, 'andesitecopper.cl').relation;
  assert.equal(relation('andesitecopper.cl'), 'same');
  assert.equal(relation('mail.andesitecopper.cl'), 'subdomain');
  assert.equal(relation('andesitecoper.cl'), 'lookalike', 'one character dropped');
  assert.equal(relation('andesitecopper.co'), 'lookalike', 'same name, different ending');
  assert.equal(relation('andesitec0pper.cl'), 'lookalike', 'zero for o');
  assert.equal(relation('andesitecopper-payments.com'), 'brand_in_other_domain');
  assert.equal(relation('xn--andesitecper-xyz.cl'), 'lookalike', 'punycode');
  assert.equal(relation('gmail.com'), 'free_mail');
  assert.equal(relation('haldenmetals.ch'), 'unrelated');
  assert.match(compareDomains('andesitecoper.cl', 'andesitecopper.cl').reason, /differs from andesitecopper\.cl by 1 character/);
});

test('registrable domains respect two-label suffixes', () => {
  assert.equal(registrableDomain('accounts.payments.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('mail.andesitecopper.cl'), 'andesitecopper.cl');
  assert.equal(compareDomains('example-co.co.uk', 'example.co.uk').relation, 'brand_in_other_domain');
});

test('company names compare on distinctive words, not legal forms or punctuation', () => {
  assert.equal(compareNames('Andesite Copper SA', 'ANDESITE COPPER S.A.'), 'same');
  assert.equal(compareNames('Glencore International AG', 'Glencore International'), 'same');
  assert.equal(compareNames('Glencore International AG', 'Glencore International AG, Baar'), 'similar');
  assert.equal(compareNames('Andesite Copper SA', 'Andesite Trading DMCC'), 'different');
  assert.equal(compareNames('Société Générale', 'Societe Generale SA'), 'same');
  assert.equal(compareNames('', 'Anything'), 'different');
});
