/**
 * Tests for extractSection from file utilities.
 *
 * extractSection pulls the content between a ## header and the next ## header
 * (or end of file) from a markdown body string.
 */

import { extractSection } from '../../../lib/utils/files.js';

describe('extractSection', () => {
  const body = [
    '## Summary',
    'This is the summary.',
    '',
    '## Next Actions',
    '- Action one',
    '- Action two',
    '',
    '## Notes',
    'Some notes here.',
  ].join('\n');

  describe('context: section between two headers', () => {
    it('should extract content between two ## headers', () => {
      // Given a body with multiple sections
      // When extracting the Next Actions section
      const result = extractSection(body, 'Next Actions');

      // Then the content between ## Next Actions and ## Notes is returned
      expect(result).toContain('- Action one');
      expect(result).toContain('- Action two');
      expect(result).not.toContain('Summary');
      expect(result).not.toContain('Some notes');
    });
  });

  describe('context: section not found', () => {
    it('should return empty string when section is not found', () => {
      // Given a body that does not contain a Research section
      // When extracting Research
      const result = extractSection(body, 'Research');

      // Then an empty string is returned
      expect(result).toBe('');
    });
  });

  describe('context: last section in file', () => {
    it('should extract section content until end of file when it is the last section', () => {
      // Given a body where Notes is the last section
      // When extracting Notes
      const result = extractSection(body, 'Notes');

      // Then the content from ## Notes to the end is returned
      expect(result).toContain('Some notes here.');
    });
  });

  describe('context: case-insensitive matching', () => {
    it('should match section headers case-insensitively', () => {
      // Given a body with ## Summary
      // When extracting with lowercase 'summary'
      const result = extractSection(body, 'summary');

      // Then the Summary section content is returned
      expect(result).toContain('This is the summary.');
    });

    it('should match section headers with mixed case', () => {
      // Given a body with ## Next Actions
      // When extracting with 'next actions'
      const result = extractSection(body, 'next actions');

      // Then the Next Actions section content is returned
      expect(result).toContain('- Action one');
    });
  });

  describe('context: empty section', () => {
    it('should handle a section header with no content before the next header', () => {
      // Given a body with an empty section
      const bodyWithEmpty = [
        '## Empty Section',
        '## Filled Section',
        'Some content.',
      ].join('\n');

      // When extracting the empty section
      const result = extractSection(bodyWithEmpty, 'Empty Section');

      // Then an empty string is returned (after trim)
      expect(result).toBe('');
    });
  });
});
