/**
 * Test 1: ACK Timing
 *
 * SYSTEM.md invariant: The Worker must respond to Slack events with 200
 * within 3 seconds. This is the most basic contract — if this fails,
 * nothing else can work.
 */

import { sendEvent, sendCommand, env } from '../helpers.js';

describe('ACK timing', () => {
  test('Worker responds 200 to a signed event within 3 seconds', async () => {
    const eventPayload = {
      type: 'event_callback',
      event_id: `Ev_ack_${Date.now()}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: 'ack timing test',
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: `${Date.now() / 1000}`,
      },
    };

    const start = Date.now();
    const response = await sendEvent(eventPayload);
    const durationMs = Date.now() - start;

    expect(response.status).toBe(200);
    expect(durationMs).toBeLessThan(3000);
  });

  test('Worker responds 401 to unsigned request', async () => {
    const body = JSON.stringify({ type: 'event_callback', event: {} });

    const response = await fetch(`${env.TEST_WORKER_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slack-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
        'X-Slack-Signature': 'v0=invalid',
      },
      body,
    });

    expect(response.status).toBe(401);
  });

  test('Worker responds 200 to signed slash command', async () => {
    const start = Date.now();
    const response = await sendCommand('/what-matters', '');
    const durationMs = Date.now() - start;

    expect(response.status).toBe(200);
    expect(durationMs).toBeLessThan(3000);
  });
});
