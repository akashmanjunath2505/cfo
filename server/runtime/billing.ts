import type pg from 'pg';
import type Stripe from 'stripe';
import { closePeriod } from './value-ledger.ts';
import type { BillingPeriod } from './types.ts';

export const calculateFee = (
  grossValue: number,
  feePercentage: number,
  minFee: number = 0,
  maxFee: number = Infinity
): number => {
  const raw = Math.round(grossValue * (feePercentage / 100) * 100) / 100;
  return Math.max(minFee, Math.min(maxFee, raw));
};

export const createStripeInvoice = async (
  stripe: Stripe,
  customerId: string,
  amountCents: number,
  description: string
): Promise<string | null> => {
  try {
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 14,
      description,
    });

    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: amountCents,
      currency: 'usd',
      description,
    });

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    return finalized.id;
  } catch (err) {
    console.error('[billing] Stripe invoice creation failed:', (err as Error).message);
    return null;
  }
};

export interface CloseBillingResult {
  period: BillingPeriod;
  stripeInvoiceId: string | null;
}

export const closeBillingPeriod = async (
  db: pg.Pool,
  stripe: Stripe | null,
  periodId: string
): Promise<CloseBillingResult | null> => {
  const period = await closePeriod(db, periodId);
  if (!period) return null;

  let stripeInvoiceId: string | null = null;
  const customerId = process.env.STRIPE_CUSTOMER_ID || '';

  if (stripe && customerId && period.fee_amount_usd > 0) {
    const amountCents = Math.round(period.fee_amount_usd * 100);
    const description = `Autonomous CFO savings-share fee for ${periodId} — ${period.fee_percentage}% of $${period.gross_value_usd.toFixed(2)} value delivered`;
    stripeInvoiceId = await createStripeInvoice(stripe, customerId, amountCents, description);

    if (stripeInvoiceId) {
      await db.query(
        `UPDATE billing_periods SET stripe_invoice_id = $1, status = 'invoiced' WHERE id = $2`,
        [stripeInvoiceId, periodId]
      );
    }
  }

  const updated = await db.query('SELECT * FROM billing_periods WHERE id = $1', [periodId]);
  return {
    period: updated.rows[0] as BillingPeriod,
    stripeInvoiceId,
  };
};

export const getInvoices = async (
  db: pg.Pool,
  limit: number = 24
): Promise<BillingPeriod[]> => {
  const result = await db.query(
    `SELECT * FROM billing_periods WHERE status != 'open' ORDER BY period_start DESC LIMIT $1`,
    [limit]
  );
  return result.rows as BillingPeriod[];
};
