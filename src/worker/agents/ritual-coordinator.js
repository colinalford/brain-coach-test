/**
 * Ritual Coordinator - Sub-agent for weekly/monthly ritual sessions.
 *
 * Manages ritual conversations following a structured review flow:
 * 1. REFLECT - User reflects freely on the period; system does cognitive sorting
 * 2. SORT - User clarifies priorities; system generates a plan
 * 3. PLAN - User refines or commits the plan
 */

/**
 * Ritual phases in order.
 */
export const RITUAL_PHASES = {
  REFLECT: 'reflect',
  SORT: 'sort',
  PLAN: 'plan',
};

/**
 * Initialize a new ritual session.
 *
 * Builds a kickoff message that presents the user's roles, goals, and open
 * loops, then asks for a free-flowing reflection on the past period.
 *
 * @param {string} ritualType - 'weekly' or 'monthly'
 * @param {Object} context - Identity context
 * @param {string[]} [context.roles] - User's roles
 * @param {string[]} [context.goals] - User's goals
 * @param {string[]} [context.openLoops] - Current open loops
 * @param {Object} deps - Dependencies
 * @param {Object} deps.logger - Logger instance
 * @returns {Object} Initial session state and kickoff message
 */
export function initializeRitual(ritualType, context = {}, { logger }) {
  logger.info('Initializing ritual session', { ritualType });

  const periodLabel = ritualType === 'monthly' ? 'month' : 'week';

  const sessionState = {
    ritualType,
    phase: RITUAL_PHASES.REFLECT,
    messages: [],
    commitments: {
      rolesFocus: [],
      goalPriorities: [],
      keptLoops: [],
      weekCommitments: [],
      theme: null,
    },
    context: {
      roles: context.roles || [],
      goals: context.goals || [],
      openLoops: context.openLoops || [],
    },
    lastPlanText: null,
    startedAt: Date.now(),
  };

  // Build kickoff message with identity context
  const parts = [];
  parts.push(`Let's do your ${ritualType} review. Here's your current context:\n`);

  if (context.roles?.length > 0) {
    parts.push('**Roles:**');
    context.roles.forEach(r => parts.push(`- ${r}`));
    parts.push('');
  }

  if (context.goals?.length > 0) {
    parts.push('**Goals:**');
    context.goals.forEach(g => parts.push(`- ${g}`));
    parts.push('');
  }

  if (context.openLoops?.length > 0) {
    parts.push('**Open Loops:**');
    context.openLoops.forEach(l => parts.push(`- ${l}`));
    parts.push('');
  }

  parts.push(`Reflect on the past ${periodLabel} — what happened, what got done, what didn't, what's on your mind. Write freely.`);

  return {
    sessionState,
    slackReply: parts.join('\n'),
  };
}

/**
 * Process a message in a ritual session.
 *
 * @param {string} message - User message
 * @param {Object} sessionState - Current session state
 * @param {Object} deps - Dependencies
 * @param {Object} deps.claudeClient - Claude client
 * @param {Object} deps.logger - Logger instance
 * @returns {Promise<Object>} Response and state updates
 */
export async function ritualCoordinator(message, sessionState, { claudeClient, logger }) {
  const { ritualType, phase } = sessionState;

  logger.info('Ritual coordinator processing', { ritualType, phase });

  // Check for commit signal (from SORT or PLAN phase)
  const lowerMessage = message.toLowerCase().trim();
  const commitPatterns = ['commit', 'finalize', 'save', "let's do it", "let's go"];
  const isCommitSignal = commitPatterns.some(p => lowerMessage.includes(p));

  if (isCommitSignal && (phase === RITUAL_PHASES.SORT || phase === RITUAL_PHASES.PLAN)) {
    return handleCommit(sessionState, { logger });
  }

  // Check for skip/next phase
  if (lowerMessage.includes('skip') || lowerMessage === 'next' ||
      lowerMessage.includes('move on')) {
    return advancePhase(sessionState, { logger });
  }

  // Process message for current phase
  return processPhaseMessage(message, sessionState, { claudeClient, logger });
}

/**
 * Process a message within the current phase.
 *
 * Each phase has a specific system prompt that guides Claude to do
 * structured processing rather than open-ended therapeutic questioning.
 * Phase advancement is deterministic: REFLECT→SORT, SORT→PLAN, PLAN stays.
 */
