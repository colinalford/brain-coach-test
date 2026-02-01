/**
 * Context Pruner - Prunes current.md to fit within context window limits.
 *
 * Pruning is ephemeral — the pruned version is passed to Claude but never
 * written back to git. The full current.md in the repo is always complete.
 *
 * Deterministic cascade (each step tried in order until under limit):
 * 1. Truncate Identity section to mission + roles only
 * 2. Truncate Learned Context to 20 most recently updated entries
 * 3. Truncate stream to last 20 entries
 * 4. Truncate monthly plan to goals only
 * 5. Summarize truncated sections into one paragraph each
 */

import { findSection } from './tool-applicator.js';

const DEFAULT_MAX_CHARS = 80000;

/**
 * Prune current.md content to fit within character limit.
 * @param {string} content - Full current.md content
 * @param {number} [maxChars=80000] - Maximum character count
 * @returns {string} Pruned content (never written to git)
 */
export function pruneContext(content, maxChars = DEFAULT_MAX_CHARS) {
  if (!content || content.length <= maxChars) return content;

  let pruned = content;

  // Step 1: Truncate Identity to mission + roles only
  pruned = truncateIdentity(pruned);
  if (pruned.length <= maxChars) return pruned;

  // Step 2: Truncate Learned Context to 20 entries
  pruned = truncateLearnedContext(pruned, 20);
  if (pruned.length <= maxChars) return pruned;

  // Step 3: Truncate stream to last 20 entries
  pruned = truncateStream(pruned, 20);
  if (pruned.length <= maxChars) return pruned;

  // Step 4: Truncate monthly plan to goals only
  pruned = truncateMonthlyPlan(pruned);
  if (pruned.length <= maxChars) return pruned;

  // Step 5: Summarize remaining sections
  pruned = summarizeSections(pruned, maxChars);

  return pruned;
}

/**
 * Truncate Identity section to just mission and roles headings.
 */
function truncateIdentity(content) {
  const section = findSection(content, '## Identity');
  if (!section) return content;

  const sectionContent = content.slice(section.headingEnd, section.end);
  const lines = sectionContent.split('\n');
  const kept = [];
  let inKeepSection = false;
  let keepLevel = 0;

  for (const line of lines) {
    const level = getHeadingLevel(line);
    if (level > 0) {
      const lower = line.toLowerCase();
      if (lower.includes('mission') || lower.includes('roles')) {
        inKeepSection = true;
        keepLevel = level;
        kept.push(line);
        continue;
      } else {
        if (level <= keepLevel) inKeepSection = false;
        if (!inKeepSection) continue;
      }
    }
    if (inKeepSection) {
      kept.push(line);
    }
  }

  const before = content.slice(0, section.headingEnd);
  const after = content.slice(section.end);
  return before + '\n' + kept.join('\n') + '\n' + after;
}

/**
 * Truncate Learned Context to N entries.
 */
function truncateLearnedContext(content, maxEntries) {
  const section = findSection(content, '## Learned Context');
  if (!section) return content;

  const sectionContent = content.slice(section.headingEnd, section.end);
  const entries = sectionContent.split(/(?=^### )/m).filter(e => e.trim());

  if (entries.length <= maxEntries) return content;

  const kept = entries.slice(-maxEntries);
  const before = content.slice(0, section.headingEnd);
  const after = content.slice(section.end);
  return before + '\n' + kept.join('') + '\n' + after;
}

/**
 * Truncate stream to last N entries.
 */
function truncateStream(content, maxEntries) {
  const section = findSection(content, "## Today's Stream");
  if (!section) return content;

  const sectionContent = content.slice(section.headingEnd, section.end);
  const lines = sectionContent.split('\n');
  const entries = lines.filter(l => l.trim().startsWith('- '));

  if (entries.length <= maxEntries) return content;

  const kept = entries.slice(-maxEntries);
  const nonEntries = lines.filter(l => !l.trim().startsWith('- ') && l.trim());
  const before = content.slice(0, section.headingEnd);
  const after = content.slice(section.end);
  return before + '\n' + nonEntries.join('\n') + '\n' + kept.join('\n') + '\n' + after;
}

/**
 * Truncate monthly plan to goals only.
 */
function truncateMonthlyPlan(content) {
  const section = findSection(content, "## This Month's Plan");
  if (!section) return content;

  const sectionContent = content.slice(section.headingEnd, section.end);
  const lines = sectionContent.split('\n');

  // Keep lines that look like goals (starting with - or containing "goal")
  const kept = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.startsWith('# ') || trimmed.startsWith('## ') ||
           trimmed.startsWith('### ') || trimmed.startsWith('- ') ||
           trimmed === '';
  }).slice(0, 30); // Cap at 30 lines

  const before = content.slice(0, section.headingEnd);
  const after = content.slice(section.end);
  return before + '\n' + kept.join('\n') + '\n' + after;
}

/**
 * Summarize sections to fit within limit.
 */
function summarizeSections(content, maxChars) {
  // Hard truncation as last resort
  if (content.length > maxChars) {
    return content.slice(0, maxChars) + '\n\n_[Context truncated to fit within limits]_';
  }
  return content;
}

/**
 * Get heading level from a line.
 */
function getHeadingLevel(line) {
  const match = line.match(/^(#{1,6})\s/);
  return match ? match[1].length : 0;
}
