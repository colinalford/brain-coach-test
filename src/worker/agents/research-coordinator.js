/**
 * Research Coordinator - Sub-main agent for research threads.
 *
 * Manages research conversations within project channels:
 * - Interprets user guidance in research threads
 * - Decides when to search, synthesize, or ask questions
 * - Maintains research context across messages
 */

import { tavilySearch, researchTopic } from './tavily-agent.js';
import { synthesizeFindings, formatSynthesisForSpread, formatSynthesisForSlack } from './synthesis-agent.js';

/**
 * Research intent types.
 */
export const RESEARCH_INTENTS = {
  SEARCH: 'search',        // User wants to search for something
  REFINE: 'refine',        // User wants to refine/narrow search
  EXPAND: 'expand',        // User wants to explore related topics
  QUESTION: 'question',    // User has a question about findings
  SYNTHESIZE: 'synthesize', // User wants a summary
  CONTINUE: 'continue',    // Continue current research direction
  FINALIZE: 'finalize',    // User is done, finalize research
};

/**
 * Classify the intent of a research thread message.
 *
 * @param {string} message - User message
 * @param {Object} threadState - Current thread state
 * @param {Object} deps - Dependencies
 * @param {Object} deps.claudeClient - Claude client
 * @returns {Promise<Object>} Classified intent
 */
export async function classifyResearchIntent(message, threadState, { claudeClient }) {
  const lowerMessage = message.toLowerCase();

  // Check for explicit finalize signals
  if (lowerMessage.includes('finalize') ||
      lowerMessage.includes("that's good") ||
      lowerMessage.includes('thats good') ||
      lowerMessage.includes("that's enough") ||
      lowerMessage.includes('done researching') ||
      lowerMessage.includes('wrap up') ||
      lowerMessage.includes('commit this')) {
    return { type: RESEARCH_INTENTS.FINALIZE };
  }

  // Check for synthesis request
  if (lowerMessage.includes('summarize') ||
      lowerMessage.includes('summary') ||
      lowerMessage.includes('what did you find') ||
      lowerMessage.includes('what have you found')) {
    return { type: RESEARCH_INTENTS.SYNTHESIZE };
  }

  // Use Claude for more nuanced classification
  const system = `Classify this research thread message. The user is in an active research session.

Thread context:
- Original query: ${threadState.query}
- Findings so far: ${threadState.findings?.length || 0}
- Messages exchanged: ${threadState.messages?.length || 0}

Classify into one of:
- search: User wants to search for specific information
- refine: User wants to narrow/focus the search
- expand: User wants to explore related topics
- question: User has a question about findings
- continue: User acknowledges and wants more of the same

Respond with JSON:
{
  "intent": "search|refine|expand|question|continue",
  "search_query": "If search/refine/expand, the query to search for",
  "reasoning": "Brief explanation"
}`;

  try {
    const result = await claudeClient.messageJson({
      system,
      userMessage: message,
    });

    return {
      type: result.intent || RESEARCH_INTENTS.CONTINUE,
      query: result.search_query,
      reasoning: result.reasoning,
    };
  } catch {
    // Default to continue if classification fails
    return { type: RESEARCH_INTENTS.CONTINUE };
  }
}

/**
 * Process a message in a research thread.
 *
 * @param {string} message - User message
 * @param {Object} threadState - Current thread state
 * @param {Object} deps - Dependencies
 * @param {Object} deps.claudeClient - Claude client
 * @param {Object} deps.tavilyClient - Tavily client
 * @param {Object} deps.logger - Logger instance
 * @returns {Promise<Object>} Response and state updates
 */
export async function researchCoordinator(message, threadState, { claudeClient, tavilyClient, logger }) {
  logger.info('Research coordinator processing', {
    query: threadState.query,
    messageCount: threadState.messages?.length || 0,
    findingCount: threadState.findings?.length || 0,
  });

  // Classify intent
  const intent = await classifyResearchIntent(message, threadState, { claudeClient });
  logger.debug('Research intent classified', { intent: intent.type, query: intent.query });

  switch (intent.type) {
    case RESEARCH_INTENTS.FINALIZE:
      return await handleFinalize(threadState, { claudeClient, logger });

    case RESEARCH_INTENTS.SYNTHESIZE:
      return await handleSynthesize(threadState, { claudeClient, logger });

    case RESEARCH_INTENTS.SEARCH:
    case RESEARCH_INTENTS.REFINE:
    case RESEARCH_INTENTS.EXPAND:
      return await handleSearch(intent.query || message, threadState, { tavilyClient, logger });

    case RESEARCH_INTENTS.QUESTION:
      return await handleQuestion(message, threadState, { claudeClient, logger });

    case RESEARCH_INTENTS.CONTINUE:
    default:
      return await handleContinue(threadState, { claudeClient, tavilyClient, logger });
  }
}

/**
 * Handle a search request.
 */
async function handleSearch(query, threadState, { tavilyClient, logger }) {
  const result = await tavilySearch(query, {
    scope: threadState.scope,
  }, { tavilyClient, logger });

  const newFindings = result.results.map(r => ({
    source: r.url,
    title: r.title,
    content: r.content,
    query,
    timestamp: Date.now(),
  }));

  return {
    slackReply: result.formatted,
    stateUpdate: {
      findings: [...(threadState.findings || []), ...newFindings],
    },
    findings: newFindings,
  };
}

