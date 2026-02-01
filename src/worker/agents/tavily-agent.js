/**
 * Tavily Agent - Performs web searches for research threads.
 *
 * This agent wraps Tavily API calls with intelligent query planning
 * and result formatting for use in research conversations.
 */

/**
 * Execute a web search and return formatted results.
 *
 * @param {string} query - Search query
 * @param {Object} options
 * @param {string} [options.scope] - Research scope/focus
 * @param {number} [options.maxResults] - Maximum results per query
 * @param {Object} deps - Dependencies
 * @param {Object} deps.tavilyClient - Tavily client instance
 * @param {Object} deps.logger - Logger instance
 * @returns {Promise<Object>} Search results and formatted response
 */
export async function tavilySearch(query, options = {}, { tavilyClient, logger }) {
  const { scope, maxResults = 5, searchDepth = 'basic' } = options;

  logger.info('Tavily agent searching', { query, scope, searchDepth });

  try {
    const response = await tavilyClient.search({
      query,
      maxResults,
      includeAnswer: true,
      searchDepth,
    });

    const results = response.results || [];

    logger.info('Tavily search complete', {
      query,
      resultCount: results.length,
      hasAnswer: !!response.answer,
    });

    return {
      query,
      results: results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
      answer: response.answer,
      formatted: formatSearchResults(results, response.answer),
    };
  } catch (error) {
    logger.error('Tavily search failed', { query, error: error.message });

    return {
      query,
      results: [],
      answer: null,
      error: error.message,
      formatted: `_Search failed: ${error.message}_`,
    };
  }
}

/**
 * Plan and execute multiple related searches.
 *
 * @param {string} topic - Main research topic
 * @param {Object} context
 * @param {string} [context.scope] - Research scope
 * @param {string[]} [context.existingFindings] - Already found information
 * @param {Object} deps - Dependencies
 * @param {Object} deps.tavilyClient - Tavily client
 * @param {Object} deps.claudeClient - Claude client for query planning
 * @param {Object} deps.logger - Logger instance
 * @returns {Promise<Object>} Combined research results
 */
export async function researchTopic(topic, context = {}, { tavilyClient, claudeClient, logger }) {
  const { scope, existingFindings = [] } = context;

  logger.info('Research topic', { topic, scope, existingFindingsCount: existingFindings.length });

  // Use Claude to generate good search queries
  const system = `You are a research assistant. Generate 2-3 specific search queries to research a topic.

Focus on finding:
1. Factual information and data
2. Expert opinions and recommendations
3. Practical advice and resources

Respond with JSON:
{
  "queries": ["query 1", "query 2", "query 3"],
  "reasoning": "Brief explanation of search strategy"
}`;

  const userMessage = scope
    ? `Topic: ${topic}\nScope: ${scope}\nAlready found: ${existingFindings.slice(0, 3).join(', ')}`
    : `Topic: ${topic}`;

  let queries;
  try {
    const plan = await claudeClient.messageJson({ system, userMessage });
    queries = plan.queries || [topic];
    logger.debug('Search queries planned', { queries, reasoning: plan.reasoning });
  } catch (error) {
    logger.warn('Query planning failed, using original topic', { error: error.message });
    queries = [topic];
  }

  // Execute searches
  const allResults = [];
  const allFindings = [];

  for (const query of queries) {
    const result = await tavilySearch(query, { scope }, { tavilyClient, logger });
    allResults.push(result);

    if (result.results.length > 0) {
      allFindings.push(...result.results.map(r => ({
        source: r.url,
        title: r.title,
        content: r.content?.slice(0, 500),
        query,
      })));
    }
  }

  // Combine results
  const combinedAnswer = allResults
    .filter(r => r.answer)
    .map(r => r.answer)
    .join('\n\n');

  return {
    topic,
    queries,
    findings: allFindings,
    answer: combinedAnswer || null,
    formatted: formatCombinedResults(allResults),
    searchCount: queries.length,
    resultCount: allFindings.length,
  };
}

/**
 * Execute multiple searches in parallel with error isolation.
 *
 * @param {string[]} queries - Search queries to execute
 * @param {Object} options
 * @param {string} [options.scope] - Research scope
 * @param {number} [options.maxResults] - Max results per query
 * @param {string} [options.searchDepth] - 'basic' or 'advanced'
 * @param {Object} deps - Dependencies
 * @param {Object} deps.tavilyClient - Tavily client
 * @param {Object} deps.logger - Logger
 * @returns {Promise<Object[]>} Array of search results (one per query)
 */
export async function parallelSearch(queries, options = {}, { tavilyClient, logger }) {
  logger.info('Parallel search starting', { queryCount: queries.length });

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        return await tavilySearch(query, options, { tavilyClient, logger });
      } catch (error) {
        logger.error('Parallel search query failed', { query, error: error.message });
        return {
          query,
          results: [],
          answer: null,
          error: error.message,
          formatted: `_Search failed for "${query}": ${error.message}_`,
        };
      }
    })
  );

  logger.info('Parallel search complete', {
    queryCount: queries.length,
    totalResults: results.reduce((sum, r) => sum + r.results.length, 0),
  });

  return results;
}

/**
 * Format search results for Slack display.
 * @param {Object[]} results - Tavily results
 * @param {string} [answer] - AI-generated answer
 * @returns {string} Formatted markdown
 */
function formatSearchResults(results, answer) {
  const parts = [];

  if (answer) {
    parts.push(`**Summary:** ${answer}`);
  }

  if (results.length > 0) {
    parts.push('**Sources:**');
    results.slice(0, 5).forEach((r, i) => {
      const title = r.title || 'Untitled';
      const url = r.url || '';
      const snippet = r.content?.slice(0, 150) || '';
      parts.push(`${i + 1}. <${url}|${title}>`);
      if (snippet) {
        parts.push(`   _${snippet}${snippet.length >= 150 ? '...' : ''}_`);
      }
    });
  } else {
    parts.push('_No results found._');
  }

  return parts.join('\n');
}

/**
 * Format combined results from multiple searches.
 * @param {Object[]} searchResults - Array of search results
 * @returns {string} Formatted markdown
 */
function formatCombinedResults(searchResults) {
  const parts = [];

  // Collect all answers
  const answers = searchResults.filter(r => r.answer).map(r => r.answer);
  if (answers.length > 0) {
    parts.push('**Key Findings:**');
    answers.forEach(a => parts.push(`- ${a}`));
    parts.push('');
  }

  // Collect unique sources
  const seenUrls = new Set();
  const uniqueSources = [];

  for (const search of searchResults) {
    for (const result of search.results || []) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        uniqueSources.push(result);
      }
    }
  }

  if (uniqueSources.length > 0) {
    parts.push('**Sources:**');
    uniqueSources.slice(0, 8).forEach((r, i) => {
      parts.push(`${i + 1}. <${r.url}|${r.title || 'Untitled'}>`);
    });
  }

  return parts.join('\n');
}
