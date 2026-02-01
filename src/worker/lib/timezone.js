/**
 * Timezone utilities for the Second Brain system.
 *
 * Authoritative timezone: America/New_York.
 * All dates, times, "today", "tomorrow", and cron schedules
 * are interpreted in this timezone.
 */

const TIMEZONE = 'America/New_York';

/**
 * Get the current date/time in America/New_York.
 * @param {Date} [now] - Optional date to use (for testing)
 * @returns {Date} Date object adjusted for display purposes
 */
export function getLocalNow(now) {
  const date = now || new Date();
  // Create a formatter to get the local time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value;

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')),
    day: parseInt(get('day')),
    hour: parseInt(get('hour')),
    minute: parseInt(get('minute')),
    second: parseInt(get('second')),
  };
}

/**
 * Get today's date string (YYYY-MM-DD) in America/New_York.
 * @param {Date} [now] - Optional date to use
 * @returns {string} Date string
 */
export function getLocalDate(now) {
  const local = getLocalNow(now);
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

/**
 * Get current time string (HH:MM) in America/New_York.
 * @param {Date} [now] - Optional date to use
 * @returns {string} Time string
 */
export function getLocalTime(now) {
  const local = getLocalNow(now);
  return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
}

/**
 * Get ISO week ID (YYYY-Www) for a date in America/New_York.
 * @param {Date} [now] - Optional date to use
 * @returns {string} Week ID (e.g., "2026-W05")
 */
export function getWeekId(now) {
  const local = getLocalNow(now);
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Get month ID (YYYY-MM) for a date in America/New_York.
 * @param {Date} [now] - Optional date to use
 * @returns {string} Month ID (e.g., "2026-02")
 */
export function getMonthId(now) {
  const local = getLocalNow(now);
  return `${local.year}-${String(local.month).padStart(2, '0')}`;
}

/**
 * Get day of week name in America/New_York.
 * @param {Date} [now] - Optional date to use
 * @returns {string} Day name (e.g., "Monday")
 */
export function getDayOfWeek(now) {
  const date = now || new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
  });
  return formatter.format(date);
}

/**
 * Get the timezone name.
 * @returns {string} Timezone identifier
 */
export function getTimezone() {
  return TIMEZONE;
}
