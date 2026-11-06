import {
  ExchangeRate,
  Money,
  numericStringTransformer,
} from '../money/index.js';

/**
 * DEVELOPMENT ONLY. These are made-up people and made-up transfers for local
 * testing. The password is public (it is in the README), so never use it, or
 * this account, anywhere real.
 */
export const DEMO_USER = {
  email: 'demo@familypot.example',
  password: 'demo-password-dev',
} as const;

export interface DemoRecipient {
  name: string;
  country: string;
  notes: string;
}

export const DEMO_RECIPIENTS: readonly DemoRecipient[] = [
  { name: 'Amara Okafor', country: 'NG', notes: 'Sample data: sister' },
  { name: 'Kofi Mensah', country: 'GH', notes: 'Sample data: cousin' },
  { name: 'Wanjiru Kamau', country: 'KE', notes: 'Sample data: friend' },
  { name: 'Priya Sharma', country: 'IN', notes: 'Sample data: aunt' },
];

export interface DemoTransfer {
  recipient: string; // a DEMO_RECIPIENTS name
  transferDate: string; // fixed absolute dates keep re-runs idempotent
  sent: Money;
  fee: Money;
  receivingCurrency: string;
  exchangeRate: string;
  provider: string;
  purpose: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
}

/** Amounts are built through the money module: minor units, never floats. */
const money = (amount: string, currency: string) =>
  Money.fromWire({ amount, currency });
/** The rate as the API stores it (no trailing zeros). */
const rate = (value: string) =>
  numericStringTransformer.from(ExchangeRate.parse(value).value) as string;

export const DEMO_TRANSFERS: readonly DemoTransfer[] = [
  {
    recipient: 'Amara Okafor',
    transferDate: '2026-01-10',
    sent: money('25000', 'GBP'),
    fee: money('349', 'GBP'),
    receivingCurrency: 'NGN',
    exchangeRate: rate('1980.5'),
    provider: 'Wise',
    purpose: 'Rent',
    status: 'completed',
  },
  {
    recipient: 'Amara Okafor',
    transferDate: '2026-02-10',
    sent: money('25000', 'GBP'),
    fee: money('349', 'GBP'),
    receivingCurrency: 'NGN',
    exchangeRate: rate('1962.25'),
    provider: 'Wise',
    purpose: 'Rent',
    status: 'completed',
  },
  {
    recipient: 'Amara Okafor',
    transferDate: '2026-03-10',
    sent: money('25000', 'GBP'),
    fee: money('0', 'GBP'),
    receivingCurrency: 'NGN',
    exchangeRate: rate('1955'),
    provider: 'Remitly',
    purpose: 'Rent',
    status: 'completed',
  },
  {
    recipient: 'Amara Okafor',
    transferDate: '2026-04-10',
    sent: money('30000', 'GBP'),
    fee: money('399', 'GBP'),
    receivingCurrency: 'NGN',
    exchangeRate: rate('1948.75'),
    provider: 'Western Union',
    purpose: 'Rent and school fees',
    status: 'failed',
  },
  {
    recipient: 'Kofi Mensah',
    transferDate: '2026-02-03',
    sent: money('12000', 'USD'),
    fee: money('250', 'USD'),
    receivingCurrency: 'GHS',
    exchangeRate: rate('14.8'),
    provider: 'Wise',
    purpose: 'Family support',
    status: 'completed',
  },
  {
    recipient: 'Kofi Mensah',
    transferDate: '2026-05-03',
    sent: money('12000', 'USD'),
    fee: money('250', 'USD'),
    receivingCurrency: 'GHS',
    exchangeRate: rate('14.65'),
    provider: 'Wise',
    purpose: 'Family support',
    status: 'completed',
  },
  {
    recipient: 'Kofi Mensah',
    transferDate: '2026-08-03',
    sent: money('15000', 'USD'),
    fee: money('0', 'USD'),
    receivingCurrency: 'GHS',
    exchangeRate: rate('14.5'),
    provider: 'Remitly',
    purpose: 'Medical bills',
    status: 'cancelled',
  },
  {
    recipient: 'Wanjiru Kamau',
    transferDate: '2026-03-21',
    sent: money('8000', 'EUR'),
    fee: money('199', 'EUR'),
    receivingCurrency: 'KES',
    exchangeRate: rate('140.125'),
    provider: 'Remitly',
    purpose: 'Gift',
    status: 'completed',
  },
  {
    recipient: 'Wanjiru Kamau',
    transferDate: '2026-09-21',
    sent: money('10000', 'EUR'),
    fee: money('199', 'EUR'),
    receivingCurrency: 'KES',
    exchangeRate: rate('141.5'),
    provider: 'Wise',
    purpose: 'Gift',
    status: 'pending',
  },
  {
    recipient: 'Priya Sharma',
    transferDate: '2026-01-28',
    sent: money('50000', 'CAD'),
    fee: money('450', 'CAD'),
    receivingCurrency: 'INR',
    exchangeRate: rate('61.2'),
    provider: 'Wise',
    purpose: 'Family support',
    status: 'completed',
  },
  {
    recipient: 'Priya Sharma',
    transferDate: '2026-06-28',
    sent: money('50000', 'CAD'),
    fee: money('450', 'CAD'),
    receivingCurrency: 'INR',
    exchangeRate: rate('60.85'),
    provider: 'Western Union',
    purpose: 'Family support',
    status: 'completed',
  },
  {
    recipient: 'Priya Sharma',
    transferDate: '2026-10-28',
    sent: money('45000', 'CAD'),
    fee: money('0', 'CAD'),
    receivingCurrency: 'INR',
    exchangeRate: rate('61.05'),
    provider: 'Remitly',
    purpose: 'Festival',
    status: 'pending',
  },
];
