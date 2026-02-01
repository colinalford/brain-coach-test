/**
 * Tests for Main Agent single-call inbox processing.
 *
 * Verifies that mainAgent makes a single LLM call and correctly
 * translates tool_calls from the LLM response into write intents.
 */

import { jest } from '@jest/globals';
import { mainAgent } from '../../../worker/agents/main-agent.js';
import { createMockClaudeClient, createMockLogger } from '../helpers/mock-factories.js';

describe('Main Agent', () => {
  const baseContext = {
    currentMd: 'mock context for testing',
    channelType: 'inbox',
    date: '2026-01-31',
    time: '10:00',
    weekId: '2026-W05',
    dayOfWeek: 'Saturday',
  };

  let logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('single-call LLM interaction', () => {
    it('should make exactly one messageJson call', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Simple task capture',
          tool_calls: [],
          slack_reply: 'Noted.',
        },
      });

      await mainAgent('test message', baseContext, { claudeClient, logger });

      expect(claudeClient.messageJson).toHaveBeenCalledTimes(1);
    });

    it('should pass context and message to LLM', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Processing',
          tool_calls: [],
          slack_reply: 'OK.',
        },
      });

      await mainAgent('Buy groceries', baseContext, { claudeClient, logger });

      const call = claudeClient.messageJson.mock.calls[0][0];
      expect(call.system).toBeDefined();
      expect(call.userMessage).toContain('Buy groceries');
      expect(call.userMessage).toContain('mock context for testing');
    });

    it('should include thread context when provided', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Thread reply',
          tool_calls: [],
          slack_reply: 'Reply.',
        },
      });

      const contextWithThread = {
        ...baseContext,
        threadContext: 'User: Hello\nAssistant: Hi there',
      };

      await mainAgent('Follow up', contextWithThread, { claudeClient, logger });

      const call = claudeClient.messageJson.mock.calls[0][0];
      expect(call.userMessage).toContain('Thread History');
      expect(call.userMessage).toContain('User: Hello');
    });
  });

  describe('tool call translation', () => {
    it('should convert append_to_section tool calls to write intents', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Simple task',
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
          slack_reply: 'Added to open loops.',
        },
      });

      const result = await mainAgent('Buy groceries', baseContext, { claudeClient, logger });

      expect(result.writeIntents).toHaveLength(2);
      expect(result.writeIntents[0].op).toBe('tool');
      expect(result.writeIntents[0].path).toBe('data/stream/2026-01-31.md');
      expect(result.writeIntents[0].type).toBe('append_to_section');
      expect(result.writeIntents[0].heading).toBe('## Captures');
      expect(result.writeIntents[1].path).toBe('data/current.md');
      expect(result.writeIntents[1].type).toBe('append_to_section');
    });

    it('should convert mark_complete tool calls', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Marking task done',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Did the groceries',
            },
            {
              tool: 'mark_complete',
              path: 'data/current.md',
              item: 'Buy groceries',
            },
          ],
          slack_reply: 'Marked complete: Buy groceries.',
        },
      });

      const result = await mainAgent('I did the groceries', baseContext, { claudeClient, logger });

      const markIntent = result.writeIntents.find(i => i.type === 'mark_complete');
      expect(markIntent).toBeDefined();
      expect(markIntent.item).toBe('Buy groceries');
    });

    it('should handle create_project as a special action', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'New project',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Create project for website redesign',
            },
            {
              tool: 'create_project',
              name: 'Website Redesign',
              description: 'Redesign the company website',
              first_action: 'Review current design',
            },
          ],
          slack_reply: 'Creating project: Website Redesign.',
        },
      });

      const result = await mainAgent('Create project website redesign', baseContext, { claudeClient, logger });

      // create_project goes to specialActions, not writeIntents
      expect(result.specialActions).toHaveLength(1);
      expect(result.specialActions[0].type).toBe('create_project');
      expect(result.specialActions[0].name).toBe('Website Redesign');

      // Stream entry still goes to writeIntents
      expect(result.writeIntents).toHaveLength(1);
    });

    it('should handle write_file tool calls as put intents', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Creating new file',
          tool_calls: [
            {
              tool: 'write_file',
              path: 'data/projects/test/spread.md',
              content: '# Test Project\n\n## Status\nActive',
            },
          ],
          slack_reply: 'Created file.',
        },
      });

      const result = await mainAgent('write a spread file', baseContext, { claudeClient, logger });

      expect(result.writeIntents).toHaveLength(1);
      expect(result.writeIntents[0].op).toBe('put');
      expect(result.writeIntents[0].path).toBe('data/projects/test/spread.md');
    });
  });

  describe('response handling', () => {
    it('should return slack_reply from LLM response', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Q&A',
          tool_calls: [],
          slack_reply: 'You have no events today.',
        },
      });

      const result = await mainAgent('What do I have today?', baseContext, { claudeClient, logger });
      expect(result.slackReply).toBe('You have no events today.');
    });

    it('should return needs_clarification when present', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Unclear reference',
          tool_calls: [
            {
              tool: 'append_to_section',
              path: 'data/stream/2026-01-31.md',
              heading: '## Captures',
              content: '- 10:00 | Eric mentioned a lead',
            },
            {
              tool: 'append_to_section',
              path: 'data/current.md',
              heading: '## Pending Review',
              content: '- Eric mentioned a lead — which Eric?',
            },
          ],
          slack_reply: 'Captured. Which Eric is this?',
          needs_clarification: {
            about: 'Eric identity',
            question: 'Is this Eric Dissinger?',
            options: ['Eric Dissinger', 'Someone else'],
          },
        },
      });

      const result = await mainAgent('Eric has a lead', baseContext, { claudeClient, logger });

      expect(result.needsClarification).toBeDefined();
      expect(result.needsClarification.about).toBe('Eric identity');
    });

    it('should handle empty tool_calls', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'Just chatting',
          tool_calls: [],
          slack_reply: 'That sounds interesting!',
        },
      });

      const result = await mainAgent('I have been thinking', baseContext, { claudeClient, logger });

      expect(result.writeIntents).toHaveLength(0);
      expect(result.slackReply).toBe('That sounds interesting!');
    });

    it('should handle missing tool_calls gracefully', async () => {
      const claudeClient = createMockClaudeClient({
        messageJson: {
          thinking: 'No tools needed',
          slack_reply: 'OK.',
        },
      });

      const result = await mainAgent('test', baseContext, { claudeClient, logger });

      expect(result.writeIntents).toHaveLength(0);
    });
  });
});
