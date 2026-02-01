/**
 * Unit Tests: Tool Validator
 *
 * Tests path safety, identity protection, payload limits, and type validation.
 */

import {
  validateToolCall,
  validatePath,
  validateWriteIntent,
  truncateContent,
  MAX_CONTENT_SIZE,
} from '../../../worker/lib/tool-validator.js';

describe('Tool Validator', () => {
  describe('validatePath', () => {
    it('should accept valid data paths', () => {
      expect(validatePath('data/stream/2026-01-31.md')).toBeNull();
      expect(validatePath('data/projects/find-pcp/spread.md')).toBeNull();
      expect(validatePath('data/current.md')).toBeNull();
    });

    it('should reject paths outside data/', () => {
      expect(validatePath('src/worker/index.js')).toContain('must start with data/');
      expect(validatePath('package.json')).toContain('must start with data/');
    });

    it('should reject path traversal', () => {
      expect(validatePath('data/../.env')).toContain('traversal');
      expect(validatePath('data/projects/../../secrets')).toContain('traversal');
    });

    it('should reject identity writes', () => {
      expect(validatePath('data/identity/roles.md')).toContain('Cannot write to identity');
      expect(validatePath('data/identity/goals.md')).toContain('Cannot write to identity');
    });

    it('should reject empty or non-string paths', () => {
      expect(validatePath('')).toContain('non-empty');
      expect(validatePath(null)).toContain('non-empty');
    });
  });

  describe('validateToolCall', () => {
    it('should accept valid section tool calls', () => {
      const result = validateToolCall({
        type: 'append_to_section',
        heading: '## Open Loops',
        content: '- [ ] New task',
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should accept valid mark_complete', () => {
      const result = validateToolCall({
        type: 'mark_complete',
        item: 'Buy groceries',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject unknown types', () => {
      const result = validateToolCall({
        type: 'delete_file',
        path: 'data/something.md',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown tool call type');
    });

    it('should require heading for section tools', () => {
      const result = validateToolCall({
        type: 'append_to_section',
        content: 'some content',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires a heading');
    });

    it('should require item for mark_complete', () => {
      const result = validateToolCall({
        type: 'mark_complete',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires an item');
    });

    it('should flag truncation for oversized content', () => {
      const result = validateToolCall({
        type: 'append_to_section',
        heading: '## Open Loops',
        content: 'x'.repeat(MAX_CONTENT_SIZE + 1),
      });
      expect(result.valid).toBe(true);
      expect(result.truncated).toBe(true);
    });

    it('should reject null/non-object tool calls', () => {
      expect(validateToolCall(null).valid).toBe(false);
      expect(validateToolCall('string').valid).toBe(false);
    });
  });

  describe('validateWriteIntent', () => {
    it('should validate put intents', () => {
      const result = validateWriteIntent({
        path: 'data/projects/foo/spread.md',
        op: 'put',
        content: 'Some content',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate tool intents', () => {
      const result = validateWriteIntent({
        path: 'data/current.md',
        op: 'tool',
        type: 'append_to_section',
        heading: '## Open Loops',
        content: '- [ ] Task',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject put intents writing outside data/', () => {
      const result = validateWriteIntent({
        path: 'src/worker/index.js',
        op: 'put',
        content: 'malicious content',
      });
      expect(result.valid).toBe(false);
    });

    it('should reject unknown ops', () => {
      const result = validateWriteIntent({
        path: 'data/foo.md',
        op: 'delete',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('truncateContent', () => {
    it('should not truncate content under limit', () => {
      const content = 'Hello world';
      expect(truncateContent(content)).toBe(content);
    });

    it('should truncate content over limit', () => {
      const content = 'x'.repeat(MAX_CONTENT_SIZE + 100);
      expect(truncateContent(content).length).toBe(MAX_CONTENT_SIZE);
    });
  });
});
