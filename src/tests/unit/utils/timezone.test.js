/**
 * Unit Tests: Timezone utilities.
 *
 * Tests date math in America/New_York timezone.
 */

import { getLocalDate, getLocalTime, getWeekId, getMonthId, getDayOfWeek, getLocalNow } from '../../../worker/lib/timezone.js';

describe('Timezone utilities', () => {
  describe('getLocalDate', () => {
    it('should return YYYY-MM-DD format', () => {
      const date = getLocalDate(new Date('2026-01-31T12:00:00Z'));
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should use America/New_York timezone', () => {
      // 2am UTC on Jan 31 = 9pm ET on Jan 30 (EST is UTC-5)
      const date = getLocalDate(new Date('2026-01-31T02:00:00Z'));
      expect(date).toBe('2026-01-30');
    });

    it('should handle midnight boundary correctly', () => {
      // 5am UTC on Jan 31 = midnight ET on Jan 31 (EST)
      const date = getLocalDate(new Date('2026-01-31T05:00:00Z'));
      expect(date).toBe('2026-01-31');
    });
  });

  describe('getLocalTime', () => {
    it('should return HH:MM format', () => {
      const time = getLocalTime(new Date('2026-01-31T17:30:00Z'));
      expect(time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should convert UTC to ET correctly', () => {
      // 5:30pm UTC = 12:30pm ET (EST)
      const time = getLocalTime(new Date('2026-01-31T17:30:00Z'));
      expect(time).toBe('12:30');
    });
  });

  describe('getWeekId', () => {
    it('should return YYYY-Www format', () => {
      const weekId = getWeekId(new Date('2026-01-31T12:00:00Z'));
      expect(weekId).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('should compute correct week number', () => {
      // Jan 31, 2026 is a Saturday in W05
      const weekId = getWeekId(new Date('2026-01-31T12:00:00Z'));
      expect(weekId).toBe('2026-W05');
    });
  });

  describe('getMonthId', () => {
    it('should return YYYY-MM format', () => {
      const monthId = getMonthId(new Date('2026-01-31T12:00:00Z'));
      expect(monthId).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should use ET timezone for month boundary', () => {
      // 2am UTC Feb 1 = 9pm ET Jan 31
      const monthId = getMonthId(new Date('2026-02-01T02:00:00Z'));
      expect(monthId).toBe('2026-01');
    });
  });

  describe('getDayOfWeek', () => {
    it('should return a day name', () => {
      const day = getDayOfWeek(new Date('2026-01-31T12:00:00Z'));
      expect(day).toBe('Saturday');
    });
  });

  describe('getLocalNow', () => {
    it('should return an object with year, month, day, hour, minute, second', () => {
      const local = getLocalNow(new Date('2026-01-31T17:30:45Z'));
      expect(local).toEqual({
        year: 2026,
        month: 1,
        day: 31,
        hour: 12,
        minute: 30,
        second: 45,
      });
    });
  });
});
