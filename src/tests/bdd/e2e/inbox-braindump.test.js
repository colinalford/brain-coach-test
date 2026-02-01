/**
 * E2E 1: Inbox Brain Dump
 *
 * Send a real multi-topic brain dump to #sb-inbox via signed request.
 * Real Claude processes it.
 *
 * Strategy: Post a real message via Slack API (so the ts is valid),
 * then send a signed event to the E2E worker with that ts.
 * Worker processes with real Claude and replies in the thread.
 *
 * Assertions:
 * - Bot replies in thread with substantive content
 * - GitHub: stream file updated with captures
 * - Response is not an error
 */

import {
  sendEvent, waitForBotReply, getRecentCommits, env, poll,
} from './helpers.js';

/**
 * Post a message to Slack as the test user and return the ts.
 */
async function postAsUser(channel, text) {
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

describe('E2E: Inbox brain dump', () => {
  test('multi-topic brain dump → threaded reply + GitHub commit', async () => {
    const marker = `e2e_braindump_${Date.now()}`;
    const text = [
      `Brain dump for ${marker}:`,
      '1. Need to schedule dentist appointment for Saturday',
      '2. Working on the API refactor, stuck on auth middleware',
      '3. Groceries: eggs, bread, coffee',
    ].join('\n');

    // Post the message to Slack first so the ts is valid
    const messageTs = await postAsUser(env.INBOX_CHANNEL_ID, text);

    // Send signed event to the E2E worker with the real ts
    const response = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${marker}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: messageTs,
      },
    });

    expect(response.status).toBe(200);

    // Wait for real bot reply in thread via Slack API
    const botReply = await waitForBotReply(env.INBOX_CHANNEL_ID, messageTs, {
      timeout: 30000,
    });
    expect(botReply).toBeTruthy();
    // Reply should be substantive (not just an error)
    expect(botReply.text.length).toBeGreaterThan(20);
    // Should not be an error message
    expect(botReply.text).not.toMatch(/^_?Error|^_?Failed|exception/i);

    // Verify GitHub commit happened
    const commit = await poll(
      async () => {
        const commits = await getRecentCommits(5);
        return commits.find(c =>
          c.commit.message.includes(`evt_Ev_${marker}`)
        );
      },
      { timeout: 15000, description: 'GitHub commit for brain dump' }
    );
    expect(commit).toBeTruthy();
  }, 45000);
});
