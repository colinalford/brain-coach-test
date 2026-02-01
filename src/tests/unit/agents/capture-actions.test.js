/**
 * Tests for Main Agent capture scenarios — verifying that given specific LLM
 * tool_call responses, the correct write intents are generated.
 *
 * Complements intent-routing.test.js by testing realistic capture scenarios
 * (task capture, calendar events, open loops, minimal captures).
 */

import { jest } from '@jest/globals';
import { mainAgent } from '../../../worker/agents/main-agent.js';
import { createMockClaudeClient, createMockLogger } from '../helpers/mock-factories.js';

describe('Capture Actions', () => {
  let logger;

  const context = {
    currentMd: 'mock context',
    channelType: 'inbox',
    date: '2026-01-31',
    time: '10:00',
    weekId: '2026-W05',
    dayOfWeek: 'Saturday',
  };

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('context: task capture', () => {
    it('should generate write intent for stream file', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Simple task capture',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Buy groceries',
            },
          ],
          slack_reply: 'Captured task: Buy groceries',
        },
      });

      const result = await mainAgent('Buy groceries', context, { claudeClient, logger });

      const streamIntent = result.writeIntents.find(
        (i) => i.path === 'data/stream/2026-01-31.md'
      );
      expect(streamIntent).toBeDefined();
      expect(streamIntent.op).toBe('tool');
      expect(streamIntent.type).toBe('append_to_section');
      expect(streamIntent.heading).toBe('## Captures');
      expect(streamIntent.content).toBe('- 10:00 | Buy groceries');
    });
  });

  describe('context: task with open loops', () => {
    it('should generate both stream and open loops write intents', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Actionable task — stream + open loops',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Buy groceries',
            },
            {
              tool: 'append_to_section',
              path: 'data/current.md',
              heading: '## Open Loops',
              content: '- [ ] Buy groceries',
            },
          ],
          slack_reply: 'Got it - added to open loops.',
        },
      });

      const result = await mainAgent('Buy groceries', context, { claudeClient, logger });

      // Stream entry
      const streamIntent = result.writeIntents.find(
        (i) => i.path === 'data/stream/2026-01-31.md'
      );
      expect(streamIntent).toBeDefined();
      expect(streamIntent.type).toBe('append_to_section');

      // Open Loops entry
      const loopIntent = result.writeIntents.find(
        (i) => i.path === 'data/current.md' && i.heading === '## Open Loops'
      );
      expect(loopIntent).toBeDefined();
      expect(loopIntent.type).toBe('append_to_section');
      expect(loopIntent.content).toBe('- [ ] Buy groceries');
    });
  });

  describe('context: calendar event capture', () => {
    it('should generate calendar file write intent', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Calendar event — stream + calendar',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Therapy tomorrow 9-10am',
            },
            {
              tool: 'append_to_section',
              path: 'data/planning/calendar-current.md',
              heading: '## 2026-02-01 (Sunday)',
              content: '- 09:00-10:00 Therapy',
            },
          ],
          slack_reply: 'Added Therapy to calendar for 2026-02-01.',
        },
      });

      const result = await mainAgent('Therapy tomorrow 9-10am', context, { claudeClient, logger });

      const calIntent = result.writeIntents.find(
        (i) => i.path === 'data/planning/calendar-current.md'
      );
      expect(calIntent).toBeDefined();
      expect(calIntent.type).toBe('append_to_section');
      expect(calIntent.content).toContain('Therapy');
      expect(calIntent.content).toContain('09:00-10:00');
    });
  });

  describe('context: minimal capture', () => {
    it('should generate at least a stream entry write intent', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Simple note, stream only',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Random thought',
            },
          ],
          slack_reply: 'Captured.',
        },
      });

      const result = await mainAgent('Random thought', context, { claudeClient, logger });

      expect(result.writeIntents.length).toBeGreaterThanOrEqual(1);
      const streamIntent = result.writeIntents.find(
        (i) => i.path === 'data/stream/2026-01-31.md'
      );
      expect(streamIntent).toBeDefined();
    });
  });

  describe('context: slack reply passthrough', () => {
    it('should return the slackReply from the LLM response', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Task captured',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Pay rent',
            },
            {
              tool: 'append_to_section',
              path: 'data/current.md',
              heading: '## Open Loops',
              content: '- [ ] Pay rent',
            },
          ],
          slack_reply: 'Got it - added "Pay rent" to open loops.',
        },
      });

      const result = await mainAgent('Pay rent', context, { claudeClient, logger });

      expect(result.slackReply).toBe('Got it - added "Pay rent" to open loops.');
    });
  });

  describe('context: learned context capture', () => {
    it('should generate write intent for learned.md', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'New person info — capture to learned context',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Met Sarah at the coffee shop, she works at Basecamp',
            },
            {
              tool: 'append_to_section',
              path: 'data/system/learned.md',
              heading: '## People',
              content: '- Sarah — works at Basecamp, met at coffee shop',
            },
          ],
          slack_reply: 'Captured. Added Sarah to learned context.',
        },
      });

      const result = await mainAgent('Met Sarah at the coffee shop, she works at Basecamp', context, { claudeClient, logger });

      const learnedIntent = result.writeIntents.find(
        (i) => i.path === 'data/system/learned.md'
      );
      expect(learnedIntent).toBeDefined();
      expect(learnedIntent.heading).toBe('## People');
      expect(learnedIntent.content).toContain('Sarah');
    });
  });
});
