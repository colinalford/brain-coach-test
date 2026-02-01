/**
 * Monthly Ritual Full Flow
 *
 * Contract: Monthly ritual produces:
 * 1. Monthly plan at data/planning/monthly/{YYYY-MM}.md
 * 2. Week 1 plan at data/planning/weekly/{weekId}.md
 * 3. Log at data/planning/monthly/{YYYY-MM}-log.md
 *
 * Phases: REFLECT → SORT → auto-commit
 * SYSTEM.md: "First Sunday of month: monthly review covers weekly concerns"
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getFileContent, poll, env,
} from '../helpers.js';

// Compute monthId and weekId matching the worker's timezone.js
function getIds() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value;
  const year = parseInt(get('year'));
  const month = parseInt(get('month'));
  const day = parseInt(get('day'));

  const monthId = `${year}-${String(month).padStart(2, '0')}`;

  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const weekId = `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, '0')}`;

  return { monthId, weekId };
}

describe('Monthly ritual full flow', () => {
  const testId = `moritual_${Date.now()}`;
  const { monthId, weekId } = getIds();

  // 2 Claude responses: REFLECT (cognitive sorting) + SORT (plan generation)
  const claudeResponses = [
    // REFLECT: cognitive sorting of monthly reflection
    {
      json: {
        response: 'January was intense — overwork, medical struggles, but seeds planted. Work dominated, health slipped. PCP search is the keystone that unlocks everything else. What do you want to carry into February?',
        captured: {
          insights: ['Burnout pattern from overwork', 'PCP is the keystone'],
          commitments: ['1hr/week PCP research'],
          focus_areas: ['Health advocate', 'Dog dad'],
        },
        ready_to_advance: true,
      },
    },
    // SORT: plan generation from priorities
    {
      json: {
        response: '**Monthly Plan:**\n\n**Theme:** Stabilize and protect what matters\n**Focus Areas:** Routine building, Work deliverables\n**Commitments:**\n- Start Saturday strength training\n- Pivot Dana sessions to daily routines\n- Write performance reviews by March 1\n\nWant to adjust, or commit?',
        captured: {
          insights: [],
          commitments: ['Start Saturday strength training', 'Pivot Dana sessions to daily routines', 'Write performance reviews by March 1'],
          focus_areas: ['Routine building', 'Work deliverables'],
          kept_loops: ['Performance reviews', 'Vet visit for Audie', 'Taxes (April)'],
          theme: 'Stabilize and protect what matters',
        },
        ready_to_advance: true,
      },
    },
  ];

  beforeAll(async () => {
    await clearRecordings();
    await registerStubs(testId, { claude: claudeResponses });
  });

  async function sendMonthlyMessage(text, opts = {}) {
    const messageTs = opts.ts || `${Date.now() / 1000}`;
    return sendEvent({
      type: 'event_callback',
      event_id: opts.eventId || `Ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text,
        user: 'U_SYSTEM_TEST',
        channel: env.MONTHLY_CHANNEL_ID,
        ts: messageTs,
        ...(opts.threadTs && { thread_ts: opts.threadTs }),
      },
    });
  }

  test('monthly ritual → monthly plan + week 1 plan + log in GitHub', async () => {
    // Step 1: Start ritual
    const kickoffTs = `${Date.now() / 1000}`;
    const kickoffRes = await sendMonthlyMessage(
      `Start monthly review [test:${testId}]`,
      { ts: kickoffTs }
    );
    expect(kickoffRes.status).toBe(200);

    // Wait for kickoff
    const kickoffRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.args?.text?.includes('monthly review')
        );
      },
      { description: 'kickoff message' }
    );
    const threadTs = kickoffRec.args.thread_ts || kickoffTs;
    let lastSeq = kickoffRec.seq;

    // Step 2: REFLECT — user reflects on the month
    await new Promise(r => setTimeout(r, 300));
    const reflectRes = await sendMonthlyMessage(
      `Hard month. Overwork, medical struggles, but started medication. Need to be a better dog dad. PCP search is the priority. [test:${testId}]`,
      { threadTs }
    );
    expect(reflectRes.status).toBe(200);

    const reflectRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.seq > lastSeq &&
          r.args?.thread_ts === threadTs
        );
      },
      { description: 'REFLECT phase reply' }
    );
    lastSeq = reflectRec.seq;

    // Step 3: SORT — user clarifies priorities for next month
    await new Promise(r => setTimeout(r, 300));
    const sortRes = await sendMonthlyMessage(
      `February: stabilize routines, PCP, performance reviews, restart exercise. [test:${testId}]`,
      { threadTs }
    );
    expect(sortRes.status).toBe(200);

    // Wait for auto-commit reply after SORT→PLAN (Plan Committed!)
    const commitRec = await poll(
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

    // Step 5: Verify monthly plan in GitHub (poll for stub-specific content)
    const monthlyPlan = await poll(
      async () => {
        const content = await getFileContent(`data/planning/monthly/${monthId}.md`);
        return content?.includes('Routine building') ? content : null;
      },
      { description: 'monthly plan with stub content', timeout: 15000 }
    );
    expect(monthlyPlan).toBeTruthy();
    expect(monthlyPlan).toContain('Focus Areas');
    expect(monthlyPlan).toContain('Commitments');

    // Step 6: Verify week 1 plan in GitHub
    const weekPlan = await poll(
      async () => {
        const content = await getFileContent(`data/planning/weekly/${weekId}.md`);
        return content?.includes('Derived from monthly') ? content : null;
      },
      { description: 'week 1 plan file', timeout: 10000 }
    );
    expect(weekPlan).toBeTruthy();

    // Step 7: Verify log in GitHub
    const log = await poll(
      async () => {
        const content = await getFileContent(`data/planning/monthly/${monthId}-log.md`);
        return content?.includes('Conversation') ? content : null;
      },
      { description: 'monthly log with Conversation', timeout: 10000 }
    );
    expect(log).toBeTruthy();
  }, 30000);
});
