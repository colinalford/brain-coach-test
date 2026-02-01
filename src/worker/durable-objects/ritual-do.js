/**
 * RitualDO - Durable Object for ritual session state.
 *
 * Handles weekly and monthly ritual conversations:
 * - Identity-driven review prompts
 * - Thread state tracking
 * - Plan generation on finalize
 */

import { createLogger, generateRequestId } from '../lib/logger.js';
import { createGitHubReader } from '../lib/github-reader.js';
import { createGitHubWriter } from '../lib/github-writer.js';
import { createSlackClient } from '../lib/slack-client.js';
import { createClaudeClient } from '../lib/claude-client.js';
import { createStubClaudeClient } from '../lib/stub-claude-client.js';
import { createStubSlackClient } from '../lib/stub-slack-client.js';
import { putIntent } from '../lib/write-intent.js';
import { getWeekId, getMonthId } from '../lib/timezone.js';
import { initializeRitual, ritualCoordinator, handleCommit, RITUAL_PHASES } from '../agents/ritual-coordinator.js';

/**
 * RitualDO Durable Object class.
 */
export class RitualDO {
  /**
   * @param {DurableObjectState} state - Durable Object state
   * @param {Object} env - Environment bindings
   */
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // Session state
    this.ritualType = null; // 'weekly' or 'monthly'
    this.activeThreads = new Map(); // thread_ts -> session state

    // Identity context cache
    this.identityContext = null;

    // Stub response maps (populated from BrainDO in stub mode)
    this._stubClaudeResponses = new Map();
    this._useStubSlack = false;

