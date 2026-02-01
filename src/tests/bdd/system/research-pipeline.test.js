/**
 * Test 9: Research Pipeline
 *
 * SYSTEM.md: /project research → multi-step pipeline → threaded Slack messages + GitHub persistence.
 *
 * Strategy: Send a message containing "research" to a project channel.
 * Register sequential Claude stubs for each pipeline stage (plan, evaluate,
 * synthesize, quality check) and a Tavily stub for search results.
 * Verify: threaded Slack messages, research log file, stream entry, spread update.
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getRecentCommits, getFileContent, poll, env,
} from '../helpers.js';

const PROJECT_CHANNEL_ID = 'C0AD3P3PZ4Y';

describe('Research pipeline', () => {
  const testId = `research_${Date.now()}`;

  beforeAll(async () => {
    await clearRecordings();

    // Register sequential Claude stubs for the research pipeline.
    // The pipeline makes 5 messageJson calls in order:
    // 1. handleResearchRequest (project-agent) → extract query
    // 2. planResearch → generate search plan
    // 3. evaluateResults → check completeness
    // 4. synthesizeWithContext → produce synthesis
    // 5. qualityCheck → score the synthesis
    await registerStubs(testId, {
      claude: [
        // 1. Extract research query (handleResearchRequest)
        {
          json: {
            query: `best practices for testing [test:${testId}]`,
            scope: 'Testing methodologies',
          },
        },
        // 2. Plan research (planResearch)
        {
          json: {
            queries: [`testing best practices [test:${testId}]`],
            format: 'structured summary',
            completeness_criteria: ['covers unit testing', 'covers integration testing'],
          },
        },
        // 3. Evaluate results — mark as complete to avoid gap-filling
        {
          json: {
            complete: true,
            missing: [],
            gap_queries: [],
          },
        },
        // 4. Synthesize findings
        {
          json: {
            summary: `Research synthesis on testing best practices. [test:${testId}]`,
            key_points: ['Unit tests catch bugs early', 'Integration tests verify wiring'],
            recommendations: ['Write tests first', 'Use BDD approach'],
            sources_to_cite: ['https://example.com/testing-guide'],
          },
        },
        // 5. Quality check — pass with good score
        {
          json: {
            score: 0.9,
            issues: [],
          },
        },
      ],
      tavily: {
        results: [
          {
            url: 'https://example.com/testing-guide',
            title: 'Testing Best Practices Guide',
            content: `A comprehensive guide to testing best practices. [test:${testId}]`,
            score: 0.95,
          },
        ],
        answer: 'Testing best practices include writing unit tests and integration tests.',
      },
    });
  });

  test('research message → threaded progress + synthesis + GitHub persistence', async () => {
    const messageTs = `${Date.now() / 1000}`;

    const response = await sendEvent({
      type: 'event_callback',
      event_id: `Ev_${testId}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `research best practices for testing [test:${testId}]`,
        user: 'U_SYSTEM_TEST',
        channel: PROJECT_CHANNEL_ID,
        ts: messageTs,
      },
    });

    expect(response.status).toBe(200);

    // Wait for research completion — look for the synthesis message
    const synthesisRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.args?.text?.includes('Research Complete')
        );
      },
      { description: 'research synthesis message', timeout: 15000 }
    );
    expect(synthesisRec).toBeTruthy();

    // Verify all messages are threaded
    const recs = await getRecordings();
    const slackMessages = recs.filter(r =>
      r.method === 'chat.postMessage' && r.args?.channel === PROJECT_CHANNEL_ID
    );
    // Expect at least: research kickoff + progress ("Searching N angles...") + synthesis
    expect(slackMessages.length).toBeGreaterThanOrEqual(3);
    // All messages should be threaded
    for (const msg of slackMessages) {
      expect(msg.args.thread_ts).toBeTruthy();
    }

    // Verify GitHub persistence — research log file
    const commits = await poll(
      async () => {
        const recent = await getRecentCommits(10);
        return recent.filter(c =>
          c.commit.message.includes('Research') || c.commit.message.includes('research')
        );
      },
      { description: 'research commits', timeout: 10000 }
    );
    expect(commits.length).toBeGreaterThanOrEqual(1);

    // Verify stream entry was written
    const today = new Date().toISOString().split('T')[0];
    const stream = await poll(
      async () => getFileContent(`data/stream/${today}.md`),
      { description: 'stream file', timeout: 10000 }
    );
    expect(stream).toBeTruthy();
    expect(stream).toContain('[research]');

    // No channel creation
    const channelCreations = recs.filter(r => r.method === 'conversations.create');
    expect(channelCreations).toHaveLength(0);
  }, 30000);
});
