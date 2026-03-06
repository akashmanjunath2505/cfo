import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';

test('simulation run contract returns projected metrics', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const response = await request(app).post('/api/simulations/run').send({
    scenario: 'Contract Test Scenario',
    parameters: { hiring: 2, marketingSpend: 3000 }
  });

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.analysis, 'string');
  assert.equal(typeof response.body.projectedBurn, 'number');
  assert.equal(typeof response.body.projectedRunway, 'number');
});

test('conversation endpoint returns autonomous decision envelope', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const response = await request(app).post('/api/conversation/respond').send({
    message: 'Can we afford a small protein research allocation right now?',
    channel: 'text'
  });

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.conversationId, 'string');
  assert.equal(typeof response.body.reply, 'string');
  assert.equal(Array.isArray(response.body.actions), true);
  assert.equal(typeof response.body.correlationId, 'string');
  assert.equal(typeof response.body.stats.totalCash, 'number');
});

test('operations endpoints and idempotency guard work', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const idem = `idem-test-key-${Date.now()}`;
  const first = await request(app)
    .post('/api/operations/email')
    .set('x-idempotency-key', idem)
    .send({
      to: 'investor@example.com',
      subject: 'Update',
      body: 'Metrics improved this month.'
    });
  assert.equal(first.status, 200);
  assert.equal(typeof first.body.correlationId, 'string');
  assert.equal(typeof first.body.ok, 'boolean');

  const second = await request(app)
    .post('/api/operations/email')
    .set('x-idempotency-key', idem)
    .send({
      to: 'investor@example.com',
      subject: 'Update',
      body: 'Metrics improved this month.'
    });
  assert.equal(second.status, 409);
});

test('guardrails and timeline endpoints return structured controls', async () => {
  const { createApp } = await import('../server.ts');
  const app = await createApp();

  const guardrails = await request(app).get('/api/guardrails');
  assert.equal(guardrails.status, 200);
  assert.equal(typeof guardrails.body.autonomyEnabled, 'boolean');
  assert.equal(Array.isArray(guardrails.body.allowedActions), true);

  const timeline = await request(app).get('/api/actions/timeline');
  assert.equal(timeline.status, 200);
  assert.equal(Array.isArray(timeline.body), true);
});
