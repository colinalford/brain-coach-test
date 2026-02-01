/**
 * BrainDO - Main Durable Object for Second Brain.
 *
 * Holds current.md in memory, routes messages by channel type,
 * and coordinates with ProjectDO and RitualDO for specialized handling.
 */

import { createLogger, generateRequestId } from '../lib/logger.js';
import { createGitHubReader } from '../lib/github-reader.js';
import { createGitHubWriter } from '../lib/github-writer.js';
import { createSlackClient } from '../lib/slack-client.js';
import { createClaudeClient } from '../lib/claude-client.js';
import { createTavilyClient } from '../lib/tavily-client.js';
import { createStubClaudeClient } from '../lib/stub-claude-client.js';
import { createStubSlackClient } from '../lib/stub-slack-client.js';
import { createStubTavilyClient } from '../lib/stub-tavily-client.js';
import { getLocalDate, getLocalTime, getWeekId, getDayOfWeek } from '../lib/timezone.js';
import { buildThreadContext, formatThreadForLLM } from '../lib/thread-context.js';
import { applyToolCall } from '../lib/tool-applicator.js';
import { putIntent, toolIntent, validateIntents, resolveIntent } from '../lib/write-intent.js';
import { pruneContext } from '../lib/context-pruner.js';
import { parseSpreadForIndex, buildIndexContent } from '../lib/project-index.js';
import { generateBootstrapContext, generateBootstrapFiles } from '../lib/bootstrap.js';
import { mainAgent } from '../agents/main-agent.js';
import { executeResearch, inferProject } from '../agents/research-agent.js';

/**
 * Simple hash function for version stamps in edge runtime.
 * Uses djb2 algorithm — not cryptographic, just for identification.
 * @param {string} str - Input string
 * @returns {string} Hex hash string
 */
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Channel types for routing.
 */
export const CHANNEL_TYPES = {
  INBOX: 'inbox',
  PROJECT: 'project',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  UNKNOWN: 'unknown',
};

/**
 * BrainDO Durable Object class.
 */
export class BrainDO {
  /**
   * @param {DurableObjectState} state - Durable Object state
   * @param {Object} env - Environment bindings
   */
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // In-memory cache (survives within same isolate)
    this.contextPack = null;
    this.contextVersion = null;

    // Stub response maps for system tests (keyed by test_id)
    this._stubClaudeResponses = new Map();
    this._stubTavilyResponses = new Map();

