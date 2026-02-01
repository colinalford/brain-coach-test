/**
 * Tavily Search API client for Cloudflare Workers.
 * Edge-compatible version with timeout support.
 */

const TAVILY_API_BASE = 'https://api.tavily.com';
const DEFAULT_TIMEOUT = 20000; // 20 seconds for search operations

/**
 * Create a Tavily client for edge environments.
 * @param {Object} options
 * @param {string} options.apiKey - Tavily API key
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.timeout] - Request timeout in ms
 * @returns {Object} Tavily client instance
 */
export function createTavilyClient({ apiKey, logger, timeout = DEFAULT_TIMEOUT }) {
  if (!apiKey) {
    throw new Error('Tavily API key is required');
  }

  const log = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  /**
   * Make a request to Tavily API with timeout.
   */
  async function makeRequest(endpoint, body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${TAVILY_API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, ...body }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    /**
     * Perform a search query.
     * @param {Object} options
     * @param {string} options.query - Search query (max 400 chars)
     * @param {string} [options.searchDepth] - 'basic' or 'advanced'
     * @param {number} [options.maxResults] - Maximum results (1-10)
     * @param {boolean} [options.includeAnswer] - Include AI-generated answer
     * @param {string[]} [options.includeDomains] - Only search these domains
     * @param {string[]} [options.excludeDomains] - Exclude these domains
     * @returns {Promise<Object>} Search results
     */
    async search({
      query,
      searchDepth = 'basic',
      maxResults = 5,
      includeAnswer = false,
      includeDomains,
      excludeDomains,
    }) {
      // Tavily has a 400 char limit on queries
      const truncatedQuery = query.slice(0, 400);

      log.debug('Tavily search', { query: truncatedQuery, searchDepth, maxResults });

      const body = {
        query: truncatedQuery,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: includeAnswer,
      };

      if (includeDomains?.length) {
        body.include_domains = includeDomains;
      }
      if (excludeDomains?.length) {
        body.exclude_domains = excludeDomains;
      }

      const result = await makeRequest('/search', body);

      log.info('Tavily search complete', {
        query: truncatedQuery.slice(0, 50),
        resultCount: result.results?.length || 0,
        hasAnswer: !!result.answer,
      });

      return result;
    },

    /**
     * Execute multiple search queries and combine results.
     * @param {string[]} queries - Array of search queries
     * @param {Object} [options] - Options to apply to all searches
     * @returns {Promise<Object[]>} Combined results from all queries
     */
    async searchMultiple(queries, options = {}) {
      log.info('Tavily multi-search', { queryCount: queries.length });

      const results = await Promise.all(
        queries.map(async (query) => {
          try {
            const response = await this.search({ query, ...options });
            return {
              query,
              results: response.results || [],
              answer: response.answer,
            };
          } catch (error) {
            log.error('Search failed', { query, error: error.message });
            return {
              query,
              results: [],
              error: error.message,
            };
          }
        })
      );

      return results;
    },

    /**
     * Get a quick answer without full results.
     * @param {string} query - Search query
     * @returns {Promise<string>} AI-generated answer
     */
    async quickAnswer(query) {
      const response = await this.search({
        query,
        includeAnswer: true,
        maxResults: 3,
      });

      return response.answer || null;
    },

    /**
     * Format search results for display.
     * @param {Object[]} results - Tavily search results
     * @returns {string} Formatted markdown string
     */
    formatResults(results) {
      if (!results || results.length === 0) {
        return '_No results found._';
      }

      return results.map((r, i) => {
        const title = r.title || 'Untitled';
        const url = r.url || '';
        const snippet = r.content?.slice(0, 200) || '';
        return `${i + 1}. **${title}**\n   ${url}\n   ${snippet}${snippet.length >= 200 ? '...' : ''}`;
      }).join('\n\n');
    },
  };
}