    // Clients
    this._githubReader = null;
    this._slackClient = null;
    this._claudeClient = null;
    this._logger = null;
  }

  /**
   * Get or create logger.
   * @param {string} [requestId] - Request ID
   * @returns {Object} Logger instance
   */
  getLogger(requestId) {
    if (!this._logger || requestId) {
      this._logger = createLogger({
        component: 'RitualDO',
        requestId: requestId || generateRequestId(),
        ritualType: this.ritualType,
      });
    }
    return this._logger;
  }

  /**
   * Get or create GitHub reader.
   * @returns {Object} GitHub reader instance
   */
  getGitHubReader() {
    if (!this._githubReader) {
      this._githubReader = createGitHubReader({
        token: this.env.GITHUB_TOKEN,
        repo: this.env.GITHUB_REPO,
        logger: this.getLogger(),
      });
    }
    return this._githubReader;
  }

  /**
   * Get or create Slack client.
   * Uses stub client when _useStubSlack is set (forwarded from BrainDO in stub mode).
   * @returns {Object} Slack client instance
   */
  getSlackClient() {
    if (!this._slackClient) {
      if (this._useStubSlack || this.env.SLACK_MODE === 'stub') {
        this._slackClient = createStubSlackClient({
          logger: this.getLogger(),
        });
      } else {
        this._slackClient = createSlackClient({
          token: this.env.SLACK_BOT_TOKEN,
          logger: this.getLogger(),
        });
      }
    }
    return this._slackClient;
  }

  /**
   * Get or create Claude client.
   * Uses stub client when stub responses are available (forwarded from BrainDO).
   * @returns {Object} Claude client instance
   */
  getClaudeClient() {
    if (!this._claudeClient) {
      if (this._stubClaudeResponses.size > 0 || this.env.LLM_MODE === 'stub') {
        this._claudeClient = createStubClaudeClient({
          stubResponses: this._stubClaudeResponses,
          logger: this.getLogger(),
        });
      } else {
        this._claudeClient = createClaudeClient({
          apiKey: this.env.ANTHROPIC_API_KEY,
          logger: this.getLogger(),
        });
      }
    }
    return this._claudeClient;
  }

  /**
   * Get or create GitHub writer.
   * @returns {Object} GitHub writer instance
   */
  getGitHubWriter() {
    if (!this._githubWriter) {
      this._githubWriter = createGitHubWriter({
        token: this.env.GITHUB_TOKEN,
        repo: this.env.GITHUB_REPO,
        logger: this.getLogger(),
      });
    }
    return this._githubWriter;
  }

  /**
   * Handle incoming requests.
   * @param {Request} request - Incoming request
   * @returns {Promise<Response>} Response
   */
  async fetch(request) {
    const requestId = generateRequestId();
    const logger = this.getLogger(requestId);

    try {
      const url = new URL(request.url);

      // Health check
      if (url.pathname === '/health') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            component: 'RitualDO',
            ritualType: this.ritualType,
            activeThreadCount: this.activeThreads.size,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Start ritual via slash command
      if (url.pathname === '/start' && request.method === 'POST') {
        const payload = await request.json();
        return this.handleStart(payload, logger);
      }

      // Message handling
      if (url.pathname === '/message' && request.method === 'POST') {
        const payload = await request.json();
        return this.handleMessage(payload, logger);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error('Request failed', { error: error.message, stack: error.stack });
      return new Response(
        JSON.stringify({ error: 'Internal error', message: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Load identity context from GitHub.
   * @param {Object} logger - Logger instance
   * @returns {Promise<Object>} Identity context
   */
  async loadIdentityContext(logger) {
    if (this.identityContext) {
      return this.identityContext;
    }

    logger.info('Loading identity context');

    const reader = this.getGitHubReader();

    try {
      // Load identity files
      const [rolesContent, goalsContent, currentContent] = await Promise.all([
        reader.getContent('data/identity/roles.md'),
        reader.getContent('data/identity/goals.md'),
        reader.getContent('data/current.md'),
      ]);

      // Extract roles
      const roles = extractListItems(rolesContent, '## Roles') ||
                   extractListItems(rolesContent, '## Active Roles') ||
                   [];

      // Extract goals
      const goals = extractListItems(goalsContent, '## Goals') ||
                   extractListItems(goalsContent, '## Active Goals') ||
                   [];

      // Extract open loops from current.md
      const openLoops = extractListItems(currentContent, '## Open Loops') || [];

      this.identityContext = { roles, goals, openLoops };

      logger.info('Identity context loaded', {
        roleCount: roles.length,
        goalCount: goals.length,
        openLoopCount: openLoops.length,
      });

      return this.identityContext;
    } catch (error) {
      logger.error('Failed to load identity context', { error: error.message });
      // Return empty context on error
      this.identityContext = { roles: [], goals: [], openLoops: [] };
      return this.identityContext;
    }
  }

  /**
   * Handle /start route — initiates a ritual session from a slash command.
   * Loads identity context, posts kickoff message, and saves session state.
   * @param {Object} payload - Start payload
   * @param {string} payload.ritualType - 'weekly' or 'monthly'
   * @param {string} payload.channelId - Channel to post in
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleStart(payload, logger) {
    const { ritualType, channelId } = payload;

    this.ritualType = ritualType;
    logger.info('Starting ritual via /start', { ritualType, channelId });

    const slackClient = this.getSlackClient();

    try {
      // Load identity context
      const context = await this.loadIdentityContext(logger);

      // Initialize ritual session
      const { sessionState, slackReply } = initializeRitual(ritualType, context, { logger });

      // Post kickoff message to channel (starts a new thread)
      const response = await slackClient.postMessage({
        channel: channelId,
        text: slackReply,
      });

      // Save session state keyed by the thread timestamp
      const threadTs = response.ts;
      sessionState.messages.push({
        role: 'assistant',
        content: slackReply,
        ts: threadTs,
      });

      await this.state.storage.put(`ritual-${threadTs}`, sessionState);
      this.activeThreads.set(threadTs, true);

      logger.info('Ritual started via slash command', { threadTs, phase: sessionState.phase });

      return new Response(
        JSON.stringify({
          status: 'ok',
          message: `Starting ${ritualType} review — check the channel for the kickoff message.`,
          threadTs,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      logger.error('Failed to start ritual', { error: error.message, stack: error.stack });
      return new Response(
        JSON.stringify({
          status: 'error',
          message: `Failed to start ${ritualType} ritual: ${error.message}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Handle incoming message.
   * @param {Object} payload - Message payload
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleMessage(payload, logger) {
    const { ritualType, channel_id, text, message_ts, thread_ts,
            _stubClaudeResponses, _slackMode } = payload;

    // Store ritual type
    this.ritualType = ritualType;

    // Accept stub configuration forwarded from BrainDO (only on first message,
    // to avoid resetting the sequence counter on subsequent messages)
    if (_stubClaudeResponses && this._stubClaudeResponses.size === 0) {
      this._stubClaudeResponses = new Map(Object.entries(_stubClaudeResponses));
      this._claudeClient = null;
    }
    if (_slackMode === 'stub' && !this._useStubSlack) {
      this._useStubSlack = true;
      this._slackClient = null;
    }

    logger.info('Processing ritual message', { ritualType, hasThread: !!thread_ts });

    const slackClient = this.getSlackClient();
    const claudeClient = this.getClaudeClient();

    try {
      // Add thinking reaction
      await slackClient.addReaction({
        channel: channel_id,
        timestamp: message_ts,
        name: 'brain',
      });

      // Check if this is part of an active ritual thread
      if (thread_ts) {
        let sessionState = await this.state.storage.get(`ritual-${thread_ts}`);

        if (sessionState) {
          // If the ritual was already committed, process as a plan correction
          if (sessionState.status === 'committed') {
            return this.handlePostCommitMessage(payload, sessionState, logger);
          }
          return this.processRitualMessage(payload, sessionState, logger);
        }
      }

      // New ritual session - load identity context and initialize
      const context = await this.loadIdentityContext(logger);

      const { sessionState, slackReply } = initializeRitual(ritualType, context, { logger });

      // Post kickoff message and start thread
      const response = await slackClient.postMessage({
        channel: channel_id,
        text: slackReply,
        thread_ts: thread_ts || message_ts,
      });

      // Store session state keyed by the thread root (original message ts)
      // Slack threads use the parent message ts, not the reply ts
      const threadTs = thread_ts || message_ts;
      sessionState.messages.push({
        role: 'assistant',
        content: slackReply,
        ts: response.ts,
      });

      await this.state.storage.put(`ritual-${threadTs}`, sessionState);
      this.activeThreads.set(threadTs, true);

      logger.info('Ritual session started', { threadTs, phase: sessionState.phase });

      const stubRecordings = this._useStubSlack ? (slackClient.getRecordings?.() || []) : [];

      return new Response(
        JSON.stringify({
          status: 'ok',
          action: 'ritual_started',
          ritualType,
          threadTs,
          phase: sessionState.phase,
          _stubRecordings: stubRecordings,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      logger.error('Failed to handle ritual message', { error: error.message, stack: error.stack });

      // Send error message
      try {
        await slackClient.postMessage({
          channel: channel_id,
          text: `_Error starting ritual: ${error.message}_`,
          thread_ts: thread_ts || message_ts,
        });
      } catch {
        // Ignore Slack errors in error path
      }

      throw error;
    }
  }

  /**
   * Process a message in an active ritual session.
   * @param {Object} payload - Message payload
   * @param {Object} sessionState - Current session state
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async processRitualMessage(payload, sessionState, logger) {
    const { channel_id, text, message_ts, thread_ts } = payload;

    logger.info('Processing ritual thread message', {
      phase: sessionState.phase,
      messageCount: sessionState.messages?.length || 0,
    });

    const slackClient = this.getSlackClient();
    const claudeClient = this.getClaudeClient();

    // Add user message to history
    sessionState.messages.push({
      role: 'user',
      content: text,
      ts: message_ts,
    });

    // Process with ritual coordinator
    const result = await ritualCoordinator(text, sessionState, {
      claudeClient,
      logger,
    });

    // Apply state updates
    if (result.stateUpdate) {
      sessionState = { ...sessionState, ...result.stateUpdate };
    }

    // Add assistant message to history
    sessionState.messages.push({
      role: 'assistant',
      content: result.slackReply,
      ts: Date.now().toString(),
    });

    // Check if committing (explicit "commit" signal)
    if (result.commit) {
      return this.commitRitual(payload, sessionState, result, logger);
    }

    // Auto-commit when reaching PLAN phase (after SORT→PLAN transition or staying in PLAN).
    // Every plan presentation gets written to git immediately — no need for explicit "commit".
    if (sessionState.phase === RITUAL_PHASES.PLAN) {
      const commitResult = handleCommit(sessionState, { logger });
      // Combine Claude's plan response with the commit confirmation
      commitResult.slackReply = result.slackReply + '\n\n---\n\n' + commitResult.slackReply;
      return this.commitRitual(payload, sessionState, commitResult, logger);
    }

    // Save updated state (REFLECT→SORT, no commit yet)
    await this.state.storage.put(`ritual-${thread_ts}`, sessionState);

    // Reply to Slack
    await slackClient.postMessage({
      channel: channel_id,
      text: result.slackReply,
      thread_ts,
    });

    const stubRecordings = this._useStubSlack ? (slackClient.getRecordings?.() || []) : [];

    return new Response(
      JSON.stringify({
        status: 'ok',
        action: 'ritual_message_processed',
        phase: sessionState.phase,
        _stubRecordings: stubRecordings,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Handle a message in a thread where the ritual has already been committed.
   * Processes as a plan correction: Claude revises, auto-commits the update.
   * @param {Object} payload - Message payload
   * @param {Object} sessionState - Full session state from storage
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handlePostCommitMessage(payload, sessionState, logger) {
    const { text, message_ts, thread_ts } = payload;

    logger.info('Post-commit correction in ritual thread', { thread_ts });

    const claudeClient = this.getClaudeClient();

    // Reactivate session in PLAN phase for the correction
    sessionState.phase = RITUAL_PHASES.PLAN;
    delete sessionState.status;

    // Add user message to history
    sessionState.messages.push({
      role: 'user',
      content: text,
      ts: message_ts,
    });

    // Process through ritual coordinator (PLAN phase handles revisions)
    const result = await ritualCoordinator(text, sessionState, {
      claudeClient,
      logger,
    });

    // Apply state updates
    if (result.stateUpdate) {
      sessionState = { ...sessionState, ...result.stateUpdate };
    }

    // Add assistant message to history
    sessionState.messages.push({
      role: 'assistant',
      content: result.slackReply,
      ts: Date.now().toString(),
    });

    // Auto-commit the correction (use coordinator's commit result if it returned one,
    // otherwise generate one from the updated session state)
    const commitResult = result.commit
      ? result
      : handleCommit(sessionState, { logger, isUpdate: true });

    // Combine Claude's revision response with the update confirmation
    if (!result.commit) {
      commitResult.slackReply = result.slackReply + '\n\n---\n\n' + commitResult.slackReply;
    }

    return this.commitRitual(payload, sessionState, commitResult, logger);
  }

  /**
   * Commit ritual plan.
   * @param {Object} payload - Message payload
   * @param {Object} sessionState - Session state
   * @param {Object} coordinatorResult - Result from coordinator
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async commitRitual(payload, sessionState, coordinatorResult, logger) {
    const { channel_id, thread_ts } = payload;
    const { ritualType } = sessionState;

    logger.info('Committing ritual plan', { ritualType });

    const slackClient = this.getSlackClient();

    // Get plan and log content from coordinator
    const { planContent, logContent, slackReply, week1PlanContent } = coordinatorResult;

    // Generate week/month ID using timezone-aware utilities
    const periodId = ritualType === 'weekly' ? getWeekId() : getMonthId();

    // Build write intents for BrainDO to commit atomically
    const writeIntents = [];

    if (planContent) {
      writeIntents.push(putIntent(
        `data/planning/${ritualType}/${periodId}.md`,
        planContent
      ));
      logger.info('Plan intent built', { path: `planning/${ritualType}/${periodId}.md` });
    }

    if (logContent) {
      writeIntents.push(putIntent(
        `data/planning/${ritualType}/${periodId}-log.md`,
        logContent
      ));
      logger.info('Log intent built', { path: `planning/${ritualType}/${periodId}-log.md` });
    }

    // For monthly rituals, also write week 1 plan
    if (ritualType === 'monthly' && week1PlanContent) {
      const weekId = getWeekId();
      writeIntents.push(putIntent(
        `data/planning/weekly/${weekId}.md`,
        week1PlanContent
      ));
      logger.info('Week 1 plan intent built', { path: `planning/weekly/${weekId}.md` });
    }

    logger.info('Ritual write intents built', {
      planLength: planContent?.length || 0,
      logLength: logContent?.length || 0,
      intentCount: writeIntents.length,
    });

    // Mark session as committed but keep full state for follow-up corrections
    sessionState.status = 'committed';
    await this.state.storage.put(`ritual-${thread_ts}`, sessionState);
    this.activeThreads.delete(thread_ts);

    // Post completion message
    await slackClient.postMessage({
      channel: channel_id,
      text: slackReply,
      thread_ts,
    });

    const stubRecordings = this._useStubSlack ? (slackClient.getRecordings?.() || []) : [];

    return new Response(
      JSON.stringify({
        status: 'ok',
        action: 'ritual_committed',
        ritualType,
        writeIntents,
        _stubRecordings: stubRecordings,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Extract list items from a markdown section.
 * @param {string} content - Markdown content
 * @param {string} sectionHeader - Section header to find
 * @returns {string[]|null} List items or null
 */
function extractListItems(content, sectionHeader) {
  if (!content) return null;

  const headerIndex = content.indexOf(sectionHeader);
  if (headerIndex === -1) return null;

  // Find the end of this section (next ## or end of content)
  const sectionStart = headerIndex + sectionHeader.length;
  let sectionEnd = content.length;
  const nextSection = content.indexOf('\n## ', sectionStart);
  if (nextSection !== -1) {
    sectionEnd = nextSection;
  }

  const sectionContent = content.slice(sectionStart, sectionEnd);

  // Extract list items (lines starting with - or *)
  const items = [];
  const lines = sectionContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      items.push(trimmed.slice(2).trim());
    }
  }

  return items.length > 0 ? items : null;
}

