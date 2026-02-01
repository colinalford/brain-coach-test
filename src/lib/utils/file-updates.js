/**
 * File update executor for the BuJo system.
 * Executes structured file updates from Claude's JSON response.
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Ensure a directory exists.
 */
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

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
 * Write content to a file, creating directories as needed.
 */
async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Find a section in markdown content and return its line indices.
 * @param {string[]} lines - Array of lines
 * @param {string} sectionHeader - The exact header to find (e.g., "## Captures" or "### Dog Dad")
 * @returns {Object} { startIndex, endIndex } or { startIndex: -1 } if not found
 */
function findSection(lines, sectionHeader) {
  const headerLevel = (sectionHeader.match(/^#+/) || [''])[0].length;
  const headerPattern = new RegExp(`^${sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

  let startIndex = -1;
  let endIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) {
      startIndex = i;
    } else if (startIndex !== -1) {
      // Check if this is a same-level or higher-level header
      const match = lines[i].match(/^(#+)\s/);
      if (match && match[1].length <= headerLevel) {
        endIndex = i;
        break;
      }
    }
  }

  return { startIndex, endIndex };
}

/**
 * Execute an append action - add content to end of file.
 */
async function executeAppend(basePath, fileUpdate) {
  const filePath = path.join(basePath, fileUpdate.file);
  const existing = await readFileOrEmpty(filePath);
  const newContent = existing
    ? existing.trimEnd() + '\n' + fileUpdate.content + '\n'
    : fileUpdate.content + '\n';
  await writeFile(filePath, newContent);
}

/**
 * Execute append_to_section - add content under a specific heading.
 */
async function executeAppendToSection(basePath, fileUpdate) {
  const filePath = path.join(basePath, fileUpdate.file);
  const existing = await readFileOrEmpty(filePath);
  const lines = existing.split('\n');

  const { startIndex, endIndex } = findSection(lines, fileUpdate.section);

  if (startIndex === -1) {
    // Section doesn't exist - create it at end of file
    lines.push('');
    lines.push(fileUpdate.section);
    lines.push(fileUpdate.content);
  } else {
    // Insert content at end of section (before next section or EOF)
    // Find the last non-empty line in the section
    let insertIndex = endIndex;
    for (let i = endIndex - 1; i > startIndex; i--) {
      if (lines[i].trim() !== '') {
        insertIndex = i + 1;
        break;
      }
    }
    // If section is empty, insert right after header
    if (insertIndex === endIndex && startIndex + 1 === endIndex) {
      insertIndex = startIndex + 1;
    }
    lines.splice(insertIndex, 0, fileUpdate.content);
  }

  await writeFile(filePath, lines.join('\n'));
}

/**
 * Execute prepend_to_section - add content at start of a section.
 */
async function executePrependToSection(basePath, fileUpdate) {
  const filePath = path.join(basePath, fileUpdate.file);
  const existing = await readFileOrEmpty(filePath);
  const lines = existing.split('\n');

  const { startIndex } = findSection(lines, fileUpdate.section);

  if (startIndex === -1) {
    // Section doesn't exist - create it
    lines.push('');
    lines.push(fileUpdate.section);
    lines.push(fileUpdate.content);
  } else {
    // Insert content right after the header
    lines.splice(startIndex + 1, 0, fileUpdate.content);
  }

  await writeFile(filePath, lines.join('\n'));
}

/**
 * Execute replace_section - replace entire section content.
 */
async function executeReplaceSection(basePath, fileUpdate) {
  const filePath = path.join(basePath, fileUpdate.file);
  const existing = await readFileOrEmpty(filePath);
  const lines = existing.split('\n');

  const { startIndex, endIndex } = findSection(lines, fileUpdate.section);

  if (startIndex === -1) {
    // Section doesn't exist - create it
    lines.push('');
    lines.push(fileUpdate.section);
    lines.push(fileUpdate.content);
  } else {
    // Replace content between header and next section
    const newLines = [
      ...lines.slice(0, startIndex + 1),
      fileUpdate.content,
      ...lines.slice(endIndex)
    ];
    await writeFile(filePath, newLines.join('\n'));
    return;
  }

  await writeFile(filePath, lines.join('\n'));
}

/**
 * Execute mark_complete - change [ ] to [x] for a matching item.
 */
async function executeMarkComplete(basePath, fileUpdate) {
  const filePath = path.join(basePath, fileUpdate.file);
  const existing = await readFileOrEmpty(filePath);

  // Find the task by matching content (fuzzy)
  const searchTerm = fileUpdate.content.toLowerCase();
  const lines = existing.split('\n');
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('- [ ]') && line.toLowerCase().includes(searchTerm)) {
      lines[i] = line.replace('- [ ]', '- [x]');
      found = true;
      break;
    }
  }

  if (found) {
    await writeFile(filePath, lines.join('\n'));
  }

  return found;
}

/**
 * Execute remove_item - delete a line containing specific content.
 */
async function executeRemoveItem(basePath, fileUpdate) {
  const filePath = path.join(basePath, fileUpdate.file);
  const existing = await readFileOrEmpty(filePath);

  const searchTerm = fileUpdate.content.toLowerCase();
  const lines = existing.split('\n');
  const newLines = lines.filter(line => !line.toLowerCase().includes(searchTerm));

  await writeFile(filePath, newLines.join('\n'));
}

/**
 * Execute create - create a new file with content.
 */
async function executeCreate(basePath, fileUpdate) {
  const filePath = path.join(basePath, fileUpdate.file);
  await writeFile(filePath, fileUpdate.content);
}

/**
 * Execute inline updates to current.md.
 * These update sections that are managed inline (Pending Review, Open Loops).
 */
async function executeInlineUpdates(basePath, inlineUpdates) {
  if (!inlineUpdates || inlineUpdates.length === 0) return;

  const currentPath = path.join(basePath, 'current.md');
  let content = await readFileOrEmpty(currentPath);

  for (const update of inlineUpdates) {
    const lines = content.split('\n');
    const sectionHeader = `## ${update.section}`;
    const { startIndex, endIndex } = findSection(lines, sectionHeader);

    if (startIndex === -1) continue;

    switch (update.action) {
      case 'append': {
        // Find end of section content (before next section)
        let insertIndex = endIndex;
        for (let i = endIndex - 1; i > startIndex; i--) {
          if (lines[i].trim() !== '' && !lines[i].startsWith('<!--')) {
            insertIndex = i + 1;
            break;
          }
        }
        // Handle case where section only has placeholder text
        if (lines[startIndex + 1]?.startsWith('<!--')) {
          insertIndex = startIndex + 2;
        }
        // Remove placeholder if present
        const placeholderIndex = lines.findIndex(
          (line, idx) => idx > startIndex && idx < endIndex && line.includes('*No ')
        );
        if (placeholderIndex !== -1) {
          lines.splice(placeholderIndex, 1);
          if (insertIndex > placeholderIndex) insertIndex--;
        }
        lines.splice(insertIndex, 0, update.content);
        break;
      }
      case 'replace': {
        // Replace everything between header+comment and next section
        let contentStart = startIndex + 1;
        // Skip the source comment if present
        if (lines[contentStart]?.startsWith('<!--')) {
          contentStart++;
        }
        const newLines = [
          ...lines.slice(0, contentStart),
          update.content,
          ...lines.slice(endIndex)
        ];
        content = newLines.join('\n');
        continue;
      }
      case 'clear': {
        // Clear section content, restore placeholder
        let contentStart = startIndex + 1;
        if (lines[contentStart]?.startsWith('<!--')) {
          contentStart++;
        }
        const placeholder = update.section === 'Pending Review'
          ? '*No items pending review*'
          : '*No open loops*';
        const newLines = [
          ...lines.slice(0, contentStart),
          placeholder,
          ...lines.slice(endIndex)
        ];
        content = newLines.join('\n');
        continue;
      }
    }
    content = lines.join('\n');
  }

  await writeFile(currentPath, content);
}

/**
 * Execute all file updates from Claude's response.
 * @param {string} basePath - Base path for data directory
 * @param {Object[]} fileUpdates - Array of file update objects
 * @returns {Promise<Object>} Results summary
 */
async function executeFileUpdates(basePath, fileUpdates) {
  const results = { success: [], failed: [] };

  for (const update of fileUpdates || []) {
    try {
      switch (update.action) {
        case 'append':
          await executeAppend(basePath, update);
          break;
        case 'append_to_section':
          await executeAppendToSection(basePath, update);
          break;
        case 'prepend_to_section':
          await executePrependToSection(basePath, update);
          break;
        case 'replace_section':
          await executeReplaceSection(basePath, update);
          break;
        case 'mark_complete':
          await executeMarkComplete(basePath, update);
          break;
        case 'remove_item':
          await executeRemoveItem(basePath, update);
          break;
        case 'create':
          await executeCreate(basePath, update);
          break;
        default:
          throw new Error(`Unknown action: ${update.action}`);
      }
      results.success.push(update);
    } catch (error) {
      results.failed.push({ update, error: error.message });
    }
  }

  return results;
}

export {
  executeFileUpdates,
  executeInlineUpdates,
  findSection,
  readFileOrEmpty,
  writeFile,
  ensureDir,
};
