/**
 * Unit Tests: Write Intent
 *
 * Tests write intent builders, validation, and resolution.
 */

import { putIntent, toolIntent, validateIntents, resolveIntent } from '../../../worker/lib/write-intent.js';
import { MAX_CONTENT_SIZE } from '../../../worker/lib/tool-validator.js';

describe('Write Intent', () => {
  describe('putIntent', () => {
    it('should create a put intent with path, op, and content', () => {
      const intent = putIntent('data/stream/2026-01-31.md', '# Stream\n\n- Entry');
      expect(intent).toEqual({
        path: 'data/stream/2026-01-31.md',
        op: 'put',
        content: '# Stream\n\n- Entry',
      });
    });

    it('should include base_ref_sha when provided', () => {
      const intent = putIntent('data/current.md', 'content', 'abc123');
      expect(intent.base_ref_sha).toBe('abc123');
    });

    it('should not include base_ref_sha when not provided', () => {
      const intent = putIntent('data/current.md', 'content');
      expect(intent.base_ref_sha).toBeUndefined();
    });

    it('should truncate oversized content', () => {
      const bigContent = 'x'.repeat(MAX_CONTENT_SIZE + 100);
      const intent = putIntent('data/foo.md', bigContent);
      expect(intent.content.length).toBe(MAX_CONTENT_SIZE);
    });

    it('should not truncate content under limit', () => {
      const content = 'Hello world';
      const intent = putIntent('data/foo.md', content);
      expect(intent.content).toBe(content);
    });
  });

  describe('toolIntent', () => {
    it('should create a tool intent with path, op, type, and params', () => {
      const intent = toolIntent('data/current.md', 'append_to_section', {
        heading: '## Open Loops',
        content: '- [ ] New task',
      });
      expect(intent).toEqual({
        path: 'data/current.md',
        op: 'tool',
        type: 'append_to_section',
        heading: '## Open Loops',
        content: '- [ ] New task',
      });
    });

    it('should include item param for mark_complete', () => {
      const intent = toolIntent('data/current.md', 'mark_complete', {
        item: 'Buy groceries',
      });
      expect(intent.op).toBe('tool');
      expect(intent.type).toBe('mark_complete');
      expect(intent.item).toBe('Buy groceries');
    });

    it('should include base_ref_sha when provided', () => {
      const intent = toolIntent('data/current.md', 'append_to_section', {
        heading: '## Open Loops',
        content: '- [ ] Task',
      }, 'sha456');
      expect(intent.base_ref_sha).toBe('sha456');
    });

    it('should truncate oversized content in params', () => {
      const bigContent = 'x'.repeat(MAX_CONTENT_SIZE + 100);
      const intent = toolIntent('data/current.md', 'append_to_section', {
        heading: '## Notes',
        content: bigContent,
      });
      expect(intent.content.length).toBe(MAX_CONTENT_SIZE);
    });

    it('should not truncate content under limit', () => {
      const intent = toolIntent('data/current.md', 'append_to_section', {
        heading: '## Notes',
        content: 'Short note',
      });
      expect(intent.content).toBe('Short note');
    });
  });

  describe('validateIntents', () => {
    it('should validate an array of valid intents', () => {
      const intents = [
        putIntent('data/stream/2026-01-31.md', '# Stream'),
        toolIntent('data/current.md', 'append_to_section', {
          heading: '## Open Loops',
          content: '- [ ] Task',
        }),
      ];
      const { valid, invalid } = validateIntents(intents);
      expect(valid).toHaveLength(2);
      expect(invalid).toHaveLength(0);
    });

    it('should separate valid from invalid intents', () => {
      const intents = [
        putIntent('data/stream/2026-01-31.md', '# Stream'),
        { path: 'src/worker/index.js', op: 'put', content: 'malicious' },
      ];
      const { valid, invalid } = validateIntents(intents);
      expect(valid).toHaveLength(1);
      expect(invalid).toHaveLength(1);
      expect(invalid[0].error).toContain('data/');
    });

    it('should reject intents writing to identity', () => {
      const intents = [
        putIntent('data/identity/roles.md', 'new roles'),
      ];
      const { valid, invalid } = validateIntents(intents);
      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(1);
      expect(invalid[0].error).toContain('identity');
    });

    it('should handle empty array', () => {
      const { valid, invalid } = validateIntents([]);
      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(0);
    });

    it('should reject unknown op types', () => {
      const intents = [{ path: 'data/foo.md', op: 'delete' }];
      const { valid, invalid } = validateIntents(intents);
      expect(valid).toHaveLength(0);
      expect(invalid).toHaveLength(1);
    });
  });

  describe('resolveIntent', () => {
    const mockApplyToolCall = (content, toolCall) => {
      if (toolCall.type === 'append_to_section') {
        const idx = content.indexOf(toolCall.heading);
        if (idx === -1) {
          return { content, error: `Section not found: ${toolCall.heading}` };
        }
        // Simple append after heading
        const headingEnd = content.indexOf('\n', idx) + 1;
        const before = content.slice(0, headingEnd);
        const after = content.slice(headingEnd);
        return { content: before + '\n' + toolCall.content + '\n' + after, error: null };
      }
      return { content, error: `Unsupported: ${toolCall.type}` };
    };

    it('should return content directly for put intents', () => {
      const intent = { op: 'put', content: 'new file content' };
      const result = resolveIntent(intent, 'old content', mockApplyToolCall);
      expect(result.content).toBe('new file content');
      expect(result.error).toBeNull();
    });

    it('should apply tool call for tool intents', () => {
      const intent = {
        op: 'tool',
        type: 'append_to_section',
        heading: '## Tasks',
        content: '- [ ] Do thing',
      };
      const currentContent = '# Doc\n\n## Tasks\n\n- [ ] Existing\n';
      const result = resolveIntent(intent, currentContent, mockApplyToolCall);
      expect(result.error).toBeNull();
      expect(result.content).toContain('- [ ] Do thing');
      expect(result.content).toContain('- [ ] Existing');
    });

    it('should propagate error from applyToolCall', () => {
      const intent = {
        op: 'tool',
        type: 'unsupported_tool',
        heading: '## Tasks',
        content: '- item',
      };
      const result = resolveIntent(intent, '# Doc\n\n## Tasks\n', mockApplyToolCall);
      expect(result.error).toContain('Unsupported');
    });

    it('should return error for unknown op', () => {
      const intent = { op: 'delete' };
      const result = resolveIntent(intent, 'content', mockApplyToolCall);
      expect(result.error).toContain('Unknown op: delete');
    });
  });
});
