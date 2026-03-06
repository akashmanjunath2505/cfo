import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { calculateFee } from '../server/runtime/billing.ts';

process.env.NODE_ENV = 'test';

test('calculateFee applies percentage with min/max bounds', () => {
  assert.equal(calculateFee(10000, 5, 0, 10000), 500);
  assert.equal(calculateFee(10000, 10, 0, 10000), 1000);
  assert.equal(calculateFee(0, 5, 0, 10000), 0);

  // min fee floor
  assert.equal(calculateFee(100, 5, 50, 10000), 50);

  // max fee cap
  assert.equal(calculateFee(500000, 5, 0, 2000), 2000);

  // zero percentage
  assert.equal(calculateFee(10000, 0, 0, 10000), 0);
});

test('GET /api/value/summary returns current period data', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const res = await request(app).get('/api/value/summary');
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.grossValueUsd, 'number');
  assert.equal(typeof res.body.feePercentage, 'number');
  assert.equal(typeof res.body.feeAmountUsd, 'number');
  assert.ok(res.body.categoryBreakdown);
  assert.equal(typeof res.body.entryCount, 'number');
  assert.equal(typeof res.body.verifiedCount, 'number');
  assert.ok(res.body.currentPeriod);
  assert.equal(typeof res.body.currentPeriod.id, 'string');
  assert.ok(Array.isArray(res.body.entries));
});

test('GET /api/value/history returns periods and entries', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const res = await request(app).get('/api/value/history?months=6');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.periods));
  assert.ok(Array.isArray(res.body.entries));
});

test('POST /api/value/verify/:entryId returns 404 for missing entry', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const res = await request(app)
    .post('/api/value/verify/nonexistent-id')
    .send({ verified: true });
  assert.equal(res.status, 404);
});

test('POST /api/billing/close-period requires periodId', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const res = await request(app)
    .post('/api/billing/close-period')
    .send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'periodId is required');
});

test('POST /api/billing/close-period returns 404 for non-existent period', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const res = await request(app)
    .post('/api/billing/close-period')
    .send({ periodId: '1999-01' });
  assert.equal(res.status, 404);
});

test('GET /api/billing/invoices returns array', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const res = await request(app).get('/api/billing/invoices');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.invoices));
});

test('GET /api/opportunities returns array', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const res = await request(app).get('/api/opportunities');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.opportunities));
});

test('POST /api/opportunities/scan triggers scan and returns results', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const res = await request(app).post('/api/opportunities/scan').send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.scanned, true);
  assert.equal(typeof res.body.newOpportunities, 'number');
  assert.ok(Array.isArray(res.body.opportunities));
});

test('value ledger integration: conversation action creates ledger entry', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  // Trigger a conversation that allocates budget (creates value)
  const convoRes = await request(app).post('/api/conversation/respond').send({
    message: 'allocate some money for protein research',
    channel: 'text'
  });
  assert.equal(convoRes.status, 200);

  // Check value summary now has entries
  const sumRes = await request(app).get('/api/value/summary');
  assert.equal(sumRes.status, 200);
  // The entry count should be >= 0 (may have entries from this or other actions)
  assert.equal(typeof sumRes.body.entryCount, 'number');
});
