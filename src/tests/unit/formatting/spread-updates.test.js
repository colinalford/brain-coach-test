/**
 * Tests for applySpreadUpdates from the project agent.
 *
 * applySpreadUpdates modifies markdown spread content by appending, prepending,
 * or replacing section content identified by ## headers.
 */

import { applySpreadUpdates } from '../../../worker/agents/project-agent.js';

describe('applySpreadUpdates', () => {
  const baseSectionContent = [
    '## Summary',
    'A project summary.',
    '',
    '## Next Actions',
    '- Do thing one',
    '',
    '## Log',
    '- 2026-01-01 | Started project',
  ].join('\n');

  describe('context: append action', () => {
    it('should append content to an existing section', () => {
      // Given a spread with a Log section containing one entry
      // When appending a new entry to the Log section
      const result = applySpreadUpdates(baseSectionContent, [
        { section: 'Log', action: 'append', content: '- 2026-01-31 | New entry' },
      ]);

      // Then the new entry appears after the existing content
      expect(result).toContain('- 2026-01-01 | Started project');
      expect(result).toContain('- 2026-01-31 | New entry');
      const lines = result.split('\n');
      const oldIndex = lines.findIndex(l => l.includes('2026-01-01'));
      const newIndex = lines.findIndex(l => l.includes('2026-01-31'));
      expect(newIndex).toBeGreaterThan(oldIndex);
    });
  });

  describe('context: prepend action', () => {
    it('should prepend content to an existing section', () => {
      // Given a spread with a Next Actions section
      // When prepending a new action
      const result = applySpreadUpdates(baseSectionContent, [
        { section: 'Next Actions', action: 'prepend', content: '- Do thing zero\n' },
      ]);

      // Then the new action appears before the existing content
      const newPos = result.indexOf('thing zero');
      const oldPos = result.indexOf('thing one');
      expect(newPos).toBeGreaterThan(-1);
      expect(oldPos).toBeGreaterThan(-1);
      expect(newPos).toBeLessThan(oldPos);
    });
  });

  describe('context: replace action', () => {
    it('should replace the content of an existing section', () => {
      // Given a spread with a Summary section
      // When replacing the Summary section content
      const result = applySpreadUpdates(baseSectionContent, [
        { section: 'Summary', action: 'replace', content: 'A new summary.' },
      ]);

      // Then the old content is removed and new content takes its place
      expect(result).not.toContain('A project summary.');
      expect(result).toContain('A new summary.');
      // And other sections remain intact
      expect(result).toContain('## Next Actions');
      expect(result).toContain('- Do thing one');
    });
  });

  describe('context: missing section', () => {
    it('should create a new section when the target section is missing', () => {
      // Given a spread that does not have a Research section
      // When appending to a Research section
      const result = applySpreadUpdates(baseSectionContent, [
        { section: 'Research', action: 'append', content: 'Some findings.' },
      ]);

      // Then a new Research section is created at the end
      expect(result).toContain('## Research');
      expect(result).toContain('Some findings.');
    });
  });

  describe('context: multiple sequential updates', () => {
    it('should handle multiple updates applied in order', () => {
      // Given a spread with multiple sections
      // When applying append to Log and replace to Summary
      const result = applySpreadUpdates(baseSectionContent, [
        { section: 'Log', action: 'append', content: '- 2026-01-31 | Updated' },
        { section: 'Summary', action: 'replace', content: 'Replaced summary.' },
      ]);

      // Then both updates are reflected
      expect(result).toContain('- 2026-01-31 | Updated');
      expect(result).toContain('Replaced summary.');
      expect(result).not.toContain('A project summary.');
    });
  });

  describe('context: empty or null spread', () => {
    it('should handle empty string spread content', () => {
      // Given an empty spread
      // When appending to a section
      const result = applySpreadUpdates('', [
        { section: 'Summary', action: 'append', content: 'Brand new.' },
      ]);

      // Then a new section is created
      expect(result).toContain('## Summary');
      expect(result).toContain('Brand new.');
    });

    it('should handle null spread content', () => {
      // Given null spread content
      // When appending to a section
      const result = applySpreadUpdates(null, [
        { section: 'Notes', action: 'append', content: 'A note.' },
      ]);

      // Then a new section is created from scratch
      expect(result).toContain('## Notes');
      expect(result).toContain('A note.');
    });
  });
});
