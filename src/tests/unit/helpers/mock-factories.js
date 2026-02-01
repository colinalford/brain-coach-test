/**
 * Mock factories for unit tests.
 *
 * Provides consistent mock objects for dependencies.
 */

import { jest } from '@jest/globals';

/**
 * Create a mock Durable Object state.
 */
export function createMockState() {
  const storage = new Map();
  return {
    storage: {
      get: jest.fn(async (key) => storage.get(key)),
      put: jest.fn(async (key, value) => storage.set(key, value)),
      delete: jest.fn(async (key) => storage.delete(key)),
      list: jest.fn(async () => storage),
    },
    _storage: storage,
  };
}

/**
 * Create a mock environment bindings object.
 */
export function createMockEnv(overrides = {}) {
  return {
    SLACK_BOT_TOKEN: 'xoxb-mock',
    SLACK_INBOX_CHANNEL_ID: 'C_INBOX',
    SLACK_WEEKLY_CHANNEL_ID: 'C_WEEKLY',
    SLACK_MONTHLY_CHANNEL_ID: 'C_MONTHLY',
    ANTHROPIC_API_KEY: 'sk-mock',
    GITHUB_TOKEN: 'ghp_mock',
    GITHUB_REPO: 'test/repo',
    TAVILY_API_KEY: 'tvly-mock',
    PROJECT_DO: {
      idFromName: jest.fn(() => ({ toString: () => 'mock-id' })),
      get: jest.fn(() => ({
        fetch: jest.fn(async () => new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        })),
      })),
    },
    RITUAL_DO: {
      idFromName: jest.fn(() => ({ toString: () => 'mock-id' })),
      get: jest.fn(() => ({
        fetch: jest.fn(async () => new Response(JSON.stringify({ status: 'ok', message: 'Ritual started' }), {
          headers: { 'Content-Type': 'application/json' },
        })),
      })),
    },
    ...overrides,
  };
}

/**
 * Create a mock logger.
 */
export function createMockLogger() {
  return {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

/**
 * Create a mock Claude client with configurable responses.
 * @param {Object|string|Function} responses - Response(s) to return
 */
export function createMockClaudeClient(responses = {}) {
  const resolveResponse = (r) => {
    if (typeof r === 'function') return r();
    if (typeof r === 'string') return r;
    return r;
  };

  let messageCallCount = 0;
  let messageJsonCallCount = 0;

  const messageResponses = responses.message
    ? [].concat(responses.message)
    : ['Mock response'];

  const messageJsonResponses = responses.messageJson
    ? [].concat(responses.messageJson)
    : [{ intent: 'capture', confidence: 0.9, reasoning: 'mock' }];

  return {
    message: jest.fn(async () => {
      const idx = Math.min(messageCallCount++, messageResponses.length - 1);
      return resolveResponse(messageResponses[idx]);
    }),
    messageJson: jest.fn(async () => {
      const idx = Math.min(messageJsonCallCount++, messageJsonResponses.length - 1);
      return resolveResponse(messageJsonResponses[idx]);
    }),
    conversation: jest.fn(async () => 'Mock conversation response'),
    classify: jest.fn(async () => ({ intent: 'capture', confidence: 0.9, reasoning: 'mock' })),
  };
}

/**
 * Create a mock Slack client.
 */
export function createMockSlackClient() {
  return {
    postMessage: jest.fn(async (params) => ({
      ok: true,
      ts: `${Date.now() / 1000}`,
      channel: params.channel,
    })),
    addReaction: jest.fn(async () => ({ ok: true })),
    removeReaction: jest.fn(async () => ({ ok: true })),
    getChannelInfo: jest.fn(async () => ({
      ok: true,
      channel: { id: 'C_MOCK', name: 'mock-channel' },
    })),
    createChannel: jest.fn(async (name) => ({
      ok: true,
      channel: { id: 'C_NEW', name },
    })),
  };
}

/**
 * Create a mock GitHub writer.
 */
export function createMockGitHubWriter() {
  return {
    writeFile: jest.fn(async () => ({ ok: true })),
    createFile: jest.fn(async () => ({ ok: true })),
    appendToFile: jest.fn(async () => ({ ok: true })),
    appendToSection: jest.fn(async () => ({ ok: true })),
    replaceSection: jest.fn(async () => ({ ok: true })),
    batchWrite: jest.fn(async () => ({ ok: true })),
  };
}

/**
 * Create a mock GitHub reader.
 */
export function createMockGitHubReader(files = {}) {
  return {
    getContent: jest.fn(async (path) => files[path] || null),
    getSha: jest.fn(async () => 'mock-sha-abc123'),
    listDirectory: jest.fn(async () => []),
  };
}

/**
 * Create a mock Tavily client.
 */
export function createMockTavilyClient(results = []) {
  return {
    search: jest.fn(async () => ({
      results: results.length > 0 ? results : [
        { url: 'https://example.com', title: 'Mock Result', content: 'Mock content', score: 0.9 },
      ],
      answer: 'Mock answer',
    })),
  };
}
