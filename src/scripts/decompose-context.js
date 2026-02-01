#!/usr/bin/env node
/**
 * Decompose current.md back into source files.
 *
 * This is the reverse of rebuild-context.js. When a Durable Object
 * writes to current.md with direction: decompose, this script extracts
 * each section and writes it back to the corresponding source file.
 *
 * Sections with "Managed inline" comments (Pending Review, Open Loops)
 * are preserved in current.md and not written to any source file.
 * The Identity section (combined from identity/*.md) is skipped since
 * it cannot be safely decomposed back to individual files.
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
 * Build a version stamp comment for embedding in current.md.
 * @param {Object} opts
 * @param {string} opts.sha - Content hash of the context pack
 * @param {string} opts.sourceRef - Git SHA of the source commit
 * @param {string} opts.direction - 'build' or 'decompose'
 * @returns {string} HTML comment with version metadata
 */
export function buildVersionStamp({ sha, sourceRef, direction }) {
  return `<!-- context_pack_version: ${sha} source_ref: ${sourceRef} direction: ${direction} -->`;
}

/**
 * Parse a version stamp from current.md content.
 * @param {string} content - current.md content
 * @returns {Object|null} Parsed stamp or null if not found
 */
export function parseVersionStamp(content) {
  const match = content.match(
    /<!-- context_pack_version: (\S+) source_ref: (\S+) direction: (\S+) -->/
  );
  if (!match) return null;
  return {
    sha: match[1],
    sourceRef: match[2],
    direction: match[3],
  };
}

/**
 * Known top-level sections in current.md.
 * Used to distinguish top-level section headers from subsections
 * within embedded content (e.g., "## 2025-02-01" in the calendar).
 */
const TOP_LEVEL_SECTIONS = [
  'Pending Review',
  "Today's Stream",
  'Open Loops',
  "This Week's Plan",
  'Upcoming Calendar',
  'Project Index',
  "This Month's Plan",
  'Learned Context',
  'Identity',
];

/**
 * Check if a line is a known top-level section header.
 */
function isTopLevelSection(line) {
  if (!line.startsWith('## ')) return false;
  const name = line.replace(/^## /, '').trim();
  return TOP_LEVEL_SECTIONS.includes(name);
}

/**
 * Extract the content of a named section from current.md.
 * Strips the source comment line if present.
 * Only stops at known top-level section headers, not subsections within content.
 * @param {string} content - Full current.md content
 * @param {string} sectionName - Section name (without ##)
 * @returns {string} Section content (trimmed), or empty string
 */
export function extractSectionContent(content, sectionName) {
  const lines = content.split('\n');
  const headerPattern = new RegExp(`^## ${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

  let startIndex = -1;
  let endIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) {
      startIndex = i + 1;
    } else if (startIndex !== -1 && isTopLevelSection(lines[i])) {
      endIndex = i;
      break;
    }
  }

  if (startIndex === -1) return '';

  const sectionLines = lines.slice(startIndex, endIndex);

  // Strip source comment lines
  const filtered = sectionLines.filter(
    line => !line.trim().startsWith('<!-- Source:') && !line.trim().startsWith('<!-- Managed inline')
  );

  return filtered.join('\n').trim();
}

/**
 * Compute the decompose plan: which sections map to which source files.
 * Skips inline-managed sections and the combined Identity section.
 * @param {string} content - Full current.md content
 * @returns {Array<{path: string, content: string, section: string}>}
 */
export function computeDecomposePlan(content) {
  const plan = [];
  const lines = content.split('\n');

  let currentSection = null;
  let currentLines = [];
  let sourceComment = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isTopLevelSection(line)) {
      // Flush previous section
      if (currentSection && sourceComment) {
        plan.push({
          section: currentSection,
          path: `data/${sourceComment}`,
          content: currentLines
            .filter(l => !l.trim().startsWith('<!-- Source:') && !l.trim().startsWith('<!-- Managed inline'))
            .join('\n')
            .trim(),
        });
      }

      currentSection = line.replace(/^## /, '').trim();
      currentLines = [];
      sourceComment = null;
    } else {
      if (currentSection) {
        currentLines.push(line);

        // Detect source comment
        const sourceMatch = line.match(/<!-- Source: (.+?) -->/);
        if (sourceMatch) {
          const sourcePath = sourceMatch[1].trim();
          // Skip inline-managed sections
          if (line.includes('Managed inline')) {
            sourceComment = null;
          } else if (sourcePath.includes('*')) {
            // Skip glob patterns (Identity section)
            sourceComment = null;
          } else {
            sourceComment = sourcePath;
          }
        }
      }
    }
  }

  // Flush last section
  if (currentSection && sourceComment) {
    plan.push({
      section: currentSection,
      path: `data/${sourceComment}`,
      content: currentLines
        .filter(l => !l.trim().startsWith('<!-- Source:') && !l.trim().startsWith('<!-- Managed inline'))
        .join('\n')
        .trim(),
    });
  }

  return plan;
}

/**
 * Execute the decompose: write each planned section to its source file.
 * @param {Array} plan - Output of computeDecomposePlan
 */
async function executeDecompose(plan) {
  for (const entry of plan) {
    const fullPath = path.join(DATA_DIR, '..', entry.path);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, entry.content + '\n', 'utf-8');
    console.log(`  Decomposed: ${entry.section} → ${entry.path}`);
  }
}

/**
 * Write the .done marker file after successful decompose.
 * @param {string} sha - Version stamp SHA
 */
async function writeDoneMarker(sha) {
  const markerDir = path.join(DATA_DIR, '.decompose');
  await fs.mkdir(markerDir, { recursive: true });
  const markerPath = path.join(markerDir, `${sha}.done`);
  await fs.writeFile(markerPath, new Date().toISOString(), 'utf-8');
  console.log(`  Marker written: .decompose/${sha}.done`);
}

/**
 * Main decompose entry point.
 */
async function decomposeContext() {
  const currentPath = path.join(DATA_DIR, 'current.md');
  const content = await readFileOrEmpty(currentPath);

  if (!content) {
    console.log('No current.md found. Nothing to decompose.');
    return;
  }

  const stamp = parseVersionStamp(content);

  if (stamp && stamp.direction !== 'decompose') {
    console.log(`Skipping decompose: direction is "${stamp.direction}", not "decompose".`);
    return;
  }

  console.log('Decomposing current.md into source files...');
  if (stamp) {
    console.log(`  Version: ${stamp.sha}, Source: ${stamp.sourceRef}`);
  }

  const plan = computeDecomposePlan(content);

  if (plan.length === 0) {
    console.log('  No decomposable sections found.');
    return;
  }

  await executeDecompose(plan);

  if (stamp?.sha) {
    await writeDoneMarker(stamp.sha);
  }

  console.log(`Decompose complete: ${plan.length} files written.`);
}

// Run if called directly
if (process.argv[1]?.endsWith('decompose-context.js')) {
  decomposeContext()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error decomposing context:', error);
      process.exit(1);
    });
}

export { decomposeContext };