async function processPhaseMessage(message, sessionState, { claudeClient, logger }) {
  const { ritualType, phase, context, commitments, messages } = sessionState;
  const periodLabel = ritualType === 'monthly' ? 'month' : 'week';

  // Build conversation history for context
  const conversationHistory = (messages || [])
    .map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
    .join('\n\n');

  // Phase-specific system prompts
  let system;

  const identityBlock = `Identity context:
- Roles: ${context.roles.join(', ') || 'Not specified'}
- Goals: ${context.goals.join(', ') || 'Not specified'}
- Open Loops: ${context.openLoops.join(', ') || 'None'}`;

  const historyBlock = conversationHistory
    ? `Conversation so far:\n${conversationHistory}\n`
    : '';

  if (phase === RITUAL_PHASES.REFLECT) {
    system = `You are a structured life review coach helping with a ${ritualType} review.

${identityBlock}

${historyBlock}
The user just reflected on their past ${periodLabel}. YOUR JOB IS TO PROCESS WHAT THEY SHARED, NOT ASK MORE QUESTIONS.

Do ALL of the following in your response:
1. ACKNOWLEDGE what they shared — show you heard the emotional weight, not just the facts
2. COGNITIVE SORT — organize what they told you into themes: what's working, what's struggling, what's emerging, what needs attention
3. MAP TO ROLES AND GOALS — where did they advance? Where did things slip? What's urgent?
4. EXTRACT — identify any commitments, priorities, or focus areas they mentioned (even implicitly)
5. At the end, briefly ask if there's anything else before you generate a plan

Be direct and structured. Use bullet points and headers. The user has executive function challenges — your job is to organize and reflect back, not to ask open-ended questions. Process what they gave you.

You may optionally respond with JSON (useful for structured extraction):
{"response": "your text", "captured": {"insights": [], "commitments": [], "focus_areas": [], "kept_loops": [], "theme": null}, "ready_to_advance": true}
Or just respond with plain text — either works.`;
  } else if (phase === RITUAL_PHASES.SORT) {
    system = `You are a structured life review coach generating a plan.

${identityBlock}

${historyBlock}
Based on EVERYTHING discussed so far in this conversation, generate a ${periodLabel} plan. The user may have already shared their priorities and focus areas during reflection — use them. Do not ask for priorities the user already gave you.

Output a plan in this exact markdown format:

## Theme
[A short intention or focus phrase for the ${periodLabel}]

## Focus Areas
- [Which roles and life areas get attention this ${periodLabel}]

## Commitments
- [ ] [Concrete, actionable item]
- [ ] [Another item]

## Open Loops (carrying forward)
- [Items that need attention but aren't this ${periodLabel}'s focus]

After the plan, add a brief line: "Reply in this thread to make any corrections."

IMPORTANT: The plan itself is the main output. Be concrete and specific. Pull directly from what the user shared.

You may optionally respond with JSON:
{"response": "your text", "captured": {"insights": [], "commitments": [], "focus_areas": [], "kept_loops": [], "theme": null}, "ready_to_advance": true}
Or just respond with plain text.`;
  } else if (phase === RITUAL_PHASES.PLAN) {
    system = `You are a structured life review coach revising a plan.

${identityBlock}

${historyBlock}
The user wants to change the plan. Apply their correction and output the COMPLETE REVISED PLAN in this markdown format:

## Theme
[Updated theme]

## Focus Areas
- [Updated focus areas]

## Commitments
- [ ] [Updated commitments]

## Open Loops (carrying forward)
- [Updated loops]

IMPORTANT: Output the FULL revised plan, not just the changes. The entire response will be saved as the plan file. After the plan, add a brief line: "Reply in this thread to make more corrections."

You may optionally respond with JSON:
{"response": "your text", "captured": {"insights": [], "commitments": [], "focus_areas": [], "kept_loops": [], "theme": null}, "ready_to_advance": true}
Or just respond with plain text.`;
  }

  let responseText;
  let captured = null;

  try {
    const rawText = await claudeClient.message({
      system,
      userMessage: message,
    });

    // Try to parse as structured JSON (works with stubs, optional for real Claude)
    let parsed = null;
    try {
      let clean = rawText.trim();
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
      }
      const jsonStart = clean.indexOf('{');
      if (jsonStart !== -1) {
        parsed = JSON.parse(clean.slice(jsonStart));
      }
    } catch {
      // Not valid JSON — that's fine, use raw text
    }

    if (parsed && typeof parsed.response === 'string') {
      responseText = parsed.response;
      captured = parsed.captured || null;
    } else {
      responseText = rawText;
    }
  } catch (error) {
    logger.error('Phase processing failed', { error: error.message });
    return {
      slackReply: "Something went wrong processing that. Could you try again?",
      stateUpdate: {},
    };
  }

  // Update commitments from structured data (stubs provide this)
  const updatedCommitments = { ...commitments };
  if (captured) {
    if (captured.focus_areas?.length) {
      updatedCommitments.rolesFocus = [
        ...updatedCommitments.rolesFocus,
        ...captured.focus_areas,
      ];
    }
    if (captured.commitments?.length) {
      updatedCommitments.weekCommitments = [
        ...updatedCommitments.weekCommitments,
        ...captured.commitments,
      ];
    }
    if (captured.kept_loops?.length) {
      updatedCommitments.keptLoops = [
        ...updatedCommitments.keptLoops,
        ...captured.kept_loops,
      ];
    }
    if (captured.theme) {
      updatedCommitments.theme = captured.theme;
    }
  }

  const stateUpdate = {
    commitments: updatedCommitments,
    lastPlanText: responseText,
  };

  // Deterministic phase advancement:
  // REFLECT → SORT, SORT → PLAN, PLAN stays until commit
  if (phase === RITUAL_PHASES.REFLECT) {
    stateUpdate.phase = RITUAL_PHASES.SORT;
    logger.info('Advancing phase', { from: phase, to: RITUAL_PHASES.SORT });
  } else if (phase === RITUAL_PHASES.SORT) {
    stateUpdate.phase = RITUAL_PHASES.PLAN;
    logger.info('Advancing phase', { from: phase, to: RITUAL_PHASES.PLAN });
  }

  return {
    slackReply: responseText,
    stateUpdate,
  };
}

