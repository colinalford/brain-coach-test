/**
 * Date utilities for the Second Brain system.
 * Extracted from GitHub Actions workflow bash logic.
 */

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

/**
 * Get comprehensive date components for a given date.
 * @param {Date} date - The date to process (defaults to now)
 * @returns {Object} Date components
 */
export function getDateComponents(date = new Date()) {
  const year = date.getFullYear().toString();
  const monthNum = String(date.getMonth() + 1).padStart(2, '0');
  const monthName = MONTH_NAMES[date.getMonth()];
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${monthNum}-${day}`;
  const dayOfWeek = DAY_NAMES[date.getDay()];

  return {
    year,
    monthNum,
    monthName,
    day,
    date: dateStr,
    dayOfWeek,
  };
}

/**
 * Get planning paths for a given date.
 * @param {Date} date - The date to process (defaults to now)
 * @returns {Object} Planning paths
 */
export function getPlanningPaths(date = new Date()) {
  const { year, monthName, day } = getDateComponents(date);

  // Paths are relative - callers prepend basePath
  return {
    planningBase: `planning/${year}/${monthName}`,
    todayPath: `planning/${year}/${monthName}/${day}`,
  };
}

/**
 * Convert month number (01-12) to lowercase month name.
 * @param {string|number} monthNum - Month number (1-12 or "01"-"12")
 * @returns {string} Lowercase month name
 */
export function monthNumToName(monthNum) {
  const num = parseInt(monthNum, 10);
  if (num < 1 || num > 12 || isNaN(num)) {
    throw new Error(`Invalid month number: ${monthNum}`);
  }
  return MONTH_NAMES[num - 1];
}

/**
 * Parse a datetime string and extract date components for event storage.
 * @param {string} datetime - ISO datetime string (YYYY-MM-DDTHH:MM)
 * @returns {Object} Date components for the event
 */
export function parseEventDatetime(datetime) {
  const [datePart] = datetime.split('T');
  const [year, monthNum, day] = datePart.split('-');

  // eventPath is relative - callers prepend basePath
  return {
    year,
    monthNum,
    day,
    monthName: monthNumToName(monthNum),
    eventPath: `planning/${year}/${monthNumToName(monthNum)}/${day}`,
  };
}

/**
 * Parse relative date references to absolute dates.
 * @param {string} reference - Relative date reference (e.g., "tomorrow", "Tuesday")
 * @param {Date} baseDate - Reference date (defaults to now)
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export function parseRelativeDate(reference, baseDate = new Date()) {
  const ref = reference.toLowerCase().trim();
  const result = new Date(baseDate);

  if (ref === 'today') {
    // Already baseDate
  } else if (ref === 'tomorrow') {
    result.setDate(result.getDate() + 1);
  } else if (ref === 'yesterday') {
    result.setDate(result.getDate() - 1);
  } else if (DAY_NAMES.map(d => d.toLowerCase()).includes(ref)) {
    // Find next occurrence of this day
    const targetDay = DAY_NAMES.map(d => d.toLowerCase()).indexOf(ref);
    const currentDay = result.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7; // Next week if same day or past
    result.setDate(result.getDate() + daysUntil);
  } else if (ref.startsWith('next ')) {
    const dayName = ref.replace('next ', '');
    const targetDay = DAY_NAMES.map(d => d.toLowerCase()).indexOf(dayName);
    if (targetDay !== -1) {
      const currentDay = result.getDay();
      let daysUntil = targetDay - currentDay + 7; // Always next week
      result.setDate(result.getDate() + daysUntil);
    }
  } else {
    // Try to parse as a date string
    const parsed = new Date(reference);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    throw new Error(`Could not parse date reference: ${reference}`);
  }

  return result.toISOString().split('T')[0];
}

/**
 * Format a date for display.
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  let d;
  if (typeof date === 'string') {
    // Parse date string as local time, not UTC
    // YYYY-MM-DD format needs special handling to avoid timezone shifts
    const parts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parts) {
      d = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]));
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }
  const { dayOfWeek, date: dateStr } = getDateComponents(d);
  return `${dayOfWeek}, ${dateStr}`;
}
