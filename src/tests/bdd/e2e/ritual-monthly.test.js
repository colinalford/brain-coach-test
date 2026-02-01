/**
 * E2E: Monthly Ritual Full Flow
 *
 * Drive a complete monthly ritual in #sb-monthly with real Claude, real Slack.
 * Post kickoff → user reflection → system sorts → user clarifies → commit
 * → verify plan in GitHub.
 *
 * Assertions:
 * - Bot replies substantively at each phase (threaded, not errors)
 * - After commit, monthly plan file exists in GitHub with real content
 */

import {
  sendEvent, waitForBotReply, getFileContent, poll, env,
} from './helpers.js';

async function postMessage(channel, text, opts = {}) {
  const body = { channel, text };
  if (opts.threadTs) body.thread_ts = opts.threadTs;
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack postMessage failed: ${data.error}`);
  return data.ts;
}

function waitForBotReplyAfter(channel, threadTs, afterTs, opts = {}) {
  return poll(
    async () => {
      const res = await fetch(
        `https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}`,
        { headers: { 'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}` } },
      );
      const data = await res.json();
      const msgs = data.messages || [];
      return msgs.find(m =>
        parseFloat(m.ts) > parseFloat(afterTs) &&
        (m.bot_id || m.user === env.SLACK_BOT_USER_ID)
      );
    },
    { timeout: opts.timeout || 45000, interval: 3000, description: opts.description || 'bot reply' },
  );
}

describe('E2E: Monthly ritual full flow', () => {
  test('full monthly ritual → plan committed to GitHub', async () => {
    const ch = env.MONTHLY_CHANNEL_ID;
    const marker = `e2e_monthly_${Date.now()}`;

    // --- Step 1: Kickoff ---
    const kickoffTs = await postMessage(ch, `Start monthly review ${marker}`);

    await sendEvent({
      type: 'event_callback',
      event_id: `Ev_kickoff_${marker}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: `Start monthly review ${marker}`,
        user: 'U_SYSTEM_TEST',
        channel: ch,
        ts: kickoffTs,
      },
    });

    const kickoffReply = await waitForBotReply(ch, kickoffTs, { timeout: 30000 });
    expect(kickoffReply).toBeTruthy();
    expect(kickoffReply.text.length).toBeGreaterThan(20);
    expect(kickoffReply.text).not.toMatch(/^_?Error|^_?Failed|exception/i);

    const threadTs = kickoffTs;

    // --- Step 2: REFLECT — user writes free-flowing monthly reflection ---
    await new Promise(r => setTimeout(r, 2000));

    const reflectionText = 'This month was overwhelming. Work consumed everything — long hours on the API migration. Health took a backseat. I did start seeing a new therapist which feels like progress. Engineering lead role dominated. Dad role suffered — missed two soccer games. Exercise goal totally failed. The therapy goal is new but going well. Keep: finish API migration, therapy sessions. Drop: the blog rewrite.';
    const reflectTs = await postMessage(ch, reflectionText, { threadTs });

    await sendEvent({
      type: 'event_callback',
      event_id: `Ev_reflect_${marker}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: reflectionText,
        user: 'U_SYSTEM_TEST',
        channel: ch,
        ts: reflectTs,
        thread_ts: threadTs,
      },
    });

    const reflectReply = await waitForBotReplyAfter(ch, threadTs, reflectTs, {
      timeout: 45000,
      description: 'REFLECT phase reply (cognitive sorting)',
    });
    expect(reflectReply).toBeTruthy();
    expect(reflectReply.text.length).toBeGreaterThan(30);
    expect(reflectReply.text).not.toMatch(/^_?Error|^_?Failed|exception/i);

    // --- Step 3: SORT — user clarifies priorities for next month ---
    await new Promise(r => setTimeout(r, 2000));

    const prioritiesText = 'February focus: finish API migration by mid-month, then protect personal time. Commit to gym 2x/week. Keep therapy weekly. Start tax prep before March. Performance reviews due March 1 — need to start drafts.';
    const sortTs = await postMessage(ch, prioritiesText, { threadTs });

    await sendEvent({
      type: 'event_callback',
      event_id: `Ev_sort_${marker}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: prioritiesText,
        user: 'U_SYSTEM_TEST',
        channel: ch,
        ts: sortTs,
        thread_ts: threadTs,
      },
    });

    const sortReply = await waitForBotReplyAfter(ch, threadTs, sortTs, {
      timeout: 45000,
      description: 'SORT phase reply (plan generation)',
    });
    expect(sortReply).toBeTruthy();
    expect(sortReply.text.length).toBeGreaterThan(30);
    expect(sortReply.text).not.toMatch(/^_?Error|^_?Failed|exception/i);

    // SORT reply should auto-commit (Plan Committed!)
    expect(sortReply.text.toLowerCase()).toMatch(/commit|saved|plan/);

    // --- Step 4: Correction — user tweaks the plan ---
    await new Promise(r => setTimeout(r, 2000));

    const correctionText = 'Actually, also add: schedule Audie\'s vet appointment this week.';
    const correctionTs = await postMessage(ch, correctionText, { threadTs });

    await sendEvent({
      type: 'event_callback',
      event_id: `Ev_correction_${marker}`,
      team_id: 'T_TEST',
      event: {
        type: 'message',
        text: correctionText,
        user: 'U_SYSTEM_TEST',
        channel: ch,
        ts: correctionTs,
        thread_ts: threadTs,
      },
    });

    const correctionReply = await waitForBotReplyAfter(ch, threadTs, correctionTs, {
      timeout: 45000,
      description: 'correction auto-commit',
    });
    expect(correctionReply).toBeTruthy();
    expect(correctionReply.text).not.toMatch(/^_?Error|^_?Failed|exception/i);

    // Correction reply should indicate plan was updated
    expect(correctionReply.text.toLowerCase()).toMatch(/update|commit|saved|plan/);

    // --- Step 5: Verify plan in GitHub ---
    const now = new Date();
    const monthId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const monthlyPlan = await poll(
      async () => {
        const content = await getFileContent(`data/planning/monthly/${monthId}.md`);
        // Must have real content (not just a header)
        return content && content.length > 50 ? content : null;
      },
      { timeout: 20000, interval: 3000, description: 'monthly plan file in GitHub' },
    );
    expect(monthlyPlan).toBeTruthy();

  }, 180000); // 3 minute timeout for full multi-turn ritual with real Claude
});
