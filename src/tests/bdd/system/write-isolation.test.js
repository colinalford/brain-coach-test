/**
 * Test 10: Write Isolation
 *
 * SYSTEM.md Invariant: Tool calls that attempt to write outside data/ are
 * rejected. If any write in a set is invalid, the ENTIRE commit is aborted.
 *
 * Strategy: Register a Claude stub that returns tool_calls with a path
 * outside data/ (e.g., ../secrets.md). Verify no GitHub commit is created
 * and the Slack reply is still delivered (error is gracefully handled).
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getRecentCommits, poll, env,
} from '../helpers.js';

describe('Write isolation', () => {
  const testId = `isolation_${Date.now()}`;

  beforeAll(async () => {
    await clearRecordings();

    // Register stub with an invalid path — outside data/
    await registerStubs(testId, {
      claude: {
        json: {
          thinking: 'Write isolation test — trying to escape data/',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: '../secrets.md',
              heading: '## Secrets',
              content: 'This should never be written',
            },
          ],
          slack_reply: `Attempted write outside data/. [test:${testId}]`,
          needs_clarification: null,
        },
      },
    });
  });

  test('tool call with path outside data/ → no commit, reply still delivered', async () => {
    const messageTs = `${Date.now() / 1000}`;

    const response = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${testId}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `test escape [test:${testId}]`,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: messageTs,
      },
    });

    expect(response.status).toBe(200);

    // Wait for the Slack reply (should still be delivered even though write failed)
    const replyRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes(testId)
        );
      },
      { description: 'slack reply', timeout: 10000 }
    );
    expect(replyRec).toBeTruthy();

    // Verify no commit was created for this test (check recent commits)
    await new Promise(r => setTimeout(r, 3000));
    const commits = await getRecentCommits(10);
    const isolationCommits = commits.filter(c =>
      c.commit.message.includes(testId) || c.commit.message.includes('secrets')
    );
    expect(isolationCommits).toHaveLength(0);
  }, 20000);

  test('mixed valid + invalid writes → entire commit aborted', async () => {
    const testId2 = `isolation2_${Date.now()}`;
    await clearRecordings();

    // Register stub with BOTH a valid and an invalid write
    await registerStubs(testId2, {
      claude: {
        json: {
          thinking: 'Mixed write isolation — one valid, one invalid',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: `data/stream/${new Date().toISOString().split('T')[0]}.md`,
              heading: '## Captures',
              content: `- 10:00 | Should not be written [test:${testId2}]`,
            },
            {
              tool: 'append_to_section',
              path: 'src/evil.js',
              heading: '## Evil',
              content: 'This is outside data/',
            },
          ],
          slack_reply: `Mixed write test done. [test:${testId2}]`,
          needs_clarification: null,
        },
      },
    });

    const messageTs = `${Date.now() / 1000}`;
    const response = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${testId2}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `mixed write test [test:${testId2}]`,
        user: 'U_SYSTEM_TEST',
        channel: env.INBOX_CHANNEL_ID,
        ts: messageTs,
      },
    });

    expect(response.status).toBe(200);

    // Wait for reply
    await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes(testId2)
        );
      },
      { description: 'slack reply for mixed write', timeout: 10000 }
    );

    // Verify no commit for this test (both valid and invalid should be aborted)
    await new Promise(r => setTimeout(r, 3000));
    const commits = await getRecentCommits(10);
    const mixedCommits = commits.filter(c =>
      c.commit.message.includes(testId2) || c.commit.message.includes('evil')
    );
    expect(mixedCommits).toHaveLength(0);
  }, 20000);
});
