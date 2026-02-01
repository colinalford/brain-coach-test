/**
 * Test 6: /project new
 *
 * SYSTEM.md: Creates project dir, spread.md, index entry,
 * Slack channel, invites bot+user.
 */

import {
  sendCommand, getRecordings, clearRecordings,
  getRecentCommits, getFileContent, poll, env,
} from '../helpers.js';

describe('/project new', () => {
  // Use short slug to avoid Slack 21-char channel name limit
  const suffix = Date.now().toString(36);
  const slug = `bdd-${suffix}`;
  const projectName = `BDD ${suffix}`;

  beforeAll(async () => {
    await clearRecordings();
  });

  test('creates spread.md, index entry, Slack channel', async () => {
    const response = await sendCommand('/project', `new ${projectName}`);
    expect(response.status).toBe(200);

    // Wait for confirmation message (delivered via stub Slack postMessage)
    const confirmRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.args?.text?.includes('Created project')
        );
      },
      { description: 'project creation confirmation', timeout: 15000 }
    );
    expect(confirmRec.args.text).toContain(projectName);

    // Verify GitHub: spread.md exists
    const spread = await poll(
      async () => getFileContent(`data/projects/${slug}/spread.md`),
      { description: 'spread.md in GitHub', timeout: 10000 }
    );
    expect(spread).toBeTruthy();
    expect(spread).toContain(projectName);
    expect(spread).toContain('## Status');

    // Verify GitHub: index.md updated
    const index = await getFileContent('data/projects/index.md');
    expect(index).toContain(slug);

    // Verify Slack recordings
    const recs = await getRecordings();

    // Channel created
    const channelCreate = recs.find(r =>
      r.method === 'conversations.create' &&
      r.args?.name === `proj-${slug}`
    );
    expect(channelCreate).toBeTruthy();

    // Users invited
    const invite = recs.find(r => r.method === 'conversations.invite');
    expect(invite).toBeTruthy();

    // Exactly one GitHub commit for this operation (atomic)
    const commits = await getRecentCommits(5);
    const projectCommits = commits.filter(c =>
      c.commit.message.includes(projectName)
    );
    expect(projectCommits).toHaveLength(1);
  }, 20000); // Longer timeout: real GitHub + Slack operations
});
