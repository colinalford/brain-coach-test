/**
 * Weekly Ritual Full Flow
 *
 * Contract: User goes through the ritual with realistic messages.
 * REFLECT phase: user reflects, Claude does cognitive sorting.
 * SORT phase: user clarifies priorities, Claude generates plan → auto-committed.
 * Correction: user tweaks the plan, Claude revises → auto-committed.
 *
 * Phases: REFLECT → SORT → auto-commit → correction → auto-commit
 */

import {
  sendEvent, registerStubs, getRecordings, clearRecordings,
  getFileContent, poll, env,
} from '../helpers.js';

// Compute weekId the same way the worker does (ISO week in America/New_York)
function getWeekId() {
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
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

describe('Weekly ritual full flow', () => {
  const testId = `wkritual_${Date.now()}`;
  const weekId = getWeekId();

  // Claude stub responses — one per phase that hits Claude.
  // REFLECT: cognitive sorting of user's reflection
  // SORT: plan generation from user's priorities → auto-committed
  // PLAN (correction): revised plan after user tweak → auto-committed
  const claudeResponses = [
    // REFLECT phase: user reflects, Claude does cognitive sorting
    {
      json: {
        response: `Here's the picture from your reflection:\n\n**On Track:** Engineering is going well. **Slipping:** Health — no gym, no PCP yet. **New:** Dog needs vet visit.\n\nWhat do you want to carry forward and prioritize this week?`,
        captured: {
          insights: ['Engineering strong', 'Health slipping'],
          commitments: [],
          focus_areas: ['Engineering leadership', 'Dog dad - more walks'],
        },
        ready_to_advance: true,
      },
    },
    // SORT phase: user clarifies priorities, Claude generates plan
    {
      json: {
        response: `**Weekly Plan:**\n\n**Theme:** Stabilize and protect what matters\n**Focus Areas:** Health management, Work deliverables\n**Commitments:**\n- 1hr PCP research\n- Start performance review drafts\n- Book vet for Audie\n\nWant to adjust anything, or is this ready to commit?`,
        captured: {
          insights: [],
          commitments: ['1hr PCP research', 'Start performance review drafts', 'Book vet for Audie'],
          focus_areas: ['Health management', 'Work deliverables'],
          kept_loops: ['Vet visit for Audie', 'Performance reviews due March 1'],
          theme: 'Stabilize and protect what matters',
        },
        ready_to_advance: true,
      },
    },
    // PLAN correction: user changes gym commitment, Claude revises
    {
      json: {
        response: `**Updated Weekly Plan:**\n\n**Theme:** Stabilize and protect what matters\n**Commitments:**\n- 1hr PCP research\n- Start performance review drafts\n- Book vet for Audie\n- Walk Audie every morning\n\nPlan updated.`,
        captured: {
          insights: [],
          commitments: ['Walk Audie every morning'],
          focus_areas: [],
          kept_loops: [],
        },
        ready_to_advance: true,
      },
    },
  ];

  beforeAll(async () => {
    await clearRecordings();
    await registerStubs(testId, {
      claude: claudeResponses,
    });
  });

  /** Send a message to #sb-weekly */
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

  test('full ritual flow → plan auto-committed, correction updates plan', async () => {
    // Step 1: Send initial message to start ritual (no thread yet)
    const kickoffTs = `${Date.now() / 1000}`;
    const kickoffRes = await sendWeeklyMessage(
      `Starting weekly review [test:${testId}]`,
      { ts: kickoffTs }
    );
    expect(kickoffRes.status).toBe(200);

    // Wait for kickoff reply (the template with roles/goals)
    const kickoffRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.args?.text?.includes('weekly review')
        );
      },
      { description: 'kickoff message' }
    );
    expect(kickoffRec.args.text).toContain('weekly review');
    const threadTs = kickoffRec.args.thread_ts || kickoffTs;
    let lastSeq = kickoffRec.seq;

    // Step 2: REFLECT phase — user reflects on the week
    await new Promise(r => setTimeout(r, 300));
    const reflectRes = await sendWeeklyMessage(
      `I'm tired but okay. Work is going well — shipped two features. Health is bad, no gym, no PCP. Audie needs a vet visit. [test:${testId}]`,
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

    // Step 3: SORT phase — user clarifies priorities → auto-commits after SORT→PLAN
    await new Promise(r => setTimeout(r, 300));
    const sortRes = await sendWeeklyMessage(
      `This week: 1hr PCP research, start performance review drafts, book vet for Audie. That's enough. [test:${testId}]`,
      { threadTs }
    );
    expect(sortRes.status).toBe(200);

    // Wait for auto-commit reply (Plan Committed!)
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
    expect(commitRec.args.text).toContain('Plan Committed');
    lastSeq = commitRec.seq;

    // Step 4: Correction — user adds a commitment, plan auto-updates
    await new Promise(r => setTimeout(r, 300));
    const correctionRes = await sendWeeklyMessage(
      `Actually, also add walking Audie every morning. [test:${testId}]`,
      { threadTs }
    );
    expect(correctionRes.status).toBe(200);

    // Wait for update confirmation (Plan Updated!)
    const updateRec = await poll(
      async () => {
        const recs = await getRecordings();
        return recs.find(r =>
          r.method === 'chat.postMessage' &&
          r.seq > lastSeq &&
          r.args?.thread_ts === threadTs &&
          r.args?.text?.includes('Plan Updated')
        );
      },
      { description: 'correction auto-commit' }
    );
    expect(updateRec.args.text).toContain('Plan Updated');

    // Step 5: Verify plan file has correction content (Walk Audie)
    const plan = await poll(
      async () => {
        const content = await getFileContent(`data/planning/weekly/${weekId}.md`);
        return content?.includes('Walk Audie every morning') ? content : null;
      },
      { description: 'weekly plan with correction content', timeout: 15000 }
    );
    expect(plan).toBeTruthy();
    expect(plan).toContain('Focus Areas');
    expect(plan).toContain('Commitments');

    // Step 6: Verify log file in GitHub
    const log = await poll(
      async () => {
        const content = await getFileContent(`data/planning/weekly/${weekId}-log.md`);
        return content?.includes('Conversation') ? content : null;
      },
      { description: 'weekly log with Conversation', timeout: 10000 }
    );
    expect(log).toBeTruthy();

    // Step 7: Verify all messages were threaded
    const allRecs = await getRecordings();
    const threadedReplies = allRecs.filter(r =>
      r.method === 'chat.postMessage' &&
      r.args?.thread_ts === threadTs
    );
    // kickoff + REFLECT reply + auto-commit + correction update = 4
    expect(threadedReplies.length).toBeGreaterThanOrEqual(4);
  }, 45000);
});
