/**
 * Stub Claude Client for System Tests.
 *
 * Returns canned responses keyed by test_id extracted from the message text.
 * If no stub response is registered for the test_id, throws an error
 * (never falls back to real API).
 */

/**
 * Extract test_id from message text.
 * Looks for the LAST [test:<id>] pattern in the text.
 * We use the last match because the user message (containing the current
 * test's ID) is appended after the context pack, which may contain
 * stale test IDs from previous runs.
 * @param {string} text - Message text to search
 * @returns {string|null} Extracted test_id or null
 */
export function extractTestId(text) {
  const matches = text?.match(/\[test:([^\]]+)\]/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const inner = last.match(/\[test:([^\]]+)\]/);
  return inner ? inner[1] : null;
}

/**
 * Create a stub Claude client that returns canned responses.
 *
 * Supports sequential responses: if the registered response is an array,
 * each call returns the next element. This is needed for pipelines like
 * research that make multiple Claude calls with the same test_id.
 *
 * @param {Object} options
 * @param {Map} options.stubResponses - Map of test_id → response (or array of responses)
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Stub Claude client with same interface as real client
 */
export function createStubClaudeClient({ stubResponses, logger }) {
  const log = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  // Track sequence position per test_id for array responses
  const sequenceCounters = new Map();

  function findResponse(text) {
    const testId = extractTestId(text);
    if (!testId) {
      throw new Error('StubClaudeClient: No [test:<id>] token found in message. System tests must include a test_id.');
    }

    const response = stubResponses.get(testId);
    if (!response) {
      throw new Error(`StubClaudeClient: No stub response registered for test_id="${testId}". Register stubs before sending requests.`);
    }

    // Support sequential responses: if response is an array, return next element
    if (Array.isArray(response)) {
      const index = sequenceCounters.get(testId) || 0;
      sequenceCounters.set(testId, index + 1);
      const item = index < response.length ? response[index] : response[response.length - 1];
      log.debug('StubClaudeClient returning sequential response', { testId, index, total: response.length });
      return item;
    }

    log.debug('StubClaudeClient returning canned response', { testId });
    return response;
  }

  return {
    async message({ system, userMessage, model, maxTokens, timeout }) {
      const response = findResponse(userMessage || system);
      if (typeof response === 'string') return response;
      if (response.text) return response.text;
      return JSON.stringify(response.json || response);
    },

    async messageJson({ system, userMessage, model, maxTokens, timeout }) {
      const response = findResponse(userMessage || system);
      if (response.json) return response.json;
      if (typeof response === 'object' && !response.text) return response;
      try {
        return JSON.parse(typeof response === 'string' ? response : response.text);
      } catch {
        return response;
      }
    },

    async conversation({ system, messages, model, maxTokens, timeout }) {
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      const response = findResponse(lastUserMessage?.content || system);
      if (typeof response === 'string') return response;
      if (response.text) return response.text;
      return JSON.stringify(response.json || response);
    },

    async classify({ message, intents, context }) {
      const response = findResponse(message);
      if (response.json) return response.json;
      if (typeof response === 'object' && response.intent) return response;
      return { intent: 'capture', confidence: 0.9, reasoning: 'stub response' };
    },
  };
}
