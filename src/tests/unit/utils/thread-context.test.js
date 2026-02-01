/**
 * Unit Tests: Thread Context
 *
 * Tests building thread conversation context from Slack thread replies.
 */

import { buildThreadContext, formatThreadForLLM } from '../../../worker/lib/thread-context.js';

describe('Thread Context', () => {
  describe('buildThreadContext', () => {
    const messages = [
      { user: 'U_USER', text: 'First message', ts: '1706700000.000000' },
      { user: 'U_BOT', text: 'Bot reply', ts: '1706700010.000000', bot_id: 'B_BOT' },
      { user: 'U_USER', text: 'Follow up', ts: '1706700020.000000' },
      { user: 'U_BOT', text: 'Second reply', ts: '1706700030.000000', bot_id: 'B_BOT' },
    ];

    it('should return all messages when under limit', () => {
      const result = buildThreadContext(messages, { messageLimit: 20, charLimit: 15000 });
      expect(result.messages).toHaveLength(4);
      expect(result.truncated).toBe(false);
    });

    it('should always include the thread parent (first message)', () => {
      const result = buildThreadContext(messages, { messageLimit: 2, charLimit: 15000 });
      expect(result.messages[0].text).toBe('First message');
      // Should include parent + last message(s) up to limit
      expect(result.messages.length).toBeLessThanOrEqual(2);
    });

    it('should respect message limit', () => {
      const manyMessages = Array.from({ length: 30 }, (_, i) => ({
        user: i % 2 === 0 ? 'U_USER' : 'U_BOT',
        text: `Message ${i}`,
        ts: `${1706700000 + i * 10}.000000`,
      }));
      const result = buildThreadContext(manyMessages, { messageLimit: 20, charLimit: 15000 });
      expect(result.messages.length).toBeLessThanOrEqual(20);
      expect(result.truncated).toBe(true);
    });

    it('should respect character limit', () => {
      const longMessages = [
        { user: 'U_USER', text: 'Parent message', ts: '1706700000.000000' },
        { user: 'U_USER', text: 'x'.repeat(5000), ts: '1706700010.000000' },
        { user: 'U_USER', text: 'y'.repeat(5000), ts: '1706700020.000000' },
        { user: 'U_USER', text: 'z'.repeat(5000), ts: '1706700030.000000' },
      ];
      const result = buildThreadContext(longMessages, { messageLimit: 20, charLimit: 8000 });
      const totalChars = result.messages.reduce((sum, m) => sum + m.text.length, 0);
      expect(totalChars).toBeLessThanOrEqual(8000);
    });

    it('should handle empty messages array', () => {
      const result = buildThreadContext([], { messageLimit: 20, charLimit: 15000 });
      expect(result.messages).toHaveLength(0);
      expect(result.truncated).toBe(false);
    });

    it('should handle single message', () => {
      const result = buildThreadContext([messages[0]], { messageLimit: 20, charLimit: 15000 });
      expect(result.messages).toHaveLength(1);
      expect(result.truncated).toBe(false);
    });
  });

  describe('formatThreadForLLM', () => {
    it('should format messages with role labels', () => {
      const context = {
        messages: [
          { user: 'U_USER', text: 'Hello', ts: '1706700000.000000' },
          { user: 'U_BOT', text: 'Hi there', ts: '1706700010.000000', bot_id: 'B_BOT' },
        ],
        truncated: false,
      };
      const formatted = formatThreadForLLM(context, 'U_BOT');
      expect(formatted).toContain('User: Hello');
      expect(formatted).toContain('Assistant: Hi there');
    });

    it('should include truncation notice when truncated', () => {
      const context = {
        messages: [
          { user: 'U_USER', text: 'Recent message', ts: '1706700000.000000' },
        ],
        truncated: true,
      };
      const formatted = formatThreadForLLM(context, 'U_BOT');
      expect(formatted).toContain('earlier messages omitted');
    });

    it('should not include truncation notice when not truncated', () => {
      const context = {
        messages: [
          { user: 'U_USER', text: 'Only message', ts: '1706700000.000000' },
        ],
        truncated: false,
      };
      const formatted = formatThreadForLLM(context, 'U_BOT');
      expect(formatted).not.toContain('omitted');
    });
  });
});
