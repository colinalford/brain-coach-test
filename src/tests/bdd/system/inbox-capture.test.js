/**
 * Test 2: Inbox Quick Capture
 *
 * SYSTEM.md: Quick input in #sb-inbox → stream entry written,
 * Slack reply posted, :brain: reaction added.
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getHeadSha, getRecentCommits, poll, env,
} from '../helpers.js';

describe('Inbox quick capture', () => {
  const testId = `cap_${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  beforeAll(async () => {
    await clearRecordings();

    await registerStubs(testId, {
      claude: {
        json: {
          thinking: 'Simple dentist appointment capture',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: `data/stream/${today}.md`,
              heading: '## Captures',
              content: `- 14:30 | dentist Saturday 3pm [test:${testId}]`,
            },
          ],
          slack_reply: `Got it — dentist Saturday at 3pm. [test:${testId}]`,
          needs_clarification: null,
        },
      },
    });
  });

  test('captures message → :brain: reaction, threaded reply, GitHub commit', async () => {
    const messageTs = `${Date.now() / 1000}`;

    const eventPayload = {
      type: 'event_callback',
      event_id: `Ev_${testId}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `dentist Saturday 3pm [test:${testId}]`,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: messageTs,
      },
    };

    const response = await sendEvent(eventPayload);
    expect(response.status).toBe(200);

    // Wait for :brain: reaction
    const reactionRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r => r.method === 'reactions.add' && r.args?.name === 'brain');
      },
      { description: ':brain: reaction' }
    );
    expect(reactionRec.args.name).toBe('brain');

    // Wait for threaded reply
    const replyRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes(testId)
        );
      },
      { description: `Slack reply containing ${testId}` }
    );
    expect(replyRec.args.text).toContain(testId);
    expect(replyRec.args.thread_ts).toBe(messageTs);

    // Wait for GitHub commit
    const traceId = `evt_Ev_${testId}`;
    const commit = await poll(
      async () => {
        const commits = await getRecentCommits(5);
        return commits.find(c => c.commit.message.includes(traceId));
      },
      { description: `GitHub commit with ${traceId}` }
    );
    expect(commit).toBeTruthy();

    // No channel creation for simple capture
    const recs = await getRecordings();
    const channelCreates = recs.filter(r => r.method === 'conversations.create');
    expect(channelCreates).toHaveLength(0);
  });
});
