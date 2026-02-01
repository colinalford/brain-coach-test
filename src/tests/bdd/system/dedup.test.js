/**
 * Test 5: Dedup
 *
 * SYSTEM.md invariant: Send the same event payload twice.
 * Assert exactly one commit and one Slack reply.
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getRecentCommits, poll, env,
} from '../helpers.js';

describe('Dedup', () => {
  const testId = `dup_${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  beforeAll(async () => {
    await clearRecordings();

    await registerStubs(testId, {
      claude: {
        json: {
          thinking: 'Simple capture for dedup test',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: `data/stream/${today}.md`,
              heading: '## Captures',
              content: `- dedup test item [test:${testId}]`,
            },
          ],
          slack_reply: `Captured dedup item. [test:${testId}]`,
          needs_clarification: null,
        },
      },
    });
  });

  test('same event_id sent twice → exactly one reply and one commit', async () => {
    // This test has a built-in 3s wait to verify no second processing occurs
    const eventId = `Ev_dedup_${Date.now()}`;
    const messageTs = `${Date.now() / 1000}`;

    const eventPayload = {
      type: 'event_callback',
      event_id: eventId,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `dedup test message [test:${testId}]`,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: messageTs,
      },
    };

    // Send the same event twice
    const [res1, res2] = await Promise.all([
      sendEvent(eventPayload),
      // Small delay to ensure the first one gets processed first
      new Promise(r => setTimeout(r, 200)).then(() => sendEvent(eventPayload)),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Wait for at least one reply
    await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes(testId)
        );
      },
      { description: `reply containing ${testId}` }
    );

    // Wait a bit for any second processing to complete
    await new Promise(r => setTimeout(r, 3000));

    // Assert exactly one reply with test_id
    const recs = await getRecordings();
    const replies = recs.filter(r =>
      r.method === 'chat.postMessage' && r.args?.text?.includes(testId)
    );
    expect(replies).toHaveLength(1);

    // Assert exactly one commit with trace_id
    const traceId = `evt_${eventId}`;
    const commits = await getRecentCommits(10);
    const matchingCommits = commits.filter(c => c.commit.message.includes(traceId));
    expect(matchingCommits).toHaveLength(1);
  }, 15000); // Needs extra time for 3s dedup verification wait
});
