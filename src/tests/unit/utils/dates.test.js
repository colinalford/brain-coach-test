/**
 * Tests for date utilities.
 *
 * These utilities extract date components, build planning paths, convert
 * month numbers to names, parse relative date references, and format dates.
 */

import {
  getDateComponents,
  getPlanningPaths,
  monthNumToName,
  parseRelativeDate,
  formatDate,
} from '../../../lib/utils/dates.js';

describe('Date Utilities', () => {
  describe('getDateComponents', () => {
    it('should return year, monthNum, monthName, day, date string, and dayOfWeek', () => {
      // Given a specific date: Wednesday, January 15, 2026
      const date = new Date(2026, 0, 15); // month is 0-indexed

      // When getting date components
      const result = getDateComponents(date);

      // Then all components are correctly extracted
      expect(result.year).toBe('2026');
      expect(result.monthNum).toBe('01');
      expect(result.monthName).toBe('january');
      expect(result.day).toBe('15');
      expect(result.date).toBe('2026-01-15');
      expect(result.dayOfWeek).toBe('Thursday');
    });

    it('should zero-pad single-digit months and days', () => {
      // Given a date in March with a single-digit day
      const date = new Date(2026, 2, 5); // March 5

      // When getting date components
      const result = getDateComponents(date);

      // Then month and day are zero-padded
      expect(result.monthNum).toBe('03');
      expect(result.day).toBe('05');
    });
  });

  describe('getPlanningPaths', () => {
    it('should return correct planning path structure', () => {
      // Given a date in January 2026
      const date = new Date(2026, 0, 15);

      // When getting planning paths
      const result = getPlanningPaths(date);

      // Then paths use year/monthName format
      expect(result.planningBase).toBe('planning/2026/january');
      expect(result.todayPath).toBe('planning/2026/january/15');
    });

    it('should handle December correctly', () => {
      // Given a date in December
      const date = new Date(2026, 11, 25);

      // When getting planning paths
      const result = getPlanningPaths(date);

      // Then December is used
      expect(result.planningBase).toBe('planning/2026/december');
      expect(result.todayPath).toBe('planning/2026/december/25');
    });
  });

  describe('monthNumToName', () => {
    it('should convert 1 to january', () => {
      // Given month number 1
      // When converting to name
      // Then it returns january
      expect(monthNumToName(1)).toBe('january');
    });

    it('should convert 12 to december', () => {
      // Given month number 12
      // When converting to name
      // Then it returns december
      expect(monthNumToName(12)).toBe('december');
    });

    it('should accept string month numbers', () => {
      // Given month number as string "06"
      // When converting to name
      // Then it returns june
      expect(monthNumToName('06')).toBe('june');
    });

    it('should throw on invalid month number 0', () => {
      // Given an invalid month number 0
      // When converting to name
      // Then it throws an error
      expect(() => monthNumToName(0)).toThrow('Invalid month number');
    });

    it('should throw on invalid month number 13', () => {
      // Given an invalid month number 13
      // When converting to name
      // Then it throws an error
      expect(() => monthNumToName(13)).toThrow('Invalid month number');
    });
  });

  describe('parseRelativeDate', () => {
    // Use a fixed base date: Thursday, January 15, 2026
    const baseDate = new Date(2026, 0, 15);

    it('should return today\'s date for "today"', () => {
      // Given the reference "today" and a base date of Jan 15
      // When parsing
      const result = parseRelativeDate('today', baseDate);

      // Then the result is the base date
      expect(result).toBe('2026-01-15');
    });

    it('should return tomorrow\'s date for "tomorrow"', () => {
      // Given the reference "tomorrow" and a base date of Jan 15
      // When parsing
      const result = parseRelativeDate('tomorrow', baseDate);

      // Then the result is one day after the base date
      expect(result).toBe('2026-01-16');
    });

    it('should return yesterday\'s date for "yesterday"', () => {
      // Given the reference "yesterday" and a base date of Jan 15
      // When parsing
      const result = parseRelativeDate('yesterday', baseDate);

      // Then the result is one day before the base date
      expect(result).toBe('2026-01-14');
    });

    it('should handle day names by finding the next occurrence', () => {
      // Given the reference "monday" and a base date of Thursday Jan 15
      // When parsing
      const result = parseRelativeDate('monday', baseDate);

      // Then the result is the next Monday (Jan 19)
      expect(result).toBe('2026-01-19');
    });

    it('should advance to next week when the day name matches today', () => {
      // Given the reference "thursday" and a base date of Thursday Jan 15
      // When parsing
      const result = parseRelativeDate('thursday', baseDate);

      // Then it advances to next Thursday (Jan 22), not today
      expect(result).toBe('2026-01-22');
    });

    it('should handle "next <day>" references', () => {
      // Given the reference "next friday" and a base date of Thursday Jan 15
      // When parsing
      const result = parseRelativeDate('next friday', baseDate);

      // Then it returns Friday of next week (Jan 23)
      expect(result).toBe('2026-01-23');
    });
  });

  describe('formatDate', () => {
    it('should format a Date object as "DayOfWeek, YYYY-MM-DD"', () => {
      // Given a Date object for Thursday January 15, 2026
      const date = new Date(2026, 0, 15);

      // When formatting
      const result = formatDate(date);

      // Then the output is "Thursday, 2026-01-15"
      expect(result).toBe('Thursday, 2026-01-15');
    });

    it('should format a date string as "DayOfWeek, YYYY-MM-DD"', () => {
      // Given a date string
      // When formatting
      const result = formatDate('2026-01-15');

      // Then it parses and formats correctly
      expect(result).toBe('Thursday, 2026-01-15');
    });
  });
});
