/**
 * HTTP mocking helpers using nock.
 *
 * Provides wrappers for mocking external API calls.
 */

import nock from 'nock';

export function disableNetConnect() {
  nock.disableNetConnect();
}

export function enableNetConnect() {
  nock.enableNetConnect();
}

export function cleanAll() {
  nock.cleanAll();
}

export function mockSlackApi() {
  return nock('https://slack.com');
}

export function mockClaudeApi() {
  return nock('https://api.anthropic.com');
}

export function mockTavilyApi() {
  return nock('https://api.tavily.com');
}

export function mockGitHubApi() {
  return nock('https://api.github.com');
}

export async function loadFixture(path) {
  const fs = await import('fs/promises');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const content = await fs.readFile(join(__dirname, '../../fixtures/', path), 'utf-8');
  if (path.endsWith('.json')) return JSON.parse(content);
  return content;
}

// Convenience helpers

export function mockSlackPostMessage(response = { ok: true }) {
  return mockSlackApi()
    .post('/api/chat.postMessage')
    .reply(200, response);
}

export function mockClaudeMessage(responseObj) {
  return mockClaudeApi()
    .post('/v1/messages')
    .reply(200, {
      content: [{ type: 'text', text: JSON.stringify(responseObj) }],
    });
}

export function mockTavilySearch(response) {
  return mockTavilyApi()
    .post('/search')
    .reply(200, response);
}

export function mockGitHubContent(path, content) {
  const encoded = Buffer.from(content).toString('base64');
  return mockGitHubApi()
    .get(new RegExp(`/repos/[^/]+/[^/]+/contents/${path.replace('/', '\\/')}`))
    .reply(200, { content: encoded, sha: 'mock-sha' });
}