/**
 * Advance to the next phase (used for explicit skip/next).
 */
function advancePhase(sessionState, { logger }) {
  const { phase } = sessionState;

  const phaseOrder = [RITUAL_PHASES.REFLECT, RITUAL_PHASES.SORT, RITUAL_PHASES.PLAN];
  const currentIndex = phaseOrder.indexOf(phase);
  const nextPhase = phaseOrder[currentIndex + 1];

  if (!nextPhase) {
    return {
      slackReply: 'Say "commit" to save your plan, or tell me what to adjust.',
      stateUpdate: {},
    };
  }

  logger.info('Skipping to next phase', { from: phase, to: nextPhase });

  const skipMessages = {
    [RITUAL_PHASES.SORT]: 'Moving on. What priorities do you want to focus on for the next period?',
    [RITUAL_PHASES.PLAN]: 'Moving to plan. Say "commit" when ready, or tell me your priorities.',
  };

  return {
    slackReply: skipMessages[nextPhase] || 'Moving on.',
    stateUpdate: { phase: nextPhase },
  };
}

/**
 * Handle commit/finalize action.
 *
 * Generates plan content from structured commitments if available,
 * otherwise falls back to the conversation-based plan.
 */
export function handleCommit(sessionState, { logger, isUpdate = false }) {
  logger.info('Committing ritual plan', { ritualType: sessionState.ritualType, isUpdate });

  const { ritualType, commitments } = sessionState;
  const date = new Date().toISOString().split('T')[0];

  // Check if we have structured commitments (from stub JSON responses)
  const hasStructuredContent = commitments.rolesFocus.length > 0 ||
    commitments.weekCommitments.length > 0 ||
    commitments.keptLoops.length > 0 ||
    commitments.theme;

  // Generate plan content
  let planContent;
  if (hasStructuredContent) {
    planContent = generatePlanContent(ritualType, commitments, date);
  } else {
    planContent = generateConversationPlan(ritualType, sessionState, date);
  }

  const logContent = generateLogContent(sessionState);

  // For monthly rituals, also generate week 1 plan
  let week1PlanContent = null;
  if (ritualType === 'monthly') {
    if (hasStructuredContent) {
      week1PlanContent = generateWeek1PlanContent(commitments, date);
    } else {
      week1PlanContent = generateWeek1FromConversation(sessionState, date);
    }
  }

  return {
    slackReply: `**${ritualType.charAt(0).toUpperCase() + ritualType.slice(1)} Plan ${isUpdate ? 'Updated' : 'Committed'}!**\n\n_Saved to planning/${ritualType}/_\n\nReply in this thread to make corrections.`,
    stateUpdate: {
      status: 'committed',
      planContent,
      logContent,
    },
    commit: true,
    planContent,
    logContent,
    week1PlanContent,
  };
}

/**
 * Generate plan content from structured commitments (stub path).
 */
