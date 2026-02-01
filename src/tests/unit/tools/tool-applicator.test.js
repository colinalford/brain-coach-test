/**
 * Unit Tests: Tool Applicator
 *
 * Tests all 5 tool call types and section matching edge cases.
 */

import {
  findSection,
  appendToSection,
  prependToSection,
  replaceSection,
  markComplete,
  removeItem,
  applyToolCall,
} from '../../../worker/lib/tool-applicator.js';

const SAMPLE_CONTENT = `# Current Context

## Pending Review

- Check dentist time

## Today's Stream

- 09:00 | Morning coffee
- 10:30 | Meeting with team

## Open Loops

- [ ] Buy groceries
- [ ] Call dentist
- [x] Submit report

## This Week's Plan

Focus on project delivery.

## Project Index

| Project | Status |
|---------|--------|
| find-pcp | active |

## Identity

### Mission
Be well.

### Roles
- Engineer
- Partner
`;

describe('Tool Applicator', () => {
  describe('findSection', () => {
    it('should find a section by exact heading', () => {
      const result = findSection(SAMPLE_CONTENT, '## Open Loops');
      expect(result).not.toBeNull();
      expect(SAMPLE_CONTENT.slice(result.headingEnd, result.end)).toContain('Buy groceries');
    });

    it('should not match different heading levels', () => {
      // ### Mission should not match ## Mission
      const result = findSection(SAMPLE_CONTENT, '## Mission');
      expect(result).toBeNull();
    });

    it('should find subsections within a parent section', () => {
      const result = findSection(SAMPLE_CONTENT, '### Mission');
      expect(result).not.toBeNull();
    });

    it('should return null for non-existent section', () => {
      const result = findSection(SAMPLE_CONTENT, '## Nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('appendToSection', () => {
    it('should append content to an existing section', () => {
      const result = appendToSection(SAMPLE_CONTENT, '## Open Loops', '- [ ] New task');
      expect(result.error).toBeNull();
      expect(result.content).toContain('- [x] Submit report\n- [ ] New task');
    });

    it('should create section when it does not exist', () => {
      const result = appendToSection(SAMPLE_CONTENT, '## Nonexistent', 'new content');
      expect(result.error).toBeNull();
      expect(result.content).toContain('## Nonexistent');
      expect(result.content).toContain('new content');
    });

    it('should create section in empty content', () => {
      const result = appendToSection('', '## Captures', '- item 1');
      expect(result.error).toBeNull();
      expect(result.content).toContain('## Captures');
      expect(result.content).toContain('- item 1');
    });
  });

  describe('prependToSection', () => {
    it('should prepend content at the start of a section', () => {
      const result = prependToSection(SAMPLE_CONTENT, '## Open Loops', '- [ ] Urgent task');
      expect(result.error).toBeNull();
      // The new item should appear before Buy groceries
      const openLoopsStart = result.content.indexOf('## Open Loops');
      const urgentPos = result.content.indexOf('Urgent task');
      const groceriesPos = result.content.indexOf('Buy groceries');
      expect(urgentPos).toBeGreaterThan(openLoopsStart);
      expect(urgentPos).toBeLessThan(groceriesPos);
    });
  });

  describe('replaceSection', () => {
    it('should replace entire section content', () => {
      const result = replaceSection(SAMPLE_CONTENT, '## Open Loops', '- [ ] Only task');
      expect(result.error).toBeNull();
      expect(result.content).toContain('## Open Loops');
      expect(result.content).toContain('- [ ] Only task');
      expect(result.content).not.toContain('Buy groceries');
      expect(result.content).not.toContain('Call dentist');
    });

    it('should preserve the heading line', () => {
      const result = replaceSection(SAMPLE_CONTENT, '## Open Loops', 'New content');
      expect(result.content).toContain('## Open Loops\n');
    });

    it('should preserve content before and after the section', () => {
      const result = replaceSection(SAMPLE_CONTENT, '## Open Loops', 'New content');
      expect(result.content).toContain("## Today's Stream");
      expect(result.content).toContain("## This Week's Plan");
    });
  });

  describe('markComplete', () => {
    it('should change - [ ] to - [x] for matching item', () => {
      const result = markComplete(SAMPLE_CONTENT, 'Buy groceries');
      expect(result.error).toBeNull();
      expect(result.content).toContain('- [x] Buy groceries');
    });

    it('should match after stripping bullet/checkbox syntax', () => {
      const result = markComplete(SAMPLE_CONTENT, 'Call dentist');
      expect(result.error).toBeNull();
      expect(result.content).toContain('- [x] Call dentist');
    });

    it('should not modify already-completed items', () => {
      // Submit report is already [x], this should still find and "complete" it
      const result = markComplete(SAMPLE_CONTENT, 'Submit report');
      expect(result.error).toBeNull();
    });

    it('should return error for non-existent item', () => {
      const result = markComplete(SAMPLE_CONTENT, 'Nonexistent task');
      expect(result.error).toContain('Item not found');
    });
  });

  describe('removeItem', () => {
    it('should remove a matching line', () => {
      const result = removeItem(SAMPLE_CONTENT, '- [ ] Buy groceries');
      expect(result.error).toBeNull();
      expect(result.content).not.toContain('Buy groceries');
    });

    it('should match by exact full-line equality', () => {
      const result = removeItem(SAMPLE_CONTENT, '- Check dentist time');
      expect(result.error).toBeNull();
      expect(result.content).not.toContain('Check dentist time');
    });

    it('should return error for non-matching line', () => {
      const result = removeItem(SAMPLE_CONTENT, 'This line does not exist');
      expect(result.error).toContain('Line not found');
    });
  });

  describe('applyToolCall', () => {
    it('should dispatch to correct handler based on type', () => {
      const result = applyToolCall(SAMPLE_CONTENT, {
        type: 'append_to_section',
        heading: '## Open Loops',
        content: '- [ ] New item',
      });
      expect(result.error).toBeNull();
      expect(result.content).toContain('New item');
    });

    it('should return error for unknown type', () => {
      const result = applyToolCall(SAMPLE_CONTENT, {
        type: 'unknown_type',
        heading: '## Open Loops',
        content: 'test',
      });
      expect(result.error).toContain('Unknown tool call type');
    });
  });
});
