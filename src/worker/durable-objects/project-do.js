/**
 * ProjectDO - Durable Object for per-project state.
 *
 * Each project has its own DO that holds:
 * - spread.md content in memory
 * - Project index reference
 * - Research thread state
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
import { putIntent } from '../lib/write-intent.js';
import { projectAgent, applySpreadUpdates } from '../agents/project-agent.js';
import { researchCoordinator, formatResearchLog } from '../agents/research-coordinator.js';
import { executeResearch, persistResearch } from '../agents/research-agent.js';
import { formatSynthesisForSpread } from '../agents/synthesis-agent.js';

/**
 * ProjectDO Durable Object class.
 */
export class ProjectDO {
  /**
   * @param {DurableObjectState} state - Durable Object state
   * @param {Object} env - Environment bindings
   */
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // In-memory cache
    this.spread = null;
    this.spreadVersion = null;
    this.projectSlug = null;

    // Research thread tracking (thread_ts -> state)
    this.researchThreads = new Map();

    // Stub response maps (populated from BrainDO in stub mode)
    this._stubClaudeResponses = new Map();
    this._stubTavilyResponses = new Map();
    this._useStubSlack = false;

    // Clients
    this._githubReader = null;
    this._slackClient = null;
    this._claudeClient = null;
    this._tavilyClient = null;
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
        component: 'ProjectDO',
        requestId: requestId || generateRequestId(),
        projectSlug: this.projectSlug,
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
   * Get or create Tavily client.
   * Uses stub client when stub responses are available (forwarded from BrainDO).
   * @returns {Object} Tavily client instance
   */
  getTavilyClient() {
    if (!this._tavilyClient) {
      if (this._stubTavilyResponses.size > 0 || this.env.SEARCH_MODE === 'stub') {
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
            component: 'ProjectDO',
            projectSlug: this.projectSlug,
            spreadLoaded: this.spread !== null,
            activeResearchThreads: this.researchThreads.size,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
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
   * Ensure project spread is loaded.
   * @param {Object} logger - Logger instance
   */
  async ensureSpread(logger) {
    if (this.spread && this.spreadVersion) {
      logger.debug('Using cached spread', { version: this.spreadVersion });
      return;
    }

    // Check durable storage
    const storedSpread = await this.state.storage.get('spread');
    const storedVersion = await this.state.storage.get('spreadVersion');

    if (storedSpread && storedVersion) {
      // Verify against GitHub
      const githubVersion = await this.getGitHubSha(logger);

      if (githubVersion === storedVersion) {
        this.spread = storedSpread;
        this.spreadVersion = storedVersion;
        logger.debug('Using stored spread', { version: this.spreadVersion });
        return;
      }
    }

    // Reload from GitHub
    await this.reloadSpread(logger);
  }

  /**
   * Get SHA of spread file from GitHub.
   * @param {Object} logger - Logger instance
   * @returns {Promise<string|null>}
   */
  async getGitHubSha(logger) {
    try {
      const reader = this.getGitHubReader();
      return await reader.getSha(`data/projects/${this.projectSlug}/spread.md`);
    } catch (error) {
      logger.error('Failed to get spread SHA', { error: error.message });
      return null;
    }
  }

  /**
   * Reload spread from GitHub.
   * @param {Object} logger - Logger instance
   */
  async reloadSpread(logger) {
    logger.info('Loading spread from GitHub', { projectSlug: this.projectSlug });

    const reader = this.getGitHubReader();
    const path = `data/projects/${this.projectSlug}/spread.md`;

    const [content, sha] = await Promise.all([
      reader.getContent(path),
      reader.getSha(path),
    ]);

    if (!content) {
      // Project doesn't exist yet - create default spread
      this.spread = this.createDefaultSpread();
      this.spreadVersion = 'new';
      logger.info('Created default spread for new project');
    } else {
      this.spread = content;
      this.spreadVersion = sha;
    }

    // Persist to durable storage
    await this.state.storage.put('spread', this.spread);
    await this.state.storage.put('spreadVersion', this.spreadVersion);

    logger.info('Spread loaded', { version: this.spreadVersion });
  }

  /**
   * Create default spread for a new project.
   * @returns {string} Default spread content
   */
  createDefaultSpread() {
    const date = new Date().toISOString().split('T')[0];
    return `# ${this.projectSlug}

Created: ${date}
Status: active

## Summary

*Project description goes here.*

## Next Actions

- [ ] Define project goals

## Notes

## Research

## Log

- ${date} | Project created
`;
  }

  /**
   * Handle incoming message.
   * @param {Object} payload - Message payload
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleMessage(payload, logger) {
    const { projectSlug, channel_id, text, message_ts, thread_ts, contextPack,
            _stubClaudeResponses, _stubTavilyResponses, _slackMode } = payload;

    // Store project slug
    this.projectSlug = projectSlug;

    // Accept stub configuration forwarded from BrainDO
    if (_stubClaudeResponses) {
      this._stubClaudeResponses = new Map(Object.entries(_stubClaudeResponses));
      this._claudeClient = null; // Reset to pick up stubs
    }
    if (_stubTavilyResponses) {
      this._stubTavilyResponses = new Map(Object.entries(_stubTavilyResponses));
      this._tavilyClient = null; // Reset to pick up stubs
    }
    if (_slackMode === 'stub') {
      this._useStubSlack = true;
      this._slackClient = null; // Reset to pick up stub mode
    }

    logger.info('Processing project message', { projectSlug, hasThread: !!thread_ts });

    const slackClient = this.getSlackClient();
    const claudeClient = this.getClaudeClient();

    try {
      // Add thinking reaction
      await slackClient.addReaction({
        channel: channel_id,
        timestamp: message_ts,
        name: 'brain',
      });

      // Ensure spread is loaded
      await this.ensureSpread(logger);

      // Check if this is a reply in an active research thread
      if (thread_ts && this.researchThreads.has(thread_ts)) {
        return this.handleResearchMessage(payload, logger);
      }

      // Get date/time context
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 5);

      // Process with Project Agent
      const result = await projectAgent(
        text,
        {
          spread: this.spread,
          projectSlug,
          date,
          time,
        },
        { claudeClient, logger }
      );

      // Check if agent wants to start research
      const startResearchAction = result.actions.find(a => a.type === 'start_research');
      if (startResearchAction) {
        return this.startResearchSession(payload, startResearchAction, logger);
      }

      // Apply spread updates
      const spreadUpdates = result.actions.filter(a =>
        a.file?.includes('spread.md')
      );

      // Build write intents for spread updates
      const writeIntents = [];

      if (spreadUpdates.length > 0) {
        // Apply updates to spread in memory
        this.spread = applySpreadUpdates(this.spread, spreadUpdates.map(a => ({
          section: a.section.replace('## ', ''),
          action: a.type === 'replace_section' ? 'replace' : 'append',
          content: a.content,
        })));

        // Persist updated spread to DO storage
        await this.state.storage.put('spread', this.spread);

        // Return write intent for BrainDO to commit atomically
        writeIntents.push(putIntent(
          `data/projects/${projectSlug}/spread.md`,
          this.spread
        ));

        logger.info('Spread updated, returning write intent', { updateCount: spreadUpdates.length });
      }

      // Reply to Slack
      await slackClient.postMessage({
        channel: channel_id,
        text: result.slackReply,
        thread_ts: thread_ts || message_ts,
      });

      // Include stub recordings if in stub mode
      const stubRecordings = this._useStubSlack ? (slackClient.getRecordings?.() || []) : [];

      return new Response(
        JSON.stringify({
          status: 'ok',
          action: 'project_processed',
          projectSlug,
          updateCount: spreadUpdates.length,
          writeIntents,
          _stubRecordings: stubRecordings,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      logger.error('Failed to handle project message', { error: error.message, stack: error.stack });

      // Send error message
      try {
        await slackClient.postMessage({
          channel: channel_id,
          text: `_Error processing project message: ${error.message}_`,
          thread_ts: thread_ts || message_ts,
        });
      } catch {
        // Ignore Slack errors in error path
      }

      throw error;
    }
  }

  /**
   * Start a new research session using the unified pipeline.
   * @param {Object} payload - Original message payload
   * @param {Object} action - Research action with query
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async startResearchSession(payload, action, logger) {
    const { channel_id, message_ts, thread_ts, contextPack } = payload;
    const { query, scope } = action;

    logger.info('Starting research session', { query, projectSlug: this.projectSlug });

    const slackClient = this.getSlackClient();
    const claudeClient = this.getClaudeClient();
    const tavilyClient = this.getTavilyClient();
    const githubWriter = this.getGitHubWriter();

    // Post research kickoff message to create thread
    const response = await slackClient.postMessage({
      channel: channel_id,
      text: `**Research: ${query}**\n_Associated with proj-${this.projectSlug}_\n\n_Starting research pipeline..._`,
      thread_ts: thread_ts || message_ts,
    });

    const threadTs = thread_ts || response.ts;

    try {
      // Run the full research pipeline
      const result = await executeResearch(
        { query },
        {
          projectSlug: this.projectSlug,
          spread: this.spread,
          channelId: channel_id,
          threadTs,
          contextPack,
        },
        { claudeClient, tavilyClient, slackClient, githubWriter, logger }
      );

      // Update spread with research section (replace, not append)
      if (result.synthesis) {
        const date = new Date().toISOString().split('T')[0];
        const spreadContent = formatSynthesisForSpread(result.synthesis, query, date);

        this.spread = applySpreadUpdates(this.spread, [{
          section: 'Research',
          action: 'append',
          content: spreadContent,
        }]);

        await this.state.storage.put('spread', this.spread);

        await githubWriter.writeFile(
          `data/projects/${this.projectSlug}/spread.md`,
          this.spread,
          `Update ${this.projectSlug} research: ${query.slice(0, 40)}`
        );
        logger.info('Spread updated with research', { projectSlug: this.projectSlug });
      }

      // Include stub recordings if in stub mode
      const stubRecordings = this._useStubSlack ? (slackClient.getRecordings?.() || []) : [];

      return new Response(
        JSON.stringify({
          status: 'ok',
          action: 'research_completed',
          threadTs,
          query,
          findingCount: result.findings.length,
          _stubRecordings: stubRecordings,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      logger.error('Research pipeline failed', { query, error: error.message });

      await slackClient.postMessage({
        channel: channel_id,
        text: `_Research failed: ${error.message}_`,
        thread_ts: threadTs,
      });

      // Include stub recordings even on error so test can see what happened
      const stubRecordings = this._useStubSlack ? (slackClient.getRecordings?.() || []) : [];

      return new Response(
        JSON.stringify({ status: 'error', error: error.message, _stubRecordings: stubRecordings }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Handle a message in an active research thread.
   * @param {Object} payload - Message payload
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async handleResearchMessage(payload, logger) {
    const { channel_id, text, message_ts, thread_ts } = payload;

    logger.info('Research thread message', { threadTs: thread_ts });

    const slackClient = this.getSlackClient();
    const claudeClient = this.getClaudeClient();
    const tavilyClient = this.getTavilyClient();

    // Get thread state
    let threadState = await this.state.storage.get(`research-${thread_ts}`);

    if (!threadState) {
      logger.warn('Research thread state not found', { threadTs: thread_ts });
      this.researchThreads.delete(thread_ts);
      return new Response(
        JSON.stringify({ status: 'ok', action: 'thread_not_found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Add message to thread state
    threadState.messages.push({
      role: 'user',
      content: text,
      ts: message_ts,
    });

    // Process with Research Coordinator
    const result = await researchCoordinator(text, threadState, {
      claudeClient,
      tavilyClient,
      logger,
    });

    // Apply state updates
    if (result.stateUpdate) {
      threadState = { ...threadState, ...result.stateUpdate };
    }

    // Add assistant message to history
    threadState.messages.push({
      role: 'assistant',
      content: result.slackReply,
      ts: Date.now().toString(),
    });

    // Check if finalizing
    if (result.finalize) {
      return this.finalizeResearch(payload, threadState, result, logger);
    }

    // Save updated state
    await this.state.storage.put(`research-${thread_ts}`, threadState);

    // Reply to Slack
    await slackClient.postMessage({
      channel: channel_id,
      text: result.slackReply,
      thread_ts,
    });

    return new Response(
      JSON.stringify({
        status: 'ok',
        action: 'research_message_processed',
        findingCount: threadState.findings?.length || 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Finalize research session.
   * Uses shared persist logic from research-agent.js.
   * @param {Object} payload - Message payload
   * @param {Object} threadState - Research thread state
   * @param {Object} coordinatorResult - Result from research coordinator (optional)
   * @param {Object} logger - Logger instance
   * @returns {Promise<Response>}
   */
  async finalizeResearch(payload, threadState, coordinatorResult, logger) {
    const { channel_id, thread_ts } = payload;

    logger.info('Finalizing research', { query: threadState.query });

    const slackClient = this.getSlackClient();
    const githubWriter = this.getGitHubWriter();

    // Use coordinator result if available, otherwise use what's in state
    const synthesis = coordinatorResult?.synthesis || threadState.synthesis || threadState.lastSynthesis;
    const spreadContent = coordinatorResult?.spreadContent || threadState.spreadContent;
    const slackReply = coordinatorResult?.slackReply || 'Research complete. Summary added to project spread.';

    // Update spread with research summary (replace section, not append)
    if (spreadContent) {
      this.spread = applySpreadUpdates(this.spread, [{
        section: 'Research',
        action: 'append',
        content: spreadContent,
      }]);

      await this.state.storage.put('spread', this.spread);
    }

    // Use shared persist logic for log + spread + stream
    await persistResearch(this.projectSlug, synthesis || { summary: slackReply, keyPoints: [], recommendations: [], sources: [] }, threadState, {
      query: threadState.query,
      allFindings: threadState.findings || [],
      githubWriter,
      logger,
    });

    // Write updated spread to git
    if (spreadContent) {
      try {
        await githubWriter.writeFile(
          `data/projects/${this.projectSlug}/spread.md`,
          this.spread,
          `Update ${this.projectSlug} research`
        );
        logger.info('Spread updated with research', { projectSlug: this.projectSlug });
      } catch (error) {
        logger.error('Failed to write spread', { error: error.message });
      }
    }

    // Clean up thread state
    await this.state.storage.delete(`research-${thread_ts}`);
    this.researchThreads.delete(thread_ts);

    // Post completion message
    await slackClient.postMessage({
      channel: channel_id,
      text: slackReply,
      thread_ts,
    });

    return new Response(
      JSON.stringify({
        status: 'ok',
        action: 'research_finalized',
        query: threadState.query,
        findingCount: threadState.findings?.length || 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
