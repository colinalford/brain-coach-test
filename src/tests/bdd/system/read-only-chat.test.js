/**
 * Test 3: Read-only Chat
 *
 * SYSTEM.md: Question in #sb-inbox → answer in thread, NO GitHub writes.
 * When Claude returns zero tool_calls, the system should reply but not commit.
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getHeadSha, poll, env,
} from '../helpers.js';

describe('Read-only chat', () => {
  const testId = `ro_${Date.now()}`;

  beforeAll(async () => {
    await clearRecordings();

    // Claude returns zero tool_calls — read-only answer
    await registerStubs(testId, {
      claude: {
        json: {
          thinking: 'This is a question, answer from context only',
          tool_calls: [],
          slack_reply: `The answer is 42. [test:${testId}]`,
          needs_clarification: null,
        },
      },
    });
  });

  test('question → threaded reply, no GitHub commit', async () => {
    const headBefore = await getHeadSha();
    const messageTs = `${Date.now() / 1000}`;

    const response = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${testId}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `What is the meaning of life? [test:${testId}]`,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: messageTs,
      },
    });

    expect(response.status).toBe(200);

    // Wait for reply
    const replyRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes(testId)
        );
      },
      { description: `Slack reply containing ${testId}` }
    );
    expect(replyRec.args.text).toContain('42');
    expect(replyRec.args.thread_ts).toBe(messageTs);

    // Wait a moment, then verify HEAD didn't change
    await new Promise(r => setTimeout(r, 3000));
    const headAfter = await getHeadSha();
    expect(headAfter).toBe(headBefore);
  }, 15000); // Extra time for 3s no-write verification wait
});