/**
 * Handle a synthesize request.
 */
async function handleSynthesize(threadState, { claudeClient, logger }) {
  const synthesis = await synthesizeFindings(
    threadState.findings || [],
    {
      query: threadState.query,
      scope: threadState.scope,
    },
    { claudeClient, logger }
  );

  return {
    slackReply: formatSynthesisForSlack(synthesis),
    stateUpdate: {
      lastSynthesis: synthesis,
    },
  };
}

/**
 * Handle finalize request - prepare for commit.
 */
async function handleFinalize(threadState, { claudeClient, logger }) {
  const synthesis = await synthesizeFindings(
    threadState.findings || [],
    {
      query: threadState.query,
      scope: threadState.scope,
    },
    { claudeClient, logger }
  );

  const date = new Date().toISOString().split('T')[0];
  const spreadContent = formatSynthesisForSpread(synthesis, threadState.query, date);

  return {
    slackReply: `${formatSynthesisForSlack(synthesis)}\n\n_Research summary added to project spread._`,
    stateUpdate: {
      status: 'finalized',
      synthesis,
      spreadContent,
    },
    finalize: true,
    synthesis,
    spreadContent,
  };
}

/**
 * Handle a question about findings.
 */
async function handleQuestion(message, threadState, { claudeClient, logger }) {
  const findingsContext = (threadState.findings || [])
    .slice(-10)
    .map(f => `- ${f.title}: ${f.content?.slice(0, 200)}`)
    .join('\n');

  const system = `You are a research assistant. Answer the user's question based on the research findings.

Research query: ${threadState.query}
Findings:
${findingsContext}

Be concise and cite sources when relevant.`;

  try {
    const answer = await claudeClient.message({
      system,
      userMessage: message,
    });

    return {
      slackReply: answer,
      stateUpdate: {},
    };
  } catch (error) {
    logger.error('Question handling failed', { error: error.message });
    return {
      slackReply: "_I couldn't process that question. Try rephrasing or ask me to search for something specific._",
      stateUpdate: {},
    };
  }
}

/**
 * Handle continue - suggest next steps or do more research.
 */
async function handleContinue(threadState, { claudeClient, tavilyClient, logger }) {
  const findingCount = threadState.findings?.length || 0;

  // If we have enough findings, suggest synthesis
  if (findingCount >= 10) {
    return {
      slackReply: `I've gathered ${findingCount} findings. Would you like me to:\n• Summarize what we've found\n• Search for something more specific\n• Finalize and add to the project\n\n_Say "finalize" when you're ready to save._`,
      stateUpdate: {},
    };
  }

  // If few findings, suggest more searches
  if (findingCount < 3) {
    // Try to do another search on the original query
    const result = await tavilySearch(threadState.query, {
      scope: threadState.scope,
      maxResults: 5,
    }, { tavilyClient, logger });

    if (result.results.length > 0) {
      const newFindings = result.results.map(r => ({
        source: r.url,
        title: r.title,
        content: r.content,
        query: threadState.query,
        timestamp: Date.now(),
      }));

      return {
        slackReply: `${result.formatted}\n\n_Found ${newFindings.length} more sources. Reply to guide the research or say "finalize" when done._`,
        stateUpdate: {
          findings: [...(threadState.findings || []), ...newFindings],
        },
        findings: newFindings,
      };
    }
  }

  // Default response
  return {
    slackReply: `I have ${findingCount} findings so far. You can:\n• Tell me to search for something specific\n• Ask questions about what I've found\n• Say "summarize" for a summary\n• Say "finalize" to save and close`,
    stateUpdate: {},
  };
}

/**
 * Format a research log for archival.
 *
 * @param {Object} threadState - Thread state
 * @returns {string} Formatted markdown log
 */
export function formatResearchLog(threadState) {
  const parts = [];

  parts.push(`# Research: ${threadState.query}`);
  parts.push('');
  parts.push(`Started: ${new Date(threadState.startedAt).toISOString()}`);
  parts.push(`Scope: ${threadState.scope || 'General'}`);
  parts.push(`Findings: ${threadState.findings?.length || 0}`);
  parts.push('');

  // Message log
  parts.push('## Conversation');
  parts.push('');
  for (const msg of threadState.messages || []) {
    const role = msg.role === 'user' ? '**User**' : '_Assistant_';
    parts.push(`${role}: ${msg.content.slice(0, 500)}${msg.content.length > 500 ? '...' : ''}`);
    parts.push('');
  }

  // Findings
  if (threadState.findings?.length > 0) {
    parts.push('## Sources');
    parts.push('');
    for (const finding of threadState.findings) {
      parts.push(`- [${finding.title}](${finding.source})`);
    }
    parts.push('');
  }

  // Final synthesis
  if (threadState.synthesis) {
    parts.push('## Synthesis');
    parts.push('');
    parts.push(threadState.synthesis.summary);
  }

  return parts.join('\n');
}
