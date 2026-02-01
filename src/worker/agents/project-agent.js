/**
 * Project Agent - Handles messages in project channels.
 *
 * The Project Agent works with project-specific context (spread.md)
 * and routes to research mode when appropriate.
 */

import { createAgentResult, ACTION_TYPES } from './types.js';

/**
 * Process a project channel message.
 *
 * @param {string} message - User message
 * @param {Object} context - Processing context
 * @param {string} context.spread - Contents of spread.md
 * @param {string} context.projectIndex - Contents of projects/index.md
 * @param {string} context.projectSlug - Project slug (e.g., 'find-pcp')
 * @param {string} context.date - Current date (YYYY-MM-DD)
 * @param {string} context.time - Current time (HH:MM)
 * @param {Object} deps - Dependencies
 * @param {Object} deps.claudeClient - Claude API client
 * @param {Object} deps.logger - Logger instance
 * @returns {Promise<AgentResult>}
 */
export async function projectAgent(message, context, { claudeClient, logger }) {
  const { projectSlug, spread, date, time } = context;
  logger.info('Project agent processing', { projectSlug, messageLength: message.length });

  // Check for research trigger
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('research') ||
      lowerMessage.includes('look up') ||
      lowerMessage.includes('find out') ||
      lowerMessage.includes('search for')) {
    return await handleResearchRequest(message, context, { claudeClient, logger });
  }

  // Regular project message - update spread and respond
  const system = `You are a project assistant for the "${projectSlug}" project.

Your job is to:
1. Understand what the user is communicating about this project
2. Update the project spread appropriately
3. Provide a helpful response

The project spread is the active working document for this project.
It contains sections like: Summary, Status, Next Actions, Notes, Research, Log.

TODAY: ${date}
TIME: ${time}

Respond with JSON:
{
  "thinking": "Brief reasoning",
  "spread_updates": [
    {
      "section": "Section name",
      "action": "append|prepend|replace",
      "content": "Content to add/replace"
    }
  ],
  "slack_reply": "Your response to the user"
}`;

  const userMessage = spread
    ? `## Current Project Spread\n${spread}\n\n---\n\nUser message:\n${message}`
    : `No spread loaded yet for "${projectSlug}".\n\nUser message:\n${message}`;

  const result = await claudeClient.messageJson({
    system,
    userMessage,
  });

  // Build file actions
  const actions = [];

  if (result.spread_updates && result.spread_updates.length > 0) {
    for (const update of result.spread_updates) {
      actions.push({
        type: update.action === 'replace' ? ACTION_TYPES.REPLACE_SECTION : ACTION_TYPES.APPEND_TO_SECTION,
        file: `projects/${projectSlug}/spread.md`,
        section: `## ${update.section}`,
        content: update.content,
      });
    }

    // Add log entry for significant updates
    const now = new Date();
    actions.push({
      type: ACTION_TYPES.APPEND_TO_SECTION,
      file: `projects/${projectSlug}/spread.md`,
      section: '## Log',
      content: `- ${date} ${time} | ${message.slice(0, 80)}${message.length > 80 ? '...' : ''}`,
    });
  }

  return createAgentResult({
    slackReply: result.slack_reply || 'Updated.',
    actions,
    metadata: {
      thinking: result.thinking,
      projectSlug,
      updateCount: result.spread_updates?.length || 0,
    },
  });
}

/**
 * Handle a research request - trigger research mode.
 */
async function handleResearchRequest(message, context, { claudeClient, logger }) {
  const { projectSlug, date, time } = context;
  logger.info('Triggering research mode', { projectSlug });

  // Extract the research query
  const system = `Extract the research query from the user's message.

Respond with JSON:
{
  "query": "The specific thing to research",
  "scope": "Brief description of what they want to find"
}`;

  const result = await claudeClient.messageJson({
    system,
    userMessage: message,
  });

  return createAgentResult({
    slackReply: `Starting research: "${result.query}"\n\n_This will open a research thread. Reply in that thread to guide the research. Say "finalize" when you're done._`,
    actions: [{
      type: 'start_research',
      projectSlug,
      query: result.query,
      scope: result.scope,
    }],
    metadata: {
      intent: 'research_start',
      projectSlug,
      query: result.query,
    },
  });
}

/**
 * Apply updates to spread content.
 * @param {string} spread - Current spread content
 * @param {Array} updates - Updates to apply
 * @returns {string} Updated spread content
 */
export function applySpreadUpdates(spread, updates) {
  let content = spread || '';

  for (const update of updates) {
    const sectionHeader = `## ${update.section}`;
    const sectionIndex = content.indexOf(sectionHeader);

    if (sectionIndex === -1 && update.action !== 'replace') {
      // Section doesn't exist - add it at the end
      content = content.trim() + `\n\n${sectionHeader}\n${update.content}`;
      continue;
    }

    // Find the end of this section (next ## or end of content)
    const sectionStart = sectionIndex + sectionHeader.length;
    let sectionEnd = content.length;
    const nextSection = content.indexOf('\n## ', sectionStart);
    if (nextSection !== -1) {
      sectionEnd = nextSection;
    }

    const beforeSection = content.slice(0, sectionStart);
    const afterSection = content.slice(sectionEnd);
    const currentContent = content.slice(sectionStart, sectionEnd);

    switch (update.action) {
      case 'append':
        content = beforeSection + currentContent.trimEnd() + '\n' + update.content + afterSection;
        break;
      case 'prepend':
        content = beforeSection + '\n' + update.content + currentContent.trimStart() + afterSection;
        break;
      case 'replace':
        content = beforeSection + '\n' + update.content + '\n' + afterSection;
        break;
    }
  }

  return content;
}
