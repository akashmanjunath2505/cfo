interface ConnectorResult {
  ok: boolean;
  provider: string;
  detail: string;
  payload?: Record<string, unknown>;
}

const postWebhook = async (url: string, body: Record<string, unknown>): Promise<boolean> => {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return true;
  } catch {
    return false;
  }
};

export const connectors = {
  async sendEmail(input: {
    to: string;
    subject: string;
    body: string;
    correlationId: string;
  }): Promise<ConnectorResult> {
    const webhook = process.env.CFO_EMAIL_WEBHOOK_URL || '';
    if (!webhook) {
      return {
        ok: true,
        provider: 'mock-email',
        detail: `No email webhook configured. Simulated email to ${input.to}.`,
        payload: input
      };
    }
    const ok = await postWebhook(webhook, input);
    return {
      ok,
      provider: 'email-webhook',
      detail: ok ? 'Email outreach sent.' : 'Email webhook failed.'
    };
  },

  async sendMessage(input: {
    channel: string;
    message: string;
    correlationId: string;
  }): Promise<ConnectorResult> {
    const webhook = process.env.CFO_MESSAGING_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || '';
    if (!webhook) {
      return {
        ok: true,
        provider: 'mock-messaging',
        detail: `No messaging webhook configured. Simulated message for ${input.channel}.`,
        payload: input
      };
    }
    const ok = await postWebhook(webhook, { text: input.message, channel: input.channel, correlationId: input.correlationId });
    return {
      ok,
      provider: 'messaging-webhook',
      detail: ok ? 'Message delivered.' : 'Message webhook failed.'
    };
  },

  async createCalendarTask(input: {
    title: string;
    dueDate?: string;
    notes?: string;
    correlationId: string;
  }): Promise<ConnectorResult> {
    const webhook = process.env.CFO_CALENDAR_WEBHOOK_URL || '';
    if (!webhook) {
      return {
        ok: true,
        provider: 'mock-calendar',
        detail: `No calendar webhook configured. Simulated calendar task "${input.title}".`,
        payload: input
      };
    }
    const ok = await postWebhook(webhook, input);
    return {
      ok,
      provider: 'calendar-webhook',
      detail: ok ? 'Calendar/task created.' : 'Calendar webhook failed.'
    };
  },

  async updateCrm(input: {
    entityType: string;
    entityId: string;
    updates: Record<string, unknown>;
    correlationId: string;
  }): Promise<ConnectorResult> {
    const webhook = process.env.CFO_CRM_WEBHOOK_URL || '';
    if (!webhook) {
      return {
        ok: true,
        provider: 'mock-crm',
        detail: `No CRM webhook configured. Simulated ${input.entityType} update.`,
        payload: input
      };
    }
    const ok = await postWebhook(webhook, input);
    return {
      ok,
      provider: 'crm-webhook',
      detail: ok ? 'CRM updated.' : 'CRM webhook failed.'
    };
  }
};
