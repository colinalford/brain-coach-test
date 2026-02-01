#!/usr/bin/env node
/**
 * Generate daily "What Matters" digest.
 * Reads current.md and generates a prioritized daily plan.
 *
 * Can be run:
 * - Manually: node src/scripts/generate-digest.js
 * - By cron via GitHub Action
 * - Via /what-matters command
 */

import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/**
 * Read a file, returning empty string if not found.
 */
async function readFileOrEmpty(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

/**
 * Get today's date in YYYY-MM-DD format.
 */
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get day of week.
 */
function getDayOfWeek() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
}

/**
 * Extract a section from markdown content.
 */
function extractSection(content, sectionName) {
  const lines = content.split('\n');
  const headerPattern = new RegExp(`^## ${sectionName}\\s*$`);

  let startIndex = -1;
  let endIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) {
      startIndex = i + 1;
    } else if (startIndex !== -1 && lines[i].startsWith('## ')) {
      endIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return '';
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
}

/**
 * Parse calendar section to find today's events and prep items.
 */
function parseTodayCalendar(calendarContent, todayDate) {
  const events = [];
  const lines = calendarContent.split('\n');
  let inTodaySection = false;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      inTodaySection = line.includes(todayDate);
    } else if (inTodaySection && line.trim().startsWith('- ')) {
      const event = line.trim().slice(2);
      events.push(event);
    }
  }

  return events;
}

/**
 * Parse calendar section to find prep items due today.
 */
function parsePrepItems(calendarContent, todayDate) {
  const prepItems = [];
  const lines = calendarContent.split('\n');
  let currentEvent = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // New date section
      currentEvent = null;
    } else if (line.trim().startsWith('- ') && !line.includes('Prep:')) {
      // This is an event
      const dateMatch = line.match(/## (\d{4}-\d{2}-\d{2})/);
      currentEvent = { date: dateMatch?.[1], title: line.trim().slice(2) };
    } else if (line.includes('Prep:') && currentEvent) {
      // This is a prep item
      const prepMatch = line.match(/Prep:\s*(.+?)\s*\((\d+)\s*day/);
      if (prepMatch) {
        const [, task, daysBefore] = prepMatch;
        // Calculate if this prep is due today
        const eventDate = new Date(currentEvent.date);
        const prepDate = new Date(eventDate);
        prepDate.setDate(prepDate.getDate() - parseInt(daysBefore, 10));

        if (prepDate.toISOString().split('T')[0] === todayDate) {
          prepItems.push({
            task,
            forEvent: currentEvent.title,
            daysUntil: parseInt(daysBefore, 10),
          });
        }
      }
    }
  }

  return prepItems;
}

/**
 * Parse project index to get active project next actions.
 */
function parseProjectActions(projectIndexContent) {
  const actions = [];
  const lines = projectIndexContent.split('\n');

  for (const line of lines) {
    if (line.startsWith('|') && !line.includes('---') && !line.includes('Project')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 4 && cells[1] === 'active') {
        actions.push({
          project: cells[0],
          nextAction: cells[3],
        });
      }
    }
  }

  return actions;
}

/**
 * Parse open loops section.
 */
function parseOpenLoops(openLoopsContent) {
  const loops = [];
  const lines = openLoopsContent.split('\n');

  for (const line of lines) {
    if (line.trim().startsWith('- ')) {
      const text = line.trim().slice(2);
      const isTask = text.startsWith('[ ]') || text.startsWith('[x]');
      const isComplete = text.startsWith('[x]');

      loops.push({
        text: text.replace(/^\[[ x]\]\s*/, ''),
        isTask,
        isComplete,
      });
    }
  }

  return loops;
}

/**
 * Generate the daily digest.
 */
async function generateDigest() {
  const today = getTodayDate();
  const dayOfWeek = getDayOfWeek();

  // Read current.md
  const currentPath = path.join(DATA_DIR, 'current.md');
  const content = await readFileOrEmpty(currentPath);

  if (!content) {
    console.error('current.md not found. Run rebuild-context.js first.');
    process.exit(1);
  }

  // Extract sections
  const calendar = extractSection(content, 'Upcoming Calendar');
  const projectIndex = extractSection(content, 'Project Index');
  const openLoops = extractSection(content, 'Open Loops');
  const weeklyPlan = extractSection(content, "This Week's Plan");
  const pendingReview = extractSection(content, 'Pending Review');

  // Parse data
  const todayEvents = parseTodayCalendar(calendar, today);
  const prepItems = parsePrepItems(calendar, today);
  const projectActions = parseProjectActions(projectIndex);
  const loops = parseOpenLoops(openLoops).filter(l => !l.isComplete);
  const pendingItems = parseOpenLoops(pendingReview).filter(l => !l.isComplete);

  // Build digest
  const parts = [
    `# What Matters Today - ${dayOfWeek}, ${today}`,
    '',
  ];

  // Time-bound items (calendar)
  if (todayEvents.length) {
    parts.push('## Must Do (time-bound)');
    for (const event of todayEvents) {
      parts.push(`- ${event}`);
    }
    parts.push('');
  }

  // Prep items
  if (prepItems.length) {
    parts.push('## Prep for Upcoming');
    for (const prep of prepItems) {
      parts.push(`- ${prep.task} (for: ${prep.forEvent})`);
    }
    parts.push('');
  }

  // Pending review items
  if (pendingItems.length) {
    parts.push('## Pending Review');
    for (const item of pendingItems) {
      parts.push(`- ${item.text}`);
    }
    parts.push('');
  }

  // Project next actions
  if (projectActions.length) {
    parts.push('## Project Actions');
    for (const pa of projectActions) {
      parts.push(`- [ ] ${pa.nextAction} [${pa.project}]`);
    }
    parts.push('');
  }

  // Open loops (non-complete only)
  if (loops.length) {
    parts.push('## Open Loops');
    for (const loop of loops.slice(0, 5)) {
      if (loop.isTask) {
        parts.push(`- [ ] ${loop.text}`);
      } else {
        parts.push(`- ${loop.text}`);
      }
    }
    if (loops.length > 5) {
      parts.push(`_...and ${loops.length - 5} more_`);
    }
    parts.push('');
  }

  // Weekly context
  if (weeklyPlan && weeklyPlan.includes('## Role Commitments')) {
    parts.push('---');
    parts.push('_Weekly plan is loaded. Check role commitments if unsure what to prioritize._');
  }

  const digestContent = parts.join('\n');

  // Write to daily file
  const dailyDir = path.join(DATA_DIR, 'planning', 'daily');
  await fs.mkdir(dailyDir, { recursive: true });

  const dailyPath = path.join(dailyDir, `${today}.md`);
  await fs.writeFile(dailyPath, digestContent, 'utf-8');

  console.log(`Digest generated: ${dailyPath}`);

  // Return for Slack posting
  return digestContent;
}

// For Slack formatting
function formatForSlack(digestContent) {
  return digestContent
    .replace(/^# /gm, '*')
    .replace(/^## /gm, '*')
    .replace(/\*([^*\n]+)\n/g, '*$1*\n')
    .replace(/^- \[ \]/gm, '☐')
    .replace(/^- \[x\]/gm, '☑')
    .replace(/^- /gm, '• ');
}

// Run if called directly
if (process.argv[1].endsWith('generate-digest.js')) {
  generateDigest()
    .then(content => {
      console.log('\n--- Slack Format ---\n');
      console.log(formatForSlack(content));
    })
    .catch(error => {
      console.error('Error generating digest:', error);
      process.exit(1);
    });
}

export { generateDigest, formatForSlack };
