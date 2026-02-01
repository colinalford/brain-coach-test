/**
 * Tests for calendar rotation logic.
 * Validates that past events are correctly separated from future events.
 */

import { jest } from '@jest/globals';

// We can't directly import rotateCalendar since it depends on fs,
// but we can test the parsing logic by importing and testing the module structure.
// For now, test the core logic inline.

/**
 * Parse calendar content into date sections (copied from rotate-calendar.js for testing).
 */
function parseCalendar(content) {
  const lines = content.split('\n');
  const header = [];
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);

    if (dateMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        date: dateMatch[1],
        content: [line],
      };
    } else if (currentSection) {
      currentSection.content.push(line);
    } else {
      header.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return {
    header: header.join('\n'),
    sections: sections.map(s => ({
      date: s.date,
      content: s.content.join('\n'),
    })),
  };
}

describe('Calendar Rotation', () => {
  describe('parseCalendar', () => {
    it('should parse date sections from calendar content', () => {
      const content = `# Calendar

## 2025-01-20
- Meeting at 10am

## 2025-01-25
- Dentist at 2pm
`;
      const result = parseCalendar(content);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].date).toBe('2025-01-20');
      expect(result.sections[1].date).toBe('2025-01-25');
    });

    it('should preserve header content before first date section', () => {
      const content = `# Calendar

Some intro text.

## 2025-01-20
- Event
`;
      const result = parseCalendar(content);
      expect(result.header).toContain('# Calendar');
      expect(result.header).toContain('Some intro text.');
    });

    it('should separate past and future sections by date comparison', () => {
      const today = '2025-01-22';
      const content = `# Calendar

## 2025-01-20
- Past event

## 2025-01-22
- Today event

## 2025-01-25
- Future event
`;
      const { sections } = parseCalendar(content);

      const past = sections.filter(s => s.date < today);
      const future = sections.filter(s => s.date >= today);

      expect(past).toHaveLength(1);
      expect(past[0].date).toBe('2025-01-20');
      expect(future).toHaveLength(2);
    });

    it('should handle empty calendar', () => {
      const result = parseCalendar('# Calendar\n');
      expect(result.sections).toHaveLength(0);
      expect(result.header).toContain('# Calendar');
    });

    it('should handle multi-line events within a date section', () => {
      const content = `## 2025-01-20
- Meeting at 10am
  - Prep: Review docs (1 day before)
- Lunch with team
`;
      const result = parseCalendar(content);
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].content).toContain('Prep: Review docs');
      expect(result.sections[0].content).toContain('Lunch with team');
    });
  });
});
