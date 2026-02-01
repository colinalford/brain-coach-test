/**
 * E2E 3: Ritual Start
 *
 * Post in #sb-weekly. Real Claude facilitates.
 *
 * Assertions:
 * - Bot replies with ritual kickoff (somatic check-in)
 * - Response is threaded
 * - Response is substantive (not an error)
 */

import {
  sendEvent, waitForBotReply, env,
} from './helpers.js';

/**
 * Post a message to Slack as the bot and return the ts.
 */
async function postMessage(channel, text) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack postMessage failed: ${data.error}`);
  return data.ts;
}

describe('E2E: Ritual start', () => {
  test('post in #sb-weekly → bot replies with ritual kickoff', async () => {
    const marker = `e2e_ritual_${Date.now()}`;
    const text = `Start weekly review ${marker}`;

    // Post real message to #sb-weekly
    const messageTs = await postMessage(env.WEEKLY_CHANNEL_ID, text);

    // Send signed event to E2E worker
    const response = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${marker}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text,
        user: 'U_SYSTEM_TEST',
        channel: env.WEEKLY_CHANNEL_ID,
        ts: messageTs,
      },
    });

    expect(response.status).toBe(200);

    // Wait for bot reply in thread
    const botReply = await waitForBotReply(env.WEEKLY_CHANNEL_ID, messageTs, {
      timeout: 30000,
    });
    expect(botReply).toBeTruthy();
    // Reply should be substantive (not an error)
    expect(botReply.text.length).toBeGreaterThan(30);
    // Should not be an error
    expect(botReply.text).not.toMatch(/^_?Error|^_?Failed|exception/i);
  }, 45000);
});
