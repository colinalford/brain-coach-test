/**
 * Test 4: /what-matters
 *
 * SYSTEM.md: Read-only slash command. Returns priorities. No file writes.
 *
 * Strategy: First send a capture message (with test_id) so the DO's
 * context pack contains our test_id. Then send /what-matters — the stub
 * Claude client finds the test_id in the context pack userMessage.
 */

import {
  sendEvent, sendCommand, registerStubs, getRecordings, clearRecordings,
  getHeadSha, getRecentCommits, poll, env,
} from '../helpers.js';

describe('/what-matters command', () => {
  const seedId = `wm_seed_${Date.now()}`;
  const testId = `wm_${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  beforeAll(async () => {
    await clearRecordings();

    // Register stub for the seed capture (writes to context pack)
    await registerStubs(seedId, {
      claude: {
        json: {
          thinking: 'Seed message to plant test_id in context',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/current.md',
              heading: '## Open Loops',
              content: `- [ ] what-matters test marker [test:${testId}]`,
            },
          ],
          slack_reply: `Seeded. [test:${seedId}]`,
          needs_clarification: null,
        },
      },
    });

    // Register stub for /what-matters (will be found via test_id in context pack)
    // The stub Claude client's message() method returns response.text if present
    await registerStubs(testId, {
      claude: {
        text: `**Today's Calendar:**\n- No events\n\n**Top Priorities:**\n1. Test priority one\n2. Test priority two [test:${testId}]`,
      },
    });

    // Send seed message to plant test_id in the DO's context pack
    const seedResponse = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${seedId}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `Plant marker for what-matters [test:${seedId}]`,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(seedResponse.status).toBe(200);

    // Wait for the seed to be processed
    await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes(seedId)
        );
      },
      { description: 'seed message processed', timeout: 10000 }
    );
  });

  test('/what-matters returns priorities with no GitHub writes', async () => {
    await clearRecordings();
    const headBefore = await getHeadSha();

    const response = await sendCommand('/what-matters', `[test:${testId}]`);
    expect(response.status).toBe(200);

    // Wait for the response to be delivered via stub slack client
    const replyRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes('Priorities')
        );
      },
      { description: '/what-matters reply', timeout: 10000 }
    );
    expect(replyRec.args.text).toContain('What Matters Today');

    // No GitHub writes from what-matters (check no commit with its trace_id)
    await new Promise(r => setTimeout(r, 2000));
    const commits = await getRecentCommits(10);
    const wmCommits = commits.filter(c =>
      c.commit.message.includes('what-matters') || c.commit.message.includes(testId)
    );
    expect(wmCommits).toHaveLength(0);
  });
});
