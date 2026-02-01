/**
 * Ritual Rebuild: current.md updated after ritual commit
 *
 * Contract: After a ritual commits a plan to GitHub, current.md is
 * updated in the same atomic commit to include the new plan content.
 *
 * SYSTEM.md: "Rebuild current.md (new weekly plan appears in This Week's Plan section)"
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getHeadSha, getFileContent, poll, env,
} from '../helpers.js';

describe('Ritual rebuild', () => {
  const testId = `rebuild_${Date.now()}`;

  // 2 stub responses — REFLECT + SORT, just enough to get through to commit
  const claudeResponses = [
    // REFLECT: cognitive sorting (minimal)
    {
      json: {
        response: 'Sorted. What do you want to focus on?',
        captured: {
          insights: [],
          commitments: [],
          focus_areas: ['Rebuild test focus'],
        },
        ready_to_advance: true,
      },
    },
    // SORT: plan generation (minimal)
    {
      json: {
        response: 'Plan ready. Commit?',
        captured: {
          insights: [],
          commitments: ['Rebuild test commitment'],
          focus_areas: [],
        },
        ready_to_advance: true,
      },
    },
  ];

  beforeAll(async () => {
    await clearRecordings();
    await registerStubs(testId, { claude: claudeResponses });
  });

  async function sendWeeklyMessage(text, opts = {}) {
    const messageTs = opts.ts || `${Date.now() / 1000}`;
    return sendEvent({
      type: 'event_callback',
      event_id: opts.eventId || `Ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text,
        user: 'U_SYSTEM_TEST',
        channel: env.WEEKLY_CHANNEL_ID,
        ts: messageTs,
        ...(opts.threadTs && { thread_ts: opts.threadTs }),
      },
    });
  }

  test('current.md includes plan content after ritual commit', async () => {
    // Run ritual through REFLECT + SORT phases
    const kickoffTs = `${Date.now() / 1000}`;
    await sendWeeklyMessage(`start [test:${testId}]`, { ts: kickoffTs });

    const kickoffRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.args?.text?.includes('weekly review')
        );
      },
      { description: 'kickoff' }
    );
    const threadTs = kickoffRec.args.thread_ts || kickoffTs;
    let lastSeq = kickoffRec.seq;

    // REFLECT phase
    await new Promise(r => setTimeout(r, 200));
    await sendWeeklyMessage(`reflecting on this week [test:${testId}]`, { threadTs });

    const reflectRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r => r.method === 'chat.postMessage' && r.seq > lastSeq && r.args?.thread_ts === threadTs);
      },
      { description: 'REFLECT reply' }
    );
    lastSeq = reflectRec.seq;

    // SORT phase
    await new Promise(r => setTimeout(r, 200));
    await sendWeeklyMessage(`priorities for the week [test:${testId}]`, { threadTs });

    // Wait for auto-commit after SORT→PLAN (Plan Committed!)
    await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.seq > lastSeq &&
          r.args?.thread_ts === threadTs &&
          r.args?.text?.includes('Plan Committed')
        );
      },
      { description: 'auto-commit after SORT' }
    );

    // current.md is updated in the same atomic commit as the plan files.
    // Poll for our distinctive marker in current.md.
    const currentMd = await poll(
      async () => {
        const content = await getFileContent('data/current.md');
        if (content?.includes('Rebuild test')) return content;
        return null;
      },
      { description: 'current.md with plan content', timeout: 10000 }
    );
    expect(currentMd).toBeTruthy();
    expect(currentMd).toContain('Rebuild test focus');
    expect(currentMd).toContain('Rebuild test commitment');
  }, 30000);
});
