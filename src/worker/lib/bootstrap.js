/**
 * Bootstrap — generates minimum viable repo structure when current.md doesn't exist.
 *
 * Used by BrainDO.ensureContext() on first run to create a valid
 * context pack that the system can operate on.
 */

import { getLocalDate, getWeekId, getMonthId } from './timezone.js';

/**
 * Generate a bootstrap current.md with all required sections.
 * Uses current date/time for stream and planning references.
 * @returns {string} Valid current.md content
 */
export function generateBootstrapContext() {
  const today = getLocalDate();
  const weekId = getWeekId();
  const monthId = getMonthId();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

  return `# Current Context
Last rebuilt: ${timestamp}

## Pending Review
<!-- Managed inline - preserved during rebuild -->
*No items pending review*

## Today's Stream
<!-- Source: stream/${today}.md -->
*No captures yet today*

## Open Loops
<!-- Managed inline - preserved during rebuild -->
*No open loops*

## This Week's Plan
<!-- Source: planning/weekly/${weekId}.md -->
*No weekly plan yet*

## Upcoming Calendar
<!-- Source: planning/calendar-current.md -->
*No upcoming events*

## Project Index
<!-- Source: projects/index.md -->
*No projects*

## This Month's Plan
<!-- Source: planning/monthly/${monthId}.md -->
*No monthly plan yet*

## Learned Context
<!-- Source: system/learned.md -->
*No learned context yet*

## Identity
<!-- Source: identity/*.md (combined) -->
*Identity not yet defined*
`;
}

/**
 * Generate the list of files needed to bootstrap a new repo.
 * @returns {Array<{path: string, content: string}>} Files to create
 */
export function generateBootstrapFiles() {
  const today = getLocalDate();

  return [
    {
      path: 'data/current.md',
      content: generateBootstrapContext(),
    },
    {
      path: 'data/planning/calendar-current.md',
      content: `# Upcoming Calendar\n\n*No events scheduled.*\n`,
    },
    {
      path: 'data/projects/index.md',
      content: `# Project Index\n\n| Project | Status | Description |\n|---------|--------|-------------|\n`,
    },
    {
      path: 'data/system/learned.md',
      content: `# Learned Context\n\n*No learned patterns yet.*\n`,
    },
    {
      path: `data/stream/${today}.md`,
      content: `# Stream - ${today}\n\n## Captures\n`,
    },
  ];
}