function generatePlanContent(ritualType, commitments, date) {
  const parts = [];

  parts.push(`# ${ritualType.charAt(0).toUpperCase() + ritualType.slice(1)} Plan - ${date}`);
  parts.push('');

  if (commitments.theme) {
    parts.push(`## Theme`);
    parts.push(commitments.theme);
    parts.push('');
  }

  if (commitments.rolesFocus.length > 0) {
    parts.push('## Focus Areas');
    commitments.rolesFocus.forEach(f => parts.push(`- ${f}`));
    parts.push('');
  }

  if (commitments.goalPriorities.length > 0) {
    parts.push('## Goal Priorities');
    commitments.goalPriorities.forEach(g => parts.push(`- ${g}`));
    parts.push('');
  }

  if (commitments.weekCommitments.length > 0) {
    parts.push('## Commitments');
    commitments.weekCommitments.forEach(c => parts.push(`- [ ] ${c}`));
    parts.push('');
  }

  if (commitments.keptLoops.length > 0) {
    parts.push('## Active Open Loops');
    commitments.keptLoops.forEach(l => parts.push(`- ${l}`));
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Generate plan content from conversation (real Claude path).
 * Uses the most recent plan text (from SORT or PLAN phase) as the plan body.
 */
function generateConversationPlan(ritualType, sessionState, date) {
  const parts = [];
  parts.push(`# ${ritualType.charAt(0).toUpperCase() + ritualType.slice(1)} Plan - ${date}`);
  parts.push('');

  // Use lastPlanText — the most recent Claude response that contains the plan.
  // This is set by processPhaseMessage after each Claude call.
  if (sessionState.lastPlanText) {
    parts.push(sessionState.lastPlanText);
  }

  return parts.join('\n');
}

/**
 * Generate week 1 plan content derived from monthly review (stub path).
 */
function generateWeek1PlanContent(commitments, date) {
  const parts = [];
  parts.push(`# Week 1 Plan - ${date}`);
  parts.push('');
  parts.push('_Derived from monthly review_');
  parts.push('');

  if (commitments.theme) {
    parts.push('## Monthly Theme');
    parts.push(commitments.theme);
    parts.push('');
  }

  if (commitments.rolesFocus.length > 0) {
    parts.push('## Focus Areas');
    commitments.rolesFocus.forEach(f => parts.push(`- ${f}`));
    parts.push('');
  }

  if (commitments.weekCommitments.length > 0) {
    parts.push('## Commitments');
    commitments.weekCommitments.forEach(c => parts.push(`- [ ] ${c}`));
    parts.push('');
  }

  if (commitments.keptLoops.length > 0) {
    parts.push('## Active Open Loops');
    commitments.keptLoops.forEach(l => parts.push(`- ${l}`));
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Generate week 1 plan from conversation (real Claude path).
 * Uses lastPlanText (the plan from SORT/PLAN phase).
 */
function generateWeek1FromConversation(sessionState, date) {
  const parts = [];
  parts.push(`# Week 1 Plan - ${date}`);
  parts.push('');
  parts.push('_Derived from monthly review_');
  parts.push('');

  if (sessionState.lastPlanText) {
    parts.push(sessionState.lastPlanText);
  }

  return parts.join('\n');
}

/**
 * Generate log content for archival.
 */
function generateLogContent(sessionState) {
  const parts = [];

  parts.push(`# ${sessionState.ritualType} Review Log`);
  parts.push('');
  parts.push(`Date: ${new Date().toISOString()}`);
  parts.push(`Duration: ${Math.round((Date.now() - sessionState.startedAt) / 60000)} minutes`);
  parts.push('');

  parts.push('## Conversation');
  parts.push('');
  for (const msg of sessionState.messages || []) {
    const role = msg.role === 'user' ? '**User**' : '_Coach_';
    parts.push(`${role}: ${msg.content}`);
    parts.push('');
  }

  parts.push('## Outcomes');
  parts.push('');
  parts.push(formatCommitmentsSummary(sessionState.commitments));

  return parts.join('\n');
}

/**
 * Format commitments as a summary.
 */
function formatCommitmentsSummary(commitments) {
  const parts = [];

  if (commitments.theme) {
    parts.push(`**Theme:** ${commitments.theme}`);
  }

  if (commitments.rolesFocus.length > 0) {
    parts.push(`**Focus Areas:** ${commitments.rolesFocus.join(', ')}`);
  }

  if (commitments.goalPriorities.length > 0) {
    parts.push(`**Goal Priorities:** ${commitments.goalPriorities.join(', ')}`);
  }

  if (commitments.weekCommitments.length > 0) {
    parts.push('**Commitments:**');
    commitments.weekCommitments.forEach(c => parts.push(`- ${c}`));
  }

  return parts.join('\n');
}

/**
 * Classify ritual message intent (kept for backward compatibility).
 */
export async function classifyRitualIntent(message, sessionState, { claudeClient }) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('skip') || lowerMessage.includes('next')) {
    return { type: 'advance' };
  }

  if (lowerMessage.includes('commit') || lowerMessage.includes('finalize')) {
    return { type: 'commit' };
  }

  if (lowerMessage.includes('back') || lowerMessage.includes('previous')) {
    return { type: 'back' };
  }

  return { type: 'continue' };
}
