/**
 * Stub Tavily Client for System Tests.
 *
 * Returns canned search results keyed by test_id.
 * If no stub response is registered, throws an error.
 */

import { extractTestId } from './stub-claude-client.js';

/**
 * Create a stub Tavily client that returns canned results.
 * @param {Object} options
 * @param {Map} options.stubResponses - Map of test_id → search results
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Stub Tavily client with same interface as real client
 */
export function createStubTavilyClient({ stubResponses, logger } = {}) {
  const log = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
  const responses = stubResponses || new Map();

  function findResponse(query) {
    const testId = extractTestId(query);
    if (testId && responses.has(testId)) {
      log.debug('StubTavilyClient returning canned results', { testId });
      return responses.get(testId);
    }

    // Return empty results if no stub registered (search is optional in many flows)
    log.debug('StubTavilyClient returning empty results', { query: query?.slice(0, 50) });
    return {
      results: [],
      answer: null,
    };
  }

  return {
    async search({ query, searchDepth, maxResults, includeAnswer, includeDomains, excludeDomains }) {
      return findResponse(query);
    },

    async searchMultiple(queries, options = {}) {
      return queries.map(query => ({
        query,
        results: findResponse(query).results || [],
        answer: findResponse(query).answer,
      }));
    },

    async quickAnswer(query) {
      const response = findResponse(query);
      return response.answer || null;
    },

    formatResults(results) {
      if (!results || results.length === 0) {
        return '_No results found._';
      }
      return results.map((r, i) =>
        `${i + 1}. **${r.title || 'Untitled'}**\n   ${r.url || ''}`
      ).join('\n\n');
    },
  };
}
