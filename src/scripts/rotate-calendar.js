#!/usr/bin/env node
/**
 * Rotate calendar entries.
 * Moves past events from calendar-current.md to calendar-past.md.
 *
 * Run weekly via cron (Sunday night) or manually.
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
 * Parse calendar content into date sections.
 * @param {string} content - Calendar file content
 * @returns {Object} { header: string, sections: Array<{ date: string, content: string }> }
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

/**
 * Rotate calendar - move past events to archive.
 */
async function rotateCalendar() {
  const today = getTodayDate();
  console.log(`Rotating calendar for ${today}`);

  const currentPath = path.join(DATA_DIR, 'planning', 'calendar-current.md');
  const pastPath = path.join(DATA_DIR, 'planning', 'calendar-past.md');

  // Read current calendar
  const currentContent = await readFileOrEmpty(currentPath);
  if (!currentContent) {
    console.log('No current calendar found.');
    return;
  }

  // Parse into sections
  const { header, sections } = parseCalendar(currentContent);

  // Separate past and future
  const pastSections = [];
  const futureSections = [];

  for (const section of sections) {
    if (section.date < today) {
      pastSections.push(section);
    } else {
      futureSections.push(section);
    }
  }

  console.log(`Found ${pastSections.length} past sections, ${futureSections.length} future sections`);

  if (pastSections.length === 0) {
    console.log('No past events to archive.');
    return;
  }

  // Read existing past calendar
  let pastContent = await readFileOrEmpty(pastPath);
  if (!pastContent) {
    pastContent = `# Past Events

Archived calendar events for reference. Automatically rotated from \`calendar-current.md\`.

---

`;
  }

  // Append past sections to archive
  const archiveAddition = pastSections
    .map(s => s.content)
    .join('\n\n');

  pastContent = pastContent.trimEnd() + '\n\n' + archiveAddition + '\n';

  // Write updated past calendar
  await fs.writeFile(pastPath, pastContent, 'utf-8');
  console.log(`Archived ${pastSections.length} date sections to ${pastPath}`);

  // Write updated current calendar (future only)
  const futureContent = header + '\n\n' + futureSections.map(s => s.content).join('\n\n') + '\n';
  await fs.writeFile(currentPath, futureContent, 'utf-8');
  console.log(`Updated ${currentPath} with ${futureSections.length} future sections`);

  // Rebuild context
  try {
    const { rebuildContext } = await import('./rebuild-context.js');
    await rebuildContext();
  } catch (error) {
    console.log('Note: Could not rebuild context:', error.message);
  }
}

// Run if called directly
if (process.argv[1].endsWith('rotate-calendar.js')) {
  rotateCalendar()
    .then(() => {
      console.log('Calendar rotation complete.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error rotating calendar:', error);
      process.exit(1);
    });
}

export { rotateCalendar };
