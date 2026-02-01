/**
 * Tests for Claude client JSON parsing logic.
 *
 * The parseJson function is internal to claude-client.js and not exported
 * directly. We test it through createClaudeClient's messageJson method,
 * mocking the Anthropic HTTP API with nock.
 */

import { createClaudeClient } from '../../../worker/lib/claude-client.js';
import nock from 'nock';

describe('Claude JSON Parsing', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('localhost');
  });

  afterEach(() => {
    nock.cleanAll();
  });

  /**
   * Helper: mock the Anthropic Messages API to return a text response.
   * @param {string} text - The text content to return
   */
  function mockClaudeResponse(text) {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, {
        content: [{ type: 'text', text }],
      });
  }

  function createClient() {
    return createClaudeClient({ apiKey: 'test-key' });
  }

  const requestOpts = {
    system: 'You are a test assistant.',
    userMessage: 'Parse this.',
  };

  describe('context: clean JSON response', () => {
    it('should parse a clean JSON response', async () => {
      // Given the API returns a clean JSON string
      mockClaudeResponse('{"intent": "capture", "confidence": 0.9}');

      // When messageJson is called
      const client = createClient();
      const result = await client.messageJson(requestOpts);

      // Then the JSON is parsed correctly
      expect(result.intent).toBe('capture');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('context: markdown-wrapped JSON', () => {
    it('should strip ```json markdown wrapper', async () => {
      // Given the API returns JSON wrapped in ```json ... ```
      mockClaudeResponse('```json\n{"intent": "chat", "confidence": 0.8}\n```');

      // When messageJson is called
      const client = createClient();
      const result = await client.messageJson(requestOpts);

      // Then the JSON is parsed after stripping the wrapper
      expect(result.intent).toBe('chat');
      expect(result.confidence).toBe(0.8);
    });

    it('should strip ``` markdown wrapper without json tag', async () => {
      // Given the API returns JSON wrapped in ``` ... ```
      mockClaudeResponse('```\n{"type": "task", "priority": "high"}\n```');

      // When messageJson is called
      const client = createClient();
      const result = await client.messageJson(requestOpts);

      // Then the JSON is parsed after stripping the wrapper
      expect(result.type).toBe('task');
      expect(result.priority).toBe('high');
    });
  });

  describe('context: embedded JSON in prose', () => {
    it('should extract embedded JSON from surrounding prose text', async () => {
      // Given the API returns prose text with JSON embedded
      mockClaudeResponse(
        'Here is the classification:\n\n{"intent": "research", "score": 0.7}\n\nHope that helps!'
      );

      // When messageJson is called
      const client = createClient();
      const result = await client.messageJson(requestOpts);

      // Then the embedded JSON object is extracted and parsed
      expect(result.intent).toBe('research');
      expect(result.score).toBe(0.7);
    });
  });

  describe('context: completely invalid JSON', () => {
    it('should throw on completely invalid JSON', async () => {
      // Given the API returns text that contains no valid JSON
      mockClaudeResponse('I am not sure what you mean. Can you rephrase?');

      // When messageJson is called
      const client = createClient();

      // Then it throws an error about JSON parsing failure
      await expect(client.messageJson(requestOpts)).rejects.toThrow(
        /Failed to parse Claude response as JSON/
      );
    });
  });
});