    // Clients initialized lazily
    this._githubReader = null;
    this._slackClient = null;
    this._claudeClient = null;
    this._logger = null;
  }

  /**
   * Get or create logger.
   * @param {string} [requestId] - Request ID for correlation
   * @returns {Object} Logger instance
   */
  getLogger(requestId) {
    if (!this._logger || requestId) {
      this._logger = createLogger({
        component: 'BrainDO',
        requestId: requestId || generateRequestId(),
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
   * Uses stub client when SLACK_MODE=stub (system tests).
   * @returns {Object} Slack client instance
   */
  getSlackClient() {
    if (!this._slackClient) {
      if (this.env.SLACK_MODE === 'stub') {
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
   * Uses stub client when LLM_MODE=stub (system tests).
   * @returns {Object} Claude client instance
   */
  getClaudeClient() {
    if (!this._claudeClient) {
      if (this.env.LLM_MODE === 'stub') {
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
   * Get or create Tavily client.
   * Uses stub client when SEARCH_MODE=stub (system tests).
   * @returns {Object} Tavily client instance
   */
  getTavilyClient() {
    if (!this._tavilyClient) {
      if (this.env.SEARCH_MODE === 'stub') {
        this._tavilyClient = createStubTavilyClient({
          stubResponses: this._stubTavilyResponses,
          logger: this.getLogger(),
        });
      } else {
        this._tavilyClient = createTavilyClient({
          apiKey: this.env.TAVILY_API_KEY,
          logger: this.getLogger(),
        });
      }
    }
    return this._tavilyClient;
  }

  /**
   * Execute file actions from agent results.
   * @param {Array} actions - Actions to execute
   * @param {Object} logger - Logger instance
   * @returns {Promise<void>}
   */
  /**
   * Convert legacy agent actions to write intents.
   * This bridges the old action format from mainAgent/projectAgent
   * to the new write intent schema used by commitWriteSet.
   *
   * @param {Array} actions - Agent actions (old format)
   * @param {Object} logger - Logger instance
   * @returns {Array} Write intents
   */
  buildWriteIntents(actions, logger) {
    const intents = [];

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'append_to_section': {
            const path = `data/${action.file}`;
            intents.push(toolIntent(path, 'append_to_section', {
              heading: action.section || '## Captures',
              content: action.content,
            }));
            logger.debug('Intent built', { type: action.type, path });
            break;
          }

          case 'prepend_to_section': {
            const path = `data/${action.file}`;
            intents.push(toolIntent(path, 'prepend_to_section', {
              heading: action.section,
              content: action.content,
            }));
            logger.debug('Intent built', { type: action.type, path });
            break;
          }

          case 'replace_section': {
            const path = `data/${action.file}`;
            intents.push(toolIntent(path, 'replace_section', {
              heading: action.section,
              content: action.content,
            }));
            logger.debug('Intent built', { type: action.type, path });
            break;
          }

          case 'create_file': {
            const path = `data/${action.file}`;
            intents.push(putIntent(path, action.content));
            logger.debug('Intent built', { type: action.type, path });
            break;
          }

          case 'append_to_file': {
            // For append_to_file, we need the current content to append.
            // Use a put intent with current + new content.
            // The caller should resolve this against GitHub content before commit.
            const path = `data/${action.file}`;
            intents.push(toolIntent(path, 'append_to_section', {
              heading: '## Captures',
              content: action.content,
            }));
            logger.debug('Intent built (append_to_file → append_to_section)', { path });
            break;
          }

          case 'inline_update': {
            // Inline updates to current.md sections
            if (action.section && action.content) {
              const heading = action.section.startsWith('##') ? action.section : `## ${action.section}`;
              const toolType = action.action === 'replace' ? 'replace_section' : 'append_to_section';
              intents.push(toolIntent('data/current.md', toolType, {
                heading,
                content: action.content,
              }));
              logger.debug('Intent built', { type: 'inline_update', section: action.section });
            }
            break;
          }

          case 'mark_complete': {
            intents.push(toolIntent('data/current.md', 'mark_complete', {
              item: action.item,
            }));
            logger.debug('Intent built', { type: action.type, item: action.item });
            break;
          }

          case 'remove_item': {
            intents.push(toolIntent('data/current.md', 'remove_item', {
              item: action.item,
              heading: action.section ? (action.section.startsWith('##') ? action.section : `## ${action.section}`) : undefined,
            }));
            logger.debug('Intent built', { type: action.type, item: action.item });
            break;
          }

          case 'create_project':
            // create_project is handled separately by BrainDO, not as a write intent
            logger.debug('Skipping create_project action (handled separately)');
            break;

          default:
            logger.warn('Unknown action type, skipped', { type: action.type });
        }
      } catch (error) {
        logger.error('Failed to build intent', {
          type: action.type,
          file: action.file,
          error: error.message,
        });
      }
    }

    return intents;
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

      // Health check endpoint
      if (url.pathname === '/health') {
        return this.handleHealth();
      }

      // Context check endpoint (for debugging)
      if (url.pathname === '/context') {
        return this.handleContextCheck(logger);
      }


      // Test stub registration endpoint (system tests only)
      if (url.pathname === '/test/stubs' && request.method === 'POST') {
        return this.handleRegisterStubs(request, logger);
      }

      // Test recordings endpoint (system tests only)
      if (url.pathname === '/test/recordings' && request.method === 'GET') {
        return this.handleGetRecordings(logger);
      }

      // Test recordings clear endpoint (system tests only)
      if (url.pathname === '/test/recordings' && request.method === 'DELETE') {
        return this.handleClearRecordings(logger);
      }

      // Main message handling
      if (url.pathname === '/message' && request.method === 'POST') {
        const payload = await request.json();
        return this.handleMessage(payload, logger);
      }

      // Slash command handling
      if (url.pathname === '/command' && request.method === 'POST') {
        const payload = await request.json();
        return this.handleCommand(payload, logger);
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
   * Handle health check.
   * @returns {Response}
   */
  handleHealth() {
    return new Response(
      JSON.stringify({
        status: 'ok',
        component: 'BrainDO',
        contextLoaded: this.contextPack !== null,
        contextVersion: this.contextVersion,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Handle context check (debugging).
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleContextCheck(logger) {
    await this.ensureContext(logger);
    return new Response(
      JSON.stringify({
        status: 'ok',
        contextVersion: this.contextVersion,
        contextLength: this.contextPack?.length || 0,
        contextPreview: this.contextPack?.slice(0, 500) || null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Check and store dedup key. Returns true if this is a duplicate.
   * @param {string} key - Dedup composite key
   * @param {number} ttlMs - TTL in milliseconds
   * @param {Object} logger - Logger instance
   * @returns {Promise<boolean>} True if duplicate
   */
  async checkDedup(key, ttlMs, logger) {
    const storageKey = `dedup:${key}`;
    const existing = await this.state.storage.get(storageKey);

    if (existing) {
      logger.info('Dedup: duplicate detected', { key });
      return true;
    }

    // Store with expiry metadata
    await this.state.storage.put(storageKey, {
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });

    // Schedule cleanup via alarm (Cloudflare DO alarms)
    // For simplicity, we'll clean up expired keys on next check
    return false;
  }

  /**
   * Handle incoming message.
   * @param {Object} payload - Message payload from worker
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleMessage(payload, logger) {
    const { channel_id, channel_name, text, user_id, thread_ts, message_ts, trace_id, event_id, team_id } = payload;

    // Thread trace_id through logger
    if (trace_id) {
      logger = logger.child({ traceId: trace_id });
    }

    logger.info('Processing message', {
      channelId: channel_id,
      channelName: channel_name,
      userId: user_id,
      hasThread: !!thread_ts,
      traceId: trace_id,
    });

    // Dedup check for events (TTL 1 hour)
    if (team_id && event_id) {
      const dedupKey = `${team_id}:${event_id}`;
      const isDup = await this.checkDedup(dedupKey, 3600000, logger);
      if (isDup) {
        return new Response(
          JSON.stringify({ status: 'ok', action: 'dedup_skipped', trace_id }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Ensure context is loaded
    await this.ensureContext(logger);

    // Determine channel type
    const channelType = this.getChannelType(channel_id, channel_name);
    logger.info('Channel type determined', { channelType });

    // Route by channel type
    switch (channelType) {
      case CHANNEL_TYPES.INBOX:
        return this.handleInboxMessage(payload, logger);

      case CHANNEL_TYPES.PROJECT:
        return this.handleProjectMessage(payload, logger);

      case CHANNEL_TYPES.WEEKLY:
      case CHANNEL_TYPES.MONTHLY:
        return this.handleRitualMessage(payload, channelType, logger);

      default:
        logger.warn('Unknown channel type', { channelType, channelName: channel_name });
        return new Response(
          JSON.stringify({ error: 'Unknown channel type', channelType }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
  }

  /**
   * Ensure context pack is loaded and up to date.
   * @param {Object} logger - Logger instance
   */
  async ensureContext(logger) {
    // Check in-memory cache first
    if (this.contextPack && this.contextVersion) {
      logger.debug('Using in-memory context', { version: this.contextVersion });
      return;
    }

    // Check durable storage
    const storedContext = await this.state.storage.get('contextPack');
    const storedVersion = await this.state.storage.get('contextVersion');

    if (storedContext && storedVersion) {
      // Verify against GitHub (in background for performance)
      const githubVersion = await this.getGitHubSha('data/current.md', logger);

      if (githubVersion === storedVersion) {
        this.contextPack = storedContext;
        this.contextVersion = storedVersion;
        logger.debug('Using stored context', { version: this.contextVersion });
        return;
      }

      logger.info('Context outdated, reloading', {
        stored: storedVersion,
        github: githubVersion,
      });
    }

    // Reload from GitHub
    await this.reloadContext(logger);
  }

  /**
   * Reload context from GitHub.
   * @param {Object} logger - Logger instance
   */
  async reloadContext(logger) {
    logger.info('Reloading context from GitHub');

    const reader = this.getGitHubReader();

    const [content, sha] = await Promise.all([
      reader.getContent('data/current.md'),
      reader.getSha('data/current.md'),
    ]);

    if (!content) {
      // Bootstrap: create minimum viable repo structure
      logger.info('current.md not found — bootstrapping new repo structure');
      const bootstrapFiles = generateBootstrapFiles();
      const writer = this.getGitHubWriter();

      try {
        const result = await writer.batchWrite(bootstrapFiles, 'Bootstrap: create initial repo structure');
        logger.info('Bootstrap commit created', { commitSha: result.commitSha, fileCount: bootstrapFiles.length });
        this.contextPack = bootstrapFiles[0].content; // current.md is first file
        this.contextVersion = result.commitSha;
        await this.state.storage.put('contextPack', this.contextPack);
        await this.state.storage.put('contextVersion', this.contextVersion);
        return;
      } catch (bootstrapError) {
        logger.error('Bootstrap failed, using in-memory fallback', { error: bootstrapError.message });
        // Fall back to in-memory bootstrap context so processing can continue
        this.contextPack = generateBootstrapContext();
        this.contextVersion = 'bootstrap-pending';
        return;
      }
    }

    this.contextPack = content;
    this.contextVersion = sha;

    // Persist to durable storage
    await this.state.storage.put('contextPack', this.contextPack);
    await this.state.storage.put('contextVersion', this.contextVersion);

    logger.info('Context reloaded', { version: this.contextVersion, length: content.length });
  }

  /**
   * Get SHA of a file from GitHub.
   * @param {string} path - File path
   * @param {Object} logger - Logger instance
   * @returns {Promise<string|null>}
   */
  async getGitHubSha(path, logger) {
    try {
      const reader = this.getGitHubReader();
      return await reader.getSha(path);
    } catch (error) {
      logger.error('Failed to get GitHub SHA', { path, error: error.message });
      return null;
    }
  }

  /**
   * Determine channel type from ID and name.
   * @param {string} channelId - Channel ID
   * @param {string} [channelName] - Channel name
   * @returns {string} Channel type
   */
  getChannelType(channelId, channelName) {
    // Check by channel ID (env-configured channels)
    if (channelId === this.env.SLACK_INBOX_CHANNEL_ID) {
      return CHANNEL_TYPES.INBOX;
    }
    if (channelId === this.env.SLACK_WEEKLY_CHANNEL_ID) {
      return CHANNEL_TYPES.WEEKLY;
    }
    if (channelId === this.env.SLACK_MONTHLY_CHANNEL_ID) {
      return CHANNEL_TYPES.MONTHLY;
    }

    // Check by channel name pattern
    if (channelName) {
      if (channelName === 'sb-inbox') {
        return CHANNEL_TYPES.INBOX;
      }
      if (channelName.startsWith('proj-')) {
        return CHANNEL_TYPES.PROJECT;
      }
      if (channelName === 'sb-weekly') {
        return CHANNEL_TYPES.WEEKLY;
      }
      if (channelName === 'sb-monthly') {
        return CHANNEL_TYPES.MONTHLY;
      }
    }

    return CHANNEL_TYPES.UNKNOWN;
  }

  /**
   * Extract project slug from channel name.
   * @param {string} channelName - Channel name (e.g., 'proj-find-pcp')
   * @returns {string|null} Project slug
   */
  extractProjectSlug(channelName) {
    if (!channelName?.startsWith('proj-')) {
      return null;
    }
    return channelName.slice(5); // Remove 'proj-' prefix
  }

  /**
   * Handle message in #sb-inbox.
   * This is where the Main Agent processes messages.
   * @param {Object} payload - Message payload
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleInboxMessage(payload, logger) {
    logger.info('Handling inbox message');

    const slackClient = this.getSlackClient();
    const claudeClient = this.getClaudeClient();

    try {
      // Add a "thinking" reaction (non-blocking, okay if it fails)
      try {
        await slackClient.addReaction({
          channel: payload.channel_id,
          timestamp: payload.message_ts,
          name: 'brain',
        });
      } catch (reactionError) {
        logger.warn('Could not add reaction', { error: reactionError.message });
      }

      // Get current date/time context (America/New_York)
      const date = getLocalDate();
      const time = getLocalTime();
      const weekId = getWeekId();
      const dayOfWeek = getDayOfWeek();

      // Fetch thread context if this is a thread reply
      let threadContext = null;
      if (payload.thread_ts) {
        try {
          const replies = await slackClient.getThreadReplies({
            channel: payload.channel_id,
            ts: payload.thread_ts,
          });
          if (replies && replies.length > 0) {
            const built = buildThreadContext(replies, { messageLimit: 20, charLimit: 15000 });
            threadContext = formatThreadForLLM(built, this.env.SLACK_BOT_USER_ID);
            logger.info('Thread context built', {
              messageCount: replies.length,
              includedCount: built.messages.length,
              truncated: built.truncated,
            });
          }
        } catch (threadError) {
          logger.warn('Could not fetch thread context', { error: threadError.message });
        }
      }

      // Process with Main Agent (single LLM call)
      const result = await mainAgent(
        payload.text,
        {
          currentMd: this.contextPack,
          channelType: 'inbox',
          date,
          time,
          weekId,
          dayOfWeek,
          threadContext,
        },
        { claudeClient, logger }
      );

      // Commit write intents atomically
      // New path: mainAgent returns writeIntents directly
      // Legacy path: mainAgent returns actions → buildWriteIntents
      let intents = result.writeIntents || [];
      if (intents.length === 0 && result.actions?.length > 0) {
        intents = this.buildWriteIntents(result.actions, logger);
      }

      if (intents.length > 0) {
        const traceId = payload.trace_id || '';
        const commitMsg = `Inbox capture${traceId ? ` (trace: ${traceId})` : ''}`;
        await this.commitWriteSet(intents, commitMsg, logger);
      }

      // Handle special actions (create_project, etc.)
      if (result.specialActions?.length > 0) {
        for (const action of result.specialActions) {
          if (action.type === 'create_project' && action.name) {
            try {
              await this.createProject(action.name, logger);
            } catch (error) {
              logger.warn('Auto project creation failed', { error: error.message });
            }
          }
        }
      }

      // Reply to Slack
      await slackClient.postMessage({
        channel: payload.channel_id,
        text: result.slackReply,
        thread_ts: payload.thread_ts || payload.message_ts,
      });

      // If clarification needed, add hint
      if (result.needsClarification) {
        await slackClient.postMessage({
          channel: payload.channel_id,
          text: `_${result.needsClarification.question}_\n${result.needsClarification.options?.map(o => `• ${o}`).join('\n') || ''}`,
          thread_ts: payload.thread_ts || payload.message_ts,
        });
      }

      return new Response(
        JSON.stringify({
          status: 'ok',
          action: 'inbox_processed',
          intent: result.metadata?.intent,
          intentCount: intents.length,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      logger.error('Failed to handle inbox message', { error: error.message, stack: error.stack });

      // Send error message to user
      try {
        await slackClient.postMessage({
          channel: payload.channel_id,
          text: `_Sorry, I had trouble processing that. Error: ${error.message}_`,
          thread_ts: payload.thread_ts || payload.message_ts,
        });
      } catch {
        // Ignore Slack errors in error path
      }

      throw error;
    }
  }

  /**
   * Handle message in #proj-* channel.
   * Routes to ProjectDO for the specific project.
   * @param {Object} payload - Message payload
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleProjectMessage(payload, logger) {
    const projectSlug = this.extractProjectSlug(payload.channel_name);
    logger.info('Routing to ProjectDO', { projectSlug });

    if (!projectSlug) {
      return new Response(
        JSON.stringify({ error: 'Invalid project channel' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get ProjectDO for this project
    const projectDOId = this.env.PROJECT_DO.idFromName(`project-${projectSlug}`);
    const projectDO = this.env.PROJECT_DO.get(projectDOId);

    // Forward request to ProjectDO
    // In stub mode, pass stub responses so ProjectDO can use them
    const forwardPayload = {
      ...payload,
      projectSlug,
      contextPack: this.contextPack,
    };
    if (this.env.LLM_MODE === 'stub') {
      forwardPayload._stubClaudeResponses = Object.fromEntries(this._stubClaudeResponses);
    }
    if (this.env.SEARCH_MODE === 'stub') {
      forwardPayload._stubTavilyResponses = Object.fromEntries(this._stubTavilyResponses);
    }
    if (this.env.SLACK_MODE === 'stub') {
      forwardPayload._slackMode = 'stub';
    }

    const projectResponse = await projectDO.fetch(
      new Request('http://internal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forwardPayload),
      })
    );

    // Collect write intents from ProjectDO and commit atomically
    if (projectResponse.ok) {
      try {
        const result = await projectResponse.json();

        // Merge stub recordings from ProjectDO into BrainDO's recording set
        if (result._stubRecordings?.length > 0 && this.env.SLACK_MODE === 'stub') {
          const slackClient = this.getSlackClient();
          for (const rec of result._stubRecordings) {
            // Re-record each call through BrainDO's stub client
            if (rec.method === 'chat.postMessage') {
              await slackClient.postMessage(rec.args);
            } else if (rec.method === 'reactions.add') {
              await slackClient.addReaction(rec.args);
            } else if (rec.method === 'conversations.create') {
              await slackClient.createChannel(rec.args);
            } else if (rec.method === 'conversations.invite') {
              await slackClient.inviteToChannel(rec.args);
            }
          }
        }

        if (result.writeIntents && result.writeIntents.length > 0) {
          const traceId = payload.trace_id || '';
          const commitMsg = `Update ${projectSlug}${traceId ? ` (trace: ${traceId})` : ''}`;
          await this.commitWriteSet(result.writeIntents, commitMsg, logger);
        }
        // Return a fresh response since we consumed the original
        return new Response(
          JSON.stringify({ status: 'ok', action: result.action, projectSlug }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        logger.error('Failed to process project write intents', { error: error.message });
        return new Response(
          JSON.stringify({ status: 'ok', action: 'project_processed', projectSlug, commitError: error.message }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // If ProjectDO returned an error, pass it through
    return new Response(
      projectResponse.body,
      { status: projectResponse.status, headers: projectResponse.headers }
    );
  }

  /**
   * Handle message in #sb-weekly or #sb-monthly.
   * Routes to RitualDO for the specific ritual type.
   * @param {Object} payload - Message payload
   * @param {string} ritualType - 'weekly' or 'monthly'
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleRitualMessage(payload, ritualType, logger) {
    logger.info('Routing to RitualDO', { ritualType });

    // Get RitualDO for this ritual type
    const ritualDOId = this.env.RITUAL_DO.idFromName(`ritual-${ritualType}`);
    const ritualDO = this.env.RITUAL_DO.get(ritualDOId);

    // Forward request to RitualDO with stub config
    const forwardPayload = {
      ...payload,
      ritualType,
      contextPack: this.contextPack,
    };
    if (this.env.LLM_MODE === 'stub') {
      forwardPayload._stubClaudeResponses = Object.fromEntries(this._stubClaudeResponses);
    }
    if (this.env.SLACK_MODE === 'stub') {
      forwardPayload._slackMode = 'stub';
    }

    const ritualResponse = await ritualDO.fetch(
      new Request('http://internal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forwardPayload),
      })
    );

    // Collect write intents from RitualDO and commit atomically
    if (ritualResponse.ok) {
      try {
        const result = await ritualResponse.json();

        // Merge stub recordings from RitualDO
        if (result._stubRecordings?.length > 0 && this.env.SLACK_MODE === 'stub') {
          const slackClient = this.getSlackClient();
          for (const rec of result._stubRecordings) {
            if (rec.method === 'chat.postMessage') {
              await slackClient.postMessage(rec.args);
            } else if (rec.method === 'reactions.add') {
              await slackClient.addReaction(rec.args);
            }
          }
        }

        if (result.writeIntents && result.writeIntents.length > 0) {
          // Add current.md update with plan content in the same atomic commit
          this.addContextPackPlanUpdate(result.writeIntents, ritualType, logger);

          const traceId = payload.trace_id || '';
          const commitMsg = `${ritualType} ritual commit${traceId ? ` (trace: ${traceId})` : ''}`;
          await this.commitWriteSet(result.writeIntents, commitMsg, logger);
        }
        return new Response(
          JSON.stringify({ status: 'ok', action: result.action, ritualType }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        logger.error('Failed to process ritual write intents', { error: error.message });
        return new Response(
          JSON.stringify({ status: 'ok', action: 'ritual_processed', ritualType, commitError: error.message }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      ritualResponse.body,
      { status: ritualResponse.status, headers: ritualResponse.headers }
    );
  }

  /**
   * Add a current.md update to write intents so the context pack
   * includes the new plan content in the same atomic commit.
   */
  addContextPackPlanUpdate(writeIntents, ritualType, logger) {
    // Find plan content from write intents
    const planIntent = writeIntents.find(i =>
      i.path?.startsWith(`data/planning/${ritualType}/`) &&
      !i.path?.includes('-log')
    );
    if (!planIntent || !planIntent.content) {
      logger.info('No plan intent found for context pack update');
      return;
    }

    // Build the plan section to inject
    const sectionHeader = ritualType === 'weekly'
      ? "## This Week's Plan"
      : '## Monthly Plan';
    const planSection = `${sectionHeader}\n\n${planIntent.content}`;

    // Update or append to context pack
    let updatedPack = this.contextPack || '';
    const sectionRegex = new RegExp(
      `${sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?(?=\\n## |$)`
    );

    if (sectionRegex.test(updatedPack)) {
      updatedPack = updatedPack.replace(sectionRegex, planSection);
    } else {
      updatedPack = updatedPack.trimEnd() + '\n\n' + planSection + '\n';
    }

    this.contextPack = updatedPack;
    writeIntents.push(putIntent('data/current.md', updatedPack));
    logger.info('Context pack updated with plan content', { ritualType });
  }

  /**
   * Invalidate cached context (called when we know it's stale).
   */
  async invalidateContext() {
    this.contextPack = null;
    this.contextVersion = null;
    await this.state.storage.delete('contextPack');
    await this.state.storage.delete('contextVersion');
  }

  /**
   * Commit a set of write intents atomically via Git Data API.
   * This is the coordinator's commit path — all writes for a single
   * user message go through here.
   *
   * @param {Array} intents - Write intents to commit
   * @param {string} message - Commit message
   * @param {Object} logger - Logger instance
   * @returns {Promise<{ commitSha: string, files: string[] } | null>}
   */
  async commitWriteSet(intents, message, logger) {
    if (!intents || intents.length === 0) {
      logger.debug('No write intents to commit');
      return null;
    }

    // Validate all intents
    const { valid, invalid } = validateIntents(intents);

    if (invalid.length > 0) {
      logger.error('Invalid write intents', {
        invalidCount: invalid.length,
        errors: invalid.map(i => i.error),
      });
      // Per spec: if any intent is invalid, abort the entire commit
      return null;
    }

    if (valid.length === 0) {
      return null;
    }

    // Resolve all intents to final file content.
    // Group tool intents by path so multiple tool calls on the same file
    // are applied sequentially to the same content.
    const fileContents = new Map(); // path -> content
    const reader = this.getGitHubReader();

    for (const intent of valid) {
      if (intent.op === 'put') {
        fileContents.set(intent.path, intent.content);
      } else if (intent.op === 'tool') {
        // Get current content for this file
        let currentContent = fileContents.get(intent.path);

        if (currentContent === undefined) {
          if (intent.path === 'data/current.md') {
            currentContent = this.contextPack || '';
          } else {
            // Fetch from GitHub
            try {
              currentContent = await reader.getContent(intent.path) || '';
            } catch {
              currentContent = '';
            }
          }
        }

        const result = resolveIntent(intent, currentContent, applyToolCall);
        if (result.error) {
          logger.error('Tool intent failed', { error: result.error, type: intent.type, path: intent.path });
          return null; // Abort on any tool failure
        }

        fileContents.set(intent.path, result.content);

        // Keep in-memory contextPack in sync
        if (intent.path === 'data/current.md') {
          this.contextPack = result.content;
        }
      }
    }

    // Inject version stamp into current.md if it's being written
    const hasCurrentMdChanges = fileContents.has('data/current.md');
    if (hasCurrentMdChanges) {
      let currentMdContent = fileContents.get('data/current.md');
      // Remove any existing version stamp
      currentMdContent = currentMdContent.replace(
        /<!-- context_pack_version: \S+ source_ref: \S+ direction: \S+ -->\n?/,
        ''
      );
      // Add version stamp with direction: decompose (DO-originated write)
      const contentHash = simpleHash(currentMdContent).slice(0, 12);
      const stamp = `<!-- context_pack_version: ${contentHash} source_ref: do direction: decompose -->`;
      currentMdContent = currentMdContent.replace(
        '# Current Context\n',
        `# Current Context\n${stamp}\n`
      );
      fileContents.set('data/current.md', currentMdContent);
      this.contextPack = currentMdContent;
    }

    // Build resolved file list
    const resolvedFiles = Array.from(fileContents.entries()).map(
      ([path, content]) => ({ path, content })
    );

    if (resolvedFiles.length === 0) {
      logger.debug('No files to commit after resolution');
      return null;
    }

    // Use Git Data API for atomic multi-file commit
    const writer = this.getGitHubWriter();
    try {
      const result = await writer.batchWrite(resolvedFiles, message);
      logger.info('Atomic commit successful', {
        commitSha: result.commitSha,
        fileCount: resolvedFiles.length,
        files: resolvedFiles.map(f => f.path),
      });

      // Update context version
      if (hasCurrentMdChanges) {
        this.contextVersion = result.commitSha;
        await this.state.storage.put('contextPack', this.contextPack);
        await this.state.storage.put('contextVersion', this.contextVersion);
      }

      return result;
    } catch (error) {
      if (error.message.includes('422') || error.message.includes('409')) {
        // HEAD moved (e.g. GitHub Actions pushed) — retry with backoff
        for (let attempt = 1; attempt <= 3; attempt++) {
          const delay = attempt * 1000;
          logger.warn('Ref conflict, retrying commit', { attempt, delay, error: error.message });
          await new Promise(r => setTimeout(r, delay));
          try {
            const retryResult = await writer.batchWrite(resolvedFiles, message);
            if (hasCurrentMdChanges) {
              this.contextVersion = retryResult.commitSha;
              await this.state.storage.put('contextPack', this.contextPack);
              await this.state.storage.put('contextVersion', this.contextVersion);
            }
            return retryResult;
          } catch (retryError) {
            if (attempt === 3 || (!retryError.message.includes('422') && !retryError.message.includes('409'))) {
              logger.error('Retry commit failed', { attempt, error: retryError.message });
              throw retryError;
            }
            // Continue retrying on 422/409
          }
        }
      }
      throw error;
    }
  }

  /**
   * Register stub responses for system tests.
   * @param {Request} request - Request with stub data
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleRegisterStubs(request, logger) {
    const payload = await request.json();
    const { test_id, claude, tavily } = payload;

    if (!test_id) {
      return new Response(
        JSON.stringify({ error: 'test_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (claude) {
      this._stubClaudeResponses.set(test_id, claude);
      // Reset cached client so it picks up new stubs
      this._claudeClient = null;
    }

    if (tavily) {
      this._stubTavilyResponses.set(test_id, tavily);
      this._tavilyClient = null;
    }

    logger.info('Stubs registered', { test_id, hasClaude: !!claude, hasTavily: !!tavily });

    return new Response(
      JSON.stringify({ status: 'ok', test_id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Get recorded Slack stub calls (system tests only).
   * @param {Object} logger - Logger instance
   * @returns {Response}
   */
  handleGetRecordings(logger) {
    const slackClient = this.getSlackClient();
    const recordings = slackClient.getRecordings?.() || [];

    return new Response(
      JSON.stringify({ recordings }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Clear recorded Slack stub calls (system tests only).
   * @param {Object} logger - Logger instance
   * @returns {Response}
   */
  handleClearRecordings(logger) {
    const slackClient = this.getSlackClient();
    slackClient.clearRecordings?.();

    return new Response(
      JSON.stringify({ status: 'ok' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Handle slash command.
   * @param {Object} payload - Command payload
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleCommand(payload, logger) {
    const { command, args, user_id, channel_id, channel_name, response_url, trace_id } = payload;

    // Thread trace_id through logger
    if (trace_id) {
      logger = logger.child({ traceId: trace_id });
    }

    logger.info('Handling command', { command, args, userId: user_id, traceId: trace_id });

    // Ensure context is loaded
    await this.ensureContext(logger);

    // Intercept /project research early for threaded delivery
    if (command === '/project') {
      const parts = (args || '').trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();
      if (subcommand === 'research') {
        const query = parts.slice(1).join(' ');
        if (!query) {
          // Fall through to normal handleProjectCommand for usage message
        } else {
          // Send ephemeral ack, then start research in background
          if (response_url) {
            await fetch(response_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                response_type: 'ephemeral',
                text: `Research started: "${query}"`,
              }),
            });
          } else if (channel_id) {
            const slack = this.getSlackClient();
            await slack.postMessage({ channel: channel_id, text: `Research started: "${query}"` });
          }

          // Start research with threading (non-blocking from response_url)
          this.startResearch(query, channel_id, channel_name, logger).catch(error => {
            logger.error('Background research failed', { error: error.message });
          });

          return new Response(
            JSON.stringify({ status: 'ok', command, action: 'research_started' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    try {
      let responseText;
      let responseType = 'in_channel';

      switch (command) {
        case '/what-matters':
          responseText = await this.handleWhatMatters(args, logger);
          break;

        case '/capture':
          responseText = await this.handleCapture(args, logger);
          break;

        case '/ritual':
          responseText = await this.handleRitualCommand(args, channel_id, logger);
          break;

        case '/project':
          responseText = await this.handleProjectCommand(args, channel_id, logger);
          break;

        default:
          responseText = `Unknown command: ${command}`;
          responseType = 'ephemeral';
      }

      // Deliver response: prefer response_url, fall back to chat.postMessage
      if (response_url) {
        await fetch(response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: responseType,
            text: responseText,
          }),
        });
      } else if (channel_id) {
        const slack = this.getSlackClient();
        await slack.postMessage({ channel: channel_id, text: responseText });
      }

      return new Response(
        JSON.stringify({ status: 'ok', command }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      logger.error('Command failed', { command, error: error.message });

      const errorMsg = `Sorry, ${command} failed: ${error.message}`;

      // Deliver error: prefer response_url, fall back to chat.postMessage
      if (response_url) {
        await fetch(response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            text: errorMsg,
          }),
        });
      } else if (channel_id) {
        const slack = this.getSlackClient();
        await slack.postMessage({ channel: channel_id, text: errorMsg });
      }

      throw error;
    }
  }

  /**
   * Handle /what-matters command.
   * Fetches fresh calendar and stream data, then prioritizes.
   * @param {Object} logger - Logger instance
   * @returns {Promise<string>} Response text
   */
  async handleWhatMatters(args, logger) {
    logger.info('Processing /what-matters');

    const claudeClient = this.getClaudeClient();
    const reader = this.getGitHubReader();

    // Get current date context
    const now = new Date();
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const todayISO = now.toISOString().split('T')[0];
    const tomorrowISO = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

    // Fetch fresh data in parallel
    const [calendar, todayStream, weeklyPlan] = await Promise.all([
      reader.getContent('data/planning/calendar-current.md').catch(() => null),
      reader.getContent(`data/stream/${todayISO}.md`).catch(() => null),
      reader.getContent('data/planning/weekly/' + getWeekId(now) + '.md').catch(() => null),
    ]);

    logger.info('Fresh data fetched', {
      hasCalendar: !!calendar,
      hasStream: !!todayStream,
      hasWeekly: !!weeklyPlan,
    });

    const systemPrompt = `You are a personal assistant helping Colin determine what matters most TODAY.

TODAY: ${dayOfWeek}, ${dateStr}

CRITICAL: Look at the CALENDAR section for today (${todayISO}) and tomorrow (${tomorrowISO}).
Any appointments or events scheduled for TODAY should be highlighted prominently.

Your job:
1. First, list any calendar events for TODAY - these are non-negotiable time commitments
2. Surface any Pending Review items that are blocking other work
3. Then identify 2-3 other important priorities from open loops, weekly goals, or patterns
4. Be CONCISE - just a focused list, not paragraphs of explanation
5. Don't lecture - just help focus

Format:
**Today's Calendar:**
- [time] Event (if any)

**Top Priorities:**
1. Priority with brief why
2. Priority with brief why`;

    // Extract Pending Review from context pack
    const pendingReviewMatch = this.contextPack?.match(/## Pending Review\n([\s\S]*?)(?=\n## |$)/);
    const pendingReview = pendingReviewMatch?.[1]?.trim() || '';

    const freshContext = `## Calendar (IMPORTANT - check for today ${todayISO} and tomorrow ${tomorrowISO})
${calendar || 'No calendar data'}

## Today's Stream (${todayISO})
${todayStream || 'No captures yet today'}

## Weekly Plan
${weeklyPlan || 'No weekly plan'}

## Pending Review (items needing clarification)
${pendingReview || 'No pending items'}

## Background Context
${this.contextPack?.slice(0, 3000) || 'No context loaded'}${args ? `\n\n## Additional Context\n${args}` : ''}`;

    const response = await claudeClient.message({
      system: systemPrompt,
      userMessage: freshContext,
    });

    return `*What Matters Today* (${dayOfWeek}, ${dateStr})\n\n${response}`;
  }

  /**
   * Handle /capture command.
   * Captures item and writes to appropriate file.
   * @param {string} args - Command arguments (type + content)
   * @param {Object} logger - Logger instance
   * @returns {Promise<string>} Response text
   */
  async handleCapture(args, logger) {
    logger.info('Processing /capture', { args });

    if (!args || args.trim() === '') {
      return 'Usage: `/capture <type> <content>`\nTypes: task, idea, event, note, person';
    }

    const parts = args.trim().split(/\s+/);
    const type = parts[0].toLowerCase();
    const content = parts.slice(1).join(' ');

    if (!content) {
      return `Please provide content after the type. Example: \`/capture ${type} Buy groceries\``;
    }

    const validTypes = ['task', 'idea', 'event', 'note', 'person'];
    if (!validTypes.includes(type)) {
      return `Unknown type: "${type}". Valid types: ${validTypes.join(', ')}`;
    }

    // Get current date/time using timezone-aware utils
    const date = getLocalDate();
    const time = getLocalTime();

    // Format the capture entry
    const entry = `- ${time} | [${type}] ${content}`;

    // Commit atomically via write intents
    const intents = [
      toolIntent(`data/stream/${date}.md`, 'append_to_section', {
        heading: '## Captures',
        content: entry,
      }),
    ];
    await this.commitWriteSet(intents, `Capture ${type}: ${content.slice(0, 50)}`, logger);

    logger.info('Capture written', { type, date });

    const emoji = { task: '✅', idea: '💡', event: '📅', note: '📝', person: '👤' }[type] || '📌';
    return `${emoji} Captured ${type}: "${content}"`;
  }

  /**
   * Handle /ritual command.
   * Starts weekly or monthly ritual.
   * @param {string} args - Command arguments (weekly/monthly)
   * @param {string} channelId - Channel ID
   * @param {Object} logger - Logger instance
   * @returns {Promise<string>} Response text
   */
  async handleRitualCommand(args, channelId, logger) {
    const ritualType = args?.trim().toLowerCase();

    if (!ritualType || !['weekly', 'monthly'].includes(ritualType)) {
      return 'Usage: `/ritual weekly` or `/ritual monthly`';
    }

    // Check if in correct channel
    const expectedChannel = ritualType === 'weekly'
      ? this.env.SLACK_WEEKLY_CHANNEL_ID
      : this.env.SLACK_MONTHLY_CHANNEL_ID;

    if (expectedChannel && channelId !== expectedChannel) {
      return `Please run this command in the #sb-${ritualType} channel.`;
    }

    // Route to RitualDO
    const ritualDOId = this.env.RITUAL_DO.idFromName(`ritual-${ritualType}`);
    const ritualDO = this.env.RITUAL_DO.get(ritualDOId);

    const response = await ritualDO.fetch(
      new Request('http://internal/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ritualType,
          contextPack: this.contextPack,
          channelId,
        }),
      })
    );

    const result = await response.json();
    return result.message || `Starting ${ritualType} ritual...`;
  }

  /**
   * Handle /project command.
   * Project management commands.
   * @param {string} args - Command arguments
   * @param {string} channelId - Channel ID
   * @param {Object} logger - Logger instance
   * @returns {Promise<string>} Response text
   */
  async handleProjectCommand(args, channelId, logger) {
    const parts = (args || '').trim().split(/\s+/);
    const subcommand = parts[0]?.toLowerCase();
    const projectArg = parts.slice(1).join(' ');

    if (!subcommand) {
      return 'Usage:\n• `/project list` - List active projects\n• `/project new <name>` - Create new project\n• `/project archive <slug>` - Archive a project\n• `/project research <query>` - Research a topic\n• `/project status` - Show project status (in project channel)';
    }

    switch (subcommand) {
      case 'list':
        return this.listProjects(logger);

      case 'new':
        if (!projectArg) {
          return 'Usage: `/project new <project name>`';
        }
        return this.createProject(projectArg, logger);

      case 'research':
        if (!projectArg) {
          return 'Usage: `/project research <query>`\nExample: `/project research concierge doctors in asheville`';
        }
        // This path is only reached if the early intercept in handleCommand didn't trigger
        // (e.g., missing query was already handled above)
        return 'Research started. Check the channel for a new thread with results.';

      case 'archive':
        if (!projectArg) {
          return 'Usage: `/project archive <project-slug>`';
        }
        return this.archiveProject(projectArg.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), logger);

      case 'status':
        return 'Run this command in a #proj-* channel to see project status.';

      default:
        return `Unknown subcommand: ${subcommand}. Try: list, new, archive, research, status`;
    }
  }

  /**
   * List active projects from context.
   * @param {Object} logger - Logger instance
   * @returns {Promise<string>} Project list
   */
  async listProjects(logger) {
    // Extract projects from context
    const projectMatch = this.contextPack?.match(/## Active Projects\n([\s\S]*?)(?=\n## |$)/);

    if (!projectMatch || !projectMatch[1].trim()) {
      return 'No active projects found.';
    }

    return `*Active Projects*\n${projectMatch[1].trim()}`;
  }

  /**
   * Create a new project with full lifecycle.
   * 1. Create spread.md + logs/.gitkeep + update index.md (atomic commit)
   * 2. Create Slack channel #proj-{slug}
   * 3. Invite bot + user
   * 4. Post initial message
   * 5. Invalidate context cache
   *
   * @param {string} name - Project name
   * @param {Object} logger - Logger instance
   * @returns {Promise<string>} Response
   */
  async createProject(name, logger) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const spreadContent = `# ${name}

## Status
Active

## Description
_Add project description here_

## Next Actions
- [ ] Define project scope

## Context

## Research
`;

    try {
      // Step 1: Create files + rebuild index atomically
      const updatedIndex = await this.rebuildProjectIndex(logger, { [slug]: spreadContent });

      const intents = [
        putIntent(`data/projects/${slug}/spread.md`, spreadContent),
        putIntent(`data/projects/${slug}/logs/.gitkeep`, ''),
        putIntent('data/projects/index.md', updatedIndex),
      ];
      await this.commitWriteSet(intents, `Create project: ${name}`, logger);

      logger.info('Project files created', { name, slug });

      // Step 2: Create Slack channel
      const slackClient = this.getSlackClient();
      const channelName = `proj-${slug}`;
      let channelId = null;

      try {
        const channelResult = await slackClient.createChannel({ name: channelName });
        channelId = channelResult.channel?.id;
        logger.info('Slack channel created', { channelName, channelId });
      } catch (channelError) {
        if (channelError.code === 'name_taken') {
          // Channel already exists — try to find it
          const existing = await slackClient.findChannelByName(channelName);
          channelId = existing?.id;
          logger.info('Channel already exists', { channelName, channelId });
        } else {
          logger.warn('Could not create Slack channel', { error: channelError.message });
        }
      }

      // Step 3: Invite bot + user
      if (channelId) {
        try {
          const usersToInvite = [];
          if (this.env.SLACK_BOT_USER_ID) usersToInvite.push(this.env.SLACK_BOT_USER_ID);
          if (this.env.SLACK_USER_ID) usersToInvite.push(this.env.SLACK_USER_ID);

          if (usersToInvite.length > 0) {
            await slackClient.inviteToChannel({ channel: channelId, users: usersToInvite });
            logger.info('Users invited to channel', { channelId, users: usersToInvite });
          }
        } catch (inviteError) {
          // already_in_channel is fine
          if (inviteError.code !== 'already_in_channel') {
            logger.warn('Could not invite to channel', { error: inviteError.message });
          }
        }

        // Step 4: Post initial message
        try {
          await slackClient.postMessage({
            channel: channelId,
            text: `Project *${name}* has been created.\n\nThis channel is linked to the project. Messages here update the project spread.\n\n_Next action: Define project scope_`,
          });
        } catch (msgError) {
          logger.warn('Could not post initial message', { error: msgError.message });
        }
      }

      // Step 5: Invalidate context cache
      await this.invalidateContext();

      const channelNote = channelId
        ? `Channel \`#${channelName}\` is ready.`
        : `_Could not create Slack channel. Create \`#${channelName}\` manually._`;

      return `Created project: *${name}*\n${channelNote}`;
    } catch (error) {
      if (error.message.includes('already exists')) {
        return `Project "${name}" already exists.`;
      }
      throw error;
    }
  }

  /**
   * Archive a project.
   * 1. Update spread status to "archived"
   * 2. Rebuild index
   * 3. Archive Slack channel
   * 4. Invalidate context cache
   *
   * @param {string} slug - Project slug
   * @param {Object} logger - Logger instance
   * @returns {Promise<string>} Response
   */
  async archiveProject(slug, logger) {
    const reader = this.getGitHubReader();
    const spreadPath = `data/projects/${slug}/spread.md`;

    // Read current spread
    let spread;
    try {
      spread = await reader.getContent(spreadPath);
    } catch {
      return `Project "${slug}" not found.`;
    }

    if (!spread) {
      return `Project "${slug}" not found.`;
    }

    // Update status to archived
    const updatedSpread = spread.replace(
      /## Status\n[\s\S]*?(?=\n## |$)/,
      '## Status\nArchived\n'
    );

    // Rebuild index with updated spread
    const updatedIndex = await this.rebuildProjectIndex(logger, { [slug]: updatedSpread });

    const intents = [
      putIntent(spreadPath, updatedSpread),
      putIntent('data/projects/index.md', updatedIndex),
    ];
    await this.commitWriteSet(intents, `Archive project: ${slug}`, logger);

    logger.info('Project archived', { slug });

    // Archive Slack channel
    const slackClient = this.getSlackClient();
    const channelName = `proj-${slug}`;

    try {
      const channel = await slackClient.findChannelByName(channelName);
      if (channel?.id) {
        await slackClient.archiveChannel({ channel: channel.id });
        logger.info('Slack channel archived', { channelName });
      }
    } catch (archiveError) {
      logger.warn('Could not archive Slack channel', { error: archiveError.message });
    }

    // Invalidate context cache
    await this.invalidateContext();

    return `Archived project: *${slug}*`;
  }

  /**
   * Rebuild the project index from all spread.md files.
   * Optionally accepts overrides for spreads being modified in the same commit.
   *
   * @param {Object} logger - Logger instance
   * @param {Object} [overrides] - Map of slug → spread content for files being changed
   * @returns {Promise<string>} Index file content
   */
  async rebuildProjectIndex(logger, overrides = {}) {
    const reader = this.getGitHubReader();

    // List all project directories
    let projectDirs = [];
    try {
      projectDirs = await reader.listDirectory('data/projects');
    } catch {
      logger.warn('Could not list project directories');
    }

    const projects = [];

    for (const entry of projectDirs) {
      // Skip index.md and other non-directory entries
      if (entry.type !== 'dir' && !entry.name?.match(/^[a-z0-9-]+$/)) continue;
      const dirSlug = entry.name || entry;

      // Use override if available
      if (overrides[dirSlug]) {
        projects.push(parseSpreadForIndex(dirSlug, overrides[dirSlug]));
        continue;
      }

      // Read spread.md
      try {
        const content = await reader.getContent(`data/projects/${dirSlug}/spread.md`);
        if (content) {
          projects.push(parseSpreadForIndex(dirSlug, content));
        }
      } catch {
        logger.debug('Could not read spread for project', { slug: dirSlug });
      }
    }

    // Also add any overrides for new projects not yet in the directory listing
    for (const [slug, content] of Object.entries(overrides)) {
      if (!projects.find(p => p.slug === slug)) {
        projects.push(parseSpreadForIndex(slug, content));
      }
    }

    return buildIndexContent(projects);
  }

  /**
   * Start a threaded research session.
   *
   * Posts an initial message to create a thread, then runs the full
   * research pipeline with progress updates in that thread.
   *
   * @param {string} query - Research query
   * @param {string} channelId - Channel to post in
   * @param {string} [channelName] - Channel name (for project detection)
   * @param {Object} logger - Logger instance
   * @returns {Promise<Object>} Research result
   */
  async startResearch(query, channelId, channelName, logger) {
    logger.info('Starting threaded research', { query, channelName });

    const slackClient = this.getSlackClient();
    const claudeClient = this.getClaudeClient();
    const tavilyClient = this.getTavilyClient();
    const githubWriter = this.getGitHubWriter();

    // Detect project from channel name
    let projectSlug = null;
    let spread = null;

    if (channelName?.startsWith('proj-')) {
      projectSlug = channelName.slice(5);
      // Load spread for project context
      try {
        const reader = this.getGitHubReader();
        spread = await reader.getContent(`data/projects/${projectSlug}/spread.md`);
      } catch (error) {
        logger.warn('Could not load project spread', { projectSlug, error: error.message });
      }
    } else {
      // Try to infer project from query
      const inference = await inferProject(query, this.contextPack, claudeClient, logger);
      if (inference.projectSlug && inference.confidence >= 0.7) {
        projectSlug = inference.projectSlug;
        logger.info('Project inferred', { projectSlug, confidence: inference.confidence });
        try {
          const reader = this.getGitHubReader();
          spread = await reader.getContent(`data/projects/${projectSlug}/spread.md`);
        } catch (error) {
          logger.warn('Could not load inferred project spread', { projectSlug, error: error.message });
        }
      }
    }

    // Post initial message to create thread
    const initialMsg = await slackClient.postMessage({
      channel: channelId,
      text: `**Research: ${query}**${projectSlug ? `\n_Associated with proj-${projectSlug}_` : ''}\n\n_Starting research pipeline..._`,
    });

    const threadTs = initialMsg.ts;

    try {
      // Run the full research pipeline
      const result = await executeResearch(
        { query },
        {
          projectSlug,
          spread,
          channelId,
          threadTs,
          contextPack: this.contextPack,
        },
        { claudeClient, tavilyClient, slackClient, githubWriter, logger }
      );

      // If project associated, update spread with research section
      if (projectSlug && spread && result.synthesis) {
        const { applySpreadUpdates } = await import('../agents/project-agent.js');
        const { formatSynthesisForSpread } = await import('../agents/synthesis-agent.js');
        const date = new Date().toISOString().split('T')[0];
        const spreadContent = formatSynthesisForSpread(result.synthesis, query, date);

        const updatedSpread = applySpreadUpdates(spread, [{
          section: 'Research',
          action: 'append',
          content: spreadContent,
        }]);

        const intents = [
          putIntent(`data/projects/${projectSlug}/spread.md`, updatedSpread),
        ];
        await this.commitWriteSet(intents, `Update ${projectSlug} research: ${query.slice(0, 40)}`, logger);
        logger.info('Spread updated with research', { projectSlug });
      }

      return result;
    } catch (error) {
      logger.error('Research pipeline failed', { query, error: error.message });

      await slackClient.postMessage({
        channel: channelId,
        text: `_Research failed: ${error.message}_`,
        thread_ts: threadTs,
      });

      throw error;
    }
  }
}

