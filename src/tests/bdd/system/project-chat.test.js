/**
 * Test 7: Project Channel Chat
 *
 * SYSTEM.md: Message in #proj-{slug} → spread updated, reply threaded.
 *
 * NOTE: ProjectDO needs stub mode support. If this test fails because
 * ProjectDO calls real Claude/Slack instead of stubs, that's the fix.
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getRecentCommits, getFileContent, poll, env,
} from '../helpers.js';

// Channel created in test Slack workspace
const PROJECT_CHANNEL_ID = 'C0AD3P3PZ4Y';
const PROJECT_CHANNEL_NAME = 'proj-bdd-test';
const PROJECT_SLUG = 'bdd-test';

describe('Project channel chat', () => {
  const testId = `proj_chat_${Date.now()}`;

  beforeAll(async () => {
    await clearRecordings();

    // Register stub for Claude in project context
    // projectAgent expects: { thinking, spread_updates: [...], slack_reply }
    await registerStubs(testId, {
      claude: {
        json: {
          thinking: 'Project chat — update status section',
          spread_updates: [
            {
              section: 'Status',
              action: 'replace',
              content: `Active — updated from chat [test:${testId}]`,
            },
          ],
          slack_reply: `Updated project status. [test:${testId}]`,
        },
      },
    });
  });

  test('message in proj channel → spread updated, reply threaded', async () => {
    const messageTs = `${Date.now() / 1000}`;

    const response = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${testId}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `Update project status [test:${testId}]`,
        user: 'U_SYSTEM_TEST',
        channel: PROJECT_CHANNEL_ID,
        ts: messageTs,
      },
    });

    expect(response.status).toBe(200);

    // Wait for reply in thread
    const replyRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' && r.args?.text?.includes(testId)
        );
      },
      { description: `project reply containing ${testId}`, timeout: 10000 }
    );
    expect(replyRec.args.thread_ts).toBe(messageTs);

    // Wait for GitHub commit with spread update
    const traceId = `evt_Ev_${testId}`;
    const commit = await poll(
      async () => {
        const commits = await getRecentCommits(5);
        return commits.find(c => c.commit.message.includes(traceId));
      },
      { description: `commit for ${traceId}`, timeout: 10000 }
    );
    expect(commit).toBeTruthy();

    // No channel creation
    const recs = await getRecordings();
    expect(recs.filter(r => r.method === 'conversations.create')).toHaveLength(0);
  }, 20000);
});
