/**
 * Test 11: Thread Conversation Context
 *
 * SYSTEM.md: Reply in thread → system fetches thread history and uses
 * it as context for the LLM.
 *
 * Strategy:
 * 1. Send initial message → get reply
 * 2. Send thread reply (with thread_ts) → verify system fetches thread
 *    history (conversations.replies recorded) and reply stays threaded.
 *
 * Note: Stub Slack client returns [] for getThreadReplies(), so thread
 * context will be empty. We verify the system ATTEMPTS to fetch thread
 * history and that the reply is properly threaded.
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  poll, env,
} from '../helpers.js';

describe('Thread conversation context', () => {
  const testId1 = `thread1_${Date.now()}`;
  const testId2 = `thread2_${Date.now()}`;

  beforeAll(async () => {
    await clearRecordings();

    // Register stubs for both messages
    await registerStubs(testId1, {
      claude: {
        json: {
          thinking: 'Initial message in thread context test',
          tool_calls: [],
          slack_reply: `Got the first message. [test:${testId1}]`,
          needs_clarification: null,
        },
      },
    });

    await registerStubs(testId2, {
      claude: {
        json: {
          thinking: 'Thread reply — should have thread context',
          tool_calls: [],
          slack_reply: `Got the follow-up in thread. [test:${testId2}]`,
          needs_clarification: null,
        },
      },
    });
  });

  test('thread reply → system fetches history, reply stays threaded', async () => {
    // Step 1: Send initial message
    const initialTs = `${Date.now() / 1000}`;
    const initialRes = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${testId1}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `Start a conversation [test:${testId1}]`,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: initialTs,
      },
    });
    expect(initialRes.status).toBe(200);

    // Wait for first reply
    const firstReply = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes(testId1)
        );
      },
      { description: 'first reply', timeout: 10000 }
    );
    expect(firstReply.args.thread_ts).toBe(initialTs);
    const lastSeqAfterFirst = firstReply.seq;

    // Step 2: Send thread reply using the original message's ts as thread_ts
    await new Promise(r => setTimeout(r, 500));
    const replyTs = `${Date.now() / 1000}`;
    const threadRes = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${testId2}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `Follow up on that conversation [test:${testId2}]`,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: replyTs,
        thread_ts: initialTs, // This is a thread reply
      },
    });
    expect(threadRes.status).toBe(200);

    // Wait for second reply
    const secondReply = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.args?.text?.includes(testId2) &&
          r.seq > lastSeqAfterFirst
        );
      },
      { description: 'thread reply', timeout: 10000 }
    );

    // Verify: reply is threaded to the SAME thread
    expect(secondReply.args.thread_ts).toBe(initialTs);

    // Verify: system attempted to fetch thread history
    const recs = await getRecordings();
    const threadFetches = recs.filter(r =>
      r.method === 'conversations.replies' &&
      r.args?.ts === initialTs
    );
    expect(threadFetches.length).toBeGreaterThanOrEqual(1);
  }, 20000);
});
