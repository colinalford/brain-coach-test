/**
 * E2E 2: Research in Project Context
 *
 * Trigger research from inside a #proj-* channel. Real Claude + real Tavily.
 *
 * Assertions:
 * - Slack: threaded progress + synthesis in the project channel
 * - GitHub: research log in data/projects/{slug}/logs/
 */

import {
  sendEvent, waitForBotReply, getRecentCommits, env, poll,
} from './helpers.js';

const PROJECT_CHANNEL_ID = 'C0AD3P3PZ4Y';  // #proj-bdd-test

/**
 * Post a message to Slack and return the ts.
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

describe('E2E: Research in project context', () => {
  test('research message in proj channel → threaded synthesis + GitHub log', async () => {
    const marker = `e2e_research_${Date.now()}`;
    const text = `research best testing frameworks for Node.js ${marker}`;

    // Post real message to project channel
    const messageTs = await postMessage(PROJECT_CHANNEL_ID, text);

    // Send signed event to E2E worker
    const response = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${marker}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text,
        user: 'U_SYSTEM_TEST',
        channel: PROJECT_CHANNEL_ID,
        ts: messageTs,
      },
    });

    expect(response.status).toBe(200);

    // Wait for bot reply in thread — research takes longer due to Tavily + Claude
    const botReply = await waitForBotReply(PROJECT_CHANNEL_ID, messageTs, {
      timeout: 45000,
      interval: 3000,
    });
    expect(botReply).toBeTruthy();
    expect(botReply.text.length).toBeGreaterThan(30);
    expect(botReply.text).not.toMatch(/^_?Error|^_?Failed|exception/i);

    // Verify GitHub has research-related commits (research pipeline has multiple steps)
    const commit = await poll(
      async () => {
        const commits = await getRecentCommits(20);
        return commits.find(c =>
          c.commit.message.toLowerCase().includes('research')
        );
      },
      { timeout: 30000, interval: 3000, description: 'research commit' }
    );
    expect(commit).toBeTruthy();
  }, 60000);
});
