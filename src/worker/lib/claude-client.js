/**
 * Claude API client for Cloudflare Workers.
 * Handles Claude API calls at the edge with timeout support.
 */

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4000;
const DEFAULT_TIMEOUT_MS = 25000; // 25s to leave buffer before Worker timeout

/**
 * Create a Claude client for the worker.
 * @param {Object} options
 * @param {string} options.apiKey - Anthropic API key
 * @param {string} [options.model] - Default model
 * @param {number} [options.maxTokens] - Default max tokens
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Claude client instance
 */
export function createClaudeClient(options = {}) {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    logger,
  } = options;

  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  /**
   * Make a request with timeout.
   * @param {Object} body - Request body
   * @param {number} [timeout] - Timeout in ms
   * @returns {Promise<Object>} Response data
   */
  async function makeRequest(body, timeout = timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const error = new Error(`Claude API error: ${response.status}`);
        error.status = response.status;
        error.body = errorBody;
        throw error;
      }

      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Claude API timeout after ${timeout}ms`);
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extract text content from Claude response.
   * @param {Object} response - API response
   * @returns {string} Text content
   */
  function extractText(response) {
    if (!response.content || !response.content[0]) {
      throw new Error('Claude API returned empty response');
    }
    return response.content[0].text;
  }

  /**
   * Parse JSON from Claude response, handling markdown wrappers.
   * @param {string} text - Response text
   * @returns {Object} Parsed JSON
   */
  function parseJson(text) {
    let cleanText = text.trim();

    // Strip markdown code blocks
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }
    cleanText = cleanText.trim();

    // Try to extract JSON if embedded in text
    if (!cleanText.startsWith('{') && !cleanText.startsWith('[')) {
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanText = jsonMatch[0];
      }
    }

    try {
      return JSON.parse(cleanText);
    } catch (error) {
      throw new Error(
        `Failed to parse Claude response as JSON: ${error.message}\nResponse: ${text.slice(0, 500)}`
      );
    }
  }

  return {
    /**
     * Send a message and get text response.
     * @param {Object} options
     * @param {string} options.system - System prompt
     * @param {string} options.userMessage - User message
     * @param {string} [options.model] - Model override
     * @param {number} [options.maxTokens] - Max tokens override
     * @param {number} [options.timeout] - Timeout override
     * @returns {Promise<string>} Response text
     */
    async message({ system, userMessage, model: modelOverride, maxTokens: tokensOverride, timeout }) {
      logger?.debug('Claude API request', { model: modelOverride || model });

      const response = await makeRequest(
        {
          model: modelOverride || model,
          max_tokens: tokensOverride || maxTokens,
          system,
          messages: [{ role: 'user', content: userMessage }],
        },
        timeout
      );

      return extractText(response);
    },

    /**
     * Send a message and parse response as JSON.
     * @param {Object} options - Same as message()
     * @returns {Promise<Object>} Parsed JSON response
     */
    async messageJson(options) {
      const text = await this.message(options);
      return parseJson(text);
    },

    /**
     * Send a multi-turn conversation.
     * @param {Object} options
     * @param {string} options.system - System prompt
     * @param {Array<{role: string, content: string}>} options.messages - Conversation history
     * @param {string} [options.model] - Model override
     * @param {number} [options.maxTokens] - Max tokens override
     * @param {number} [options.timeout] - Timeout override
     * @returns {Promise<string>} Response text
     */
    async conversation({ system, messages, model: modelOverride, maxTokens: tokensOverride, timeout }) {
      logger?.debug('Claude conversation', { messageCount: messages.length });

      const response = await makeRequest(
        {
          model: modelOverride || model,
          max_tokens: tokensOverride || maxTokens,
          system,
          messages,
        },
        timeout
      );

      return extractText(response);
    },

    /**
     * Classify intent from a message.
     * @param {Object} options
     * @param {string} options.message - Message to classify
     * @param {string[]} options.intents - Possible intents
     * @param {Object} [options.context] - Additional context
     * @returns {Promise<{intent: string, confidence: number, reasoning: string}>}
     */
    async classify({ message, intents, context = {} }) {
      const system = `You are a message intent classifier. Classify the user message into one of these intents: ${intents.join(', ')}.

Respond with JSON only:
{
  "intent": "the_intent",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

      const userMessage = context
        ? `Context: ${JSON.stringify(context)}\n\nMessage: ${message}`
        : message;

      return this.messageJson({ system, userMessage, timeout: 10000 });
    },
  };
}
