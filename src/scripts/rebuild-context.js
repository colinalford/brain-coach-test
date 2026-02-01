#!/usr/bin/env node
/**
 * Rebuild the context pack (current.md) from source files.
 *
 * This script assembles data/current.md by reading from all source files
 * and preserving inline sections (Pending Review, Open Loops).
 *
 * Called after every write operation to keep context pack in sync.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

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
 * Get current ISO week identifier (YYYY-WXX).
 */
function getCurrentWeek() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get current month identifier (YYYY-MM).
 */
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Extract a section from current.md content.
 * Returns the content between the section header and the next ## header.
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
 * Filter project index rows to active-only for context pack embedding.
 * The full index.md contains all projects (active + archived),
 * but current.md should only show active ones.
 *
 * @param {string} content - Full index.md content
 * @returns {string} Filtered content with only active project rows
 */
function filterActiveProjectRows(content) {
  if (!content) return '';

  const lines = content.split('\n');
  const filtered = [];

  for (const line of lines) {
    // Keep headers, separator, and non-table lines
    if (!line.startsWith('|') || line.startsWith('| Project') || line.startsWith('|---')) {
      filtered.push(line);
      continue;
    }
    // Keep rows where status column contains "active"
    const cells = line.split('|').map(c => c.trim());
    // Table format: | Project | Status | Description |
    // cells[0] is empty (before first |), cells[1] = Project, cells[2] = Status, cells[3] = Description
    if (cells[2] && cells[2].toLowerCase() === 'active') {
      filtered.push(line);
    }
  }

  return filtered.join('\n');
}

/**
 * Rebuild current.md from all source files.
 */
async function rebuildContext() {
  const currentPath = path.join(DATA_DIR, 'current.md');
  const today = getTodayDate();
  const currentWeek = getCurrentWeek();
  const currentMonth = getCurrentMonth();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

  // Try to read existing current.md to preserve inline sections
  const existingContent = await readFileOrEmpty(currentPath);
  const pendingReview = extractSection(existingContent, 'Pending Review') || '*No items pending review*';
  const openLoops = extractSection(existingContent, 'Open Loops') || '*No open loops*';

  // Read today's stream
  const streamPath = path.join(DATA_DIR, 'stream', `${today}.md`);
  const streamContent = await readFileOrEmpty(streamPath);
  const todayStream = streamContent || '*No captures yet today*';

  // Read weekly plan
  const weeklyPath = path.join(DATA_DIR, 'planning', 'weekly', `${currentWeek}.md`);
  const weeklyContent = await readFileOrEmpty(weeklyPath);
  const weeklyPlan = weeklyContent || '*No weekly plan yet*';

  // Read calendar
  const calendarPath = path.join(DATA_DIR, 'planning', 'calendar-current.md');
  const calendarContent = await readFileOrEmpty(calendarPath);
  const calendar = calendarContent || '*No upcoming events*';

  // Read project index and filter to active-only for context pack
  const projectIndexPath = path.join(DATA_DIR, 'projects', 'index.md');
  const projectIndexContent = await readFileOrEmpty(projectIndexPath);
  const projectIndex = filterActiveProjectRows(projectIndexContent) || '*No projects*';

  // Read monthly plan
  const monthlyPath = path.join(DATA_DIR, 'planning', 'monthly', `${currentMonth}.md`);
  const monthlyContent = await readFileOrEmpty(monthlyPath);
  const monthlyPlan = monthlyContent || '*No monthly plan yet*';

  // Read learned context
  const learnedPath = path.join(DATA_DIR, 'system', 'learned.md');
  const learnedContent = await readFileOrEmpty(learnedPath);
  const learnedContext = learnedContent || '*No learned context yet*';

  // Read and combine identity files
  const identityFiles = ['bio.md', 'mission.md', 'values.md', 'roles.md', 'goals.md'];
  const identityParts = [];

  for (const file of identityFiles) {
    const filePath = path.join(DATA_DIR, 'identity', file);
    const content = await readFileOrEmpty(filePath);
    if (content) {
      identityParts.push(content);
    }
  }
  const identity = identityParts.join('\n\n---\n\n') || '*Identity not yet defined*';

  // Compute version stamp
  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().slice(0, 12);
  } catch {
    // Not in a git repo or git not available
  }

  // Assemble current.md
  // Order: Most volatile at top → most stable at bottom
  const assembledContent = `# Current Context
Last rebuilt: ${timestamp}

## Pending Review
<!-- Managed inline - preserved during rebuild -->
${pendingReview}

## Today's Stream
<!-- Source: stream/${today}.md -->
${todayStream}

## Open Loops
<!-- Managed inline - preserved during rebuild -->
${openLoops}

## This Week's Plan
<!-- Source: planning/weekly/${currentWeek}.md -->
${weeklyPlan}

## Upcoming Calendar
<!-- Source: planning/calendar-current.md -->
${calendar}

## Project Index
<!-- Source: projects/index.md -->
${projectIndex}

## This Month's Plan
<!-- Source: planning/monthly/${currentMonth}.md -->
${monthlyPlan}

## Learned Context
<!-- Source: system/learned.md -->
${learnedContext}

## Identity
<!-- Source: identity/*.md (combined) -->
${identity}
`;

  // Compute content hash for version stamp
  const contentHash = createHash('sha256').update(assembledContent).digest('hex').slice(0, 12);
  const versionStamp = `<!-- context_pack_version: ${contentHash} source_ref: ${gitSha} direction: build -->`;

  // Insert version stamp after the first line
  const finalContent = assembledContent.replace(
    '# Current Context\n',
    `# Current Context\n${versionStamp}\n`
  );

  // Write the assembled file
  await fs.writeFile(currentPath, finalContent, 'utf-8');

  console.log(`Context pack rebuilt: ${currentPath}`);
  console.log(`  - Today: ${today}`);
  console.log(`  - Week: ${currentWeek}`);
  console.log(`  - Month: ${currentMonth}`);

  return currentPath;
}

// Run if called directly
if (process.argv[1].endsWith('rebuild-context.js')) {
  rebuildContext()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error rebuilding context:', error);
      process.exit(1);
    });
}

export { rebuildContext, extractSection, getTodayDate, getCurrentWeek, getCurrentMonth };
