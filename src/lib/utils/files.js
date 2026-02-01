/**
 * File utilities for the Second Brain system.
 * Handles reading/writing entity files, parsing frontmatter, and directory operations.
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Parse YAML frontmatter from markdown content.
 * @param {string} content - The markdown content
 * @returns {Object} { frontmatter: Object, body: string }
 */
export function parseFrontmatter(content) {
  const lines = content.split('\n');

  if (lines[0] !== '---') {
    return { frontmatter: {}, body: content };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const frontmatter = {};

  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes from values
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Parse arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        value = JSON.parse(value);
      } catch {
        // Keep as string if JSON parsing fails
      }
    }

    frontmatter[key] = value;
  }

  const body = lines.slice(endIndex + 1).join('\n').trim();

  return { frontmatter, body };
}

/**
 * Serialize frontmatter and body back to markdown.
 * @param {Object} frontmatter - The frontmatter object
 * @param {string} body - The markdown body
 * @returns {string} The complete markdown content
 */
export function serializeFrontmatter(frontmatter, body) {
  const lines = ['---'];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'string' && (value.includes(':') || value.includes('"') || value.includes("'"))) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(body);

  return lines.join('\n');
}

/**
 * Read and parse an entity file.
 * @param {string} filePath - Path to the entity file
 * @returns {Promise<Object|null>} { frontmatter, body, path } or null if not found
 */
export async function readEntityFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    return { frontmatter, body, path: filePath };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write an entity file with frontmatter.
 * @param {string} filePath - Path to the entity file
 * @param {Object} frontmatter - The frontmatter object
 * @param {string} body - The markdown body
 */
export async function writeEntityFile(filePath, frontmatter, body) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const content = serializeFrontmatter(frontmatter, body);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Update specific frontmatter fields in an entity file.
 * @param {string} filePath - Path to the entity file
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} True if file was updated
 */
export async function updateEntityFrontmatter(filePath, updates) {
  const entity = await readEntityFile(filePath);
  if (!entity) return false;

  const newFrontmatter = { ...entity.frontmatter, ...updates };
  await writeEntityFile(filePath, newFrontmatter, entity.body);
  return true;
}

/**
 * Add a log entry to an entity file.
 * @param {string} filePath - Path to the entity file
 * @param {string} entry - The log entry text
 * @param {string} date - The date string (YYYY-MM-DD)
 * @returns {Promise<boolean>} True if entry was added
 */
export async function addLogEntry(filePath, entry, date) {
  const entity = await readEntityFile(filePath);
  if (!entity) return false;

  // Find ## Log section and insert after it
  const lines = entity.body.split('\n');
  let logIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '## Log') {
      logIndex = i;
      break;
    }
  }

  if (logIndex !== -1) {
    lines.splice(logIndex + 1, 0, `- ${date}: ${entry}`);
    entity.body = lines.join('\n');
    await writeEntityFile(filePath, entity.frontmatter, entity.body);
    return true;
  }

  return false;
}

/**
 * List all files in a directory matching a pattern.
 * @param {string} dirPath - Directory to search
 * @param {string} extension - File extension to match (e.g., '.md')
 * @returns {Promise<string[]>} List of file paths
 */
export async function listFiles(dirPath, extension = '.md') {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith(extension))
      .map(entry => path.join(dirPath, entry.name));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Load all entities from a directory.
 * @param {string} dirPath - Directory containing entity files
 * @returns {Promise<Object[]>} Array of { frontmatter, body, path }
 */
export async function loadEntities(dirPath) {
  const files = await listFiles(dirPath);
  const entities = [];

  for (const filePath of files) {
    const entity = await readEntityFile(filePath);
    if (entity) {
      entities.push(entity);
    }
  }

  return entities;
}

/**
 * Find an entity by name or alias.
 * @param {string} dirPath - Directory to search
 * @param {string} searchName - Name or alias to find
 * @returns {Promise<Object|null>} The entity or null
 */
export async function findEntityByName(dirPath, searchName) {
  const entities = await loadEntities(dirPath);
  const searchLower = searchName.toLowerCase();

  for (const entity of entities) {
    const name = entity.frontmatter.name?.toLowerCase();
    const aliases = entity.frontmatter.aliases || [];

    if (name === searchLower) {
      return entity;
    }

    if (aliases.some(alias => alias.toLowerCase() === searchLower)) {
      return entity;
    }
  }

  return null;
}

/**
 * Get active projects.
 * @param {string} projectsDir - Path to projects directory
 * @returns {Promise<Object[]>} Array of active projects
 */
export async function getActiveProjects(projectsDir) {
  const projects = await loadEntities(projectsDir);
  return projects.filter(p => p.frontmatter.status !== 'completed');
}

/**
 * Get completed projects.
 * @param {string} projectsDir - Path to projects directory
 * @returns {Promise<Object[]>} Array of completed projects
 */
export async function getCompletedProjects(projectsDir) {
  const projects = await loadEntities(projectsDir);
  return projects.filter(p => p.frontmatter.status === 'completed');
}

/**
 * Extract a section from markdown body.
 * @param {string} body - The markdown body
 * @param {string} sectionName - The section header (without ##)
 * @returns {string} The section content
 */
export function extractSection(body, sectionName) {
  const lines = body.split('\n');
  const headerPattern = new RegExp(`^##\\s+${sectionName}\\s*$`, 'i');

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
 * Ensure a directory exists.
 * @param {string} dirPath - Directory path
 */
export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Check if a file exists.
 * @param {string} filePath - File path
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file as text.
 * @param {string} filePath - File path
 * @returns {Promise<string|null>} File content or null if not found
 */
export async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write text to a file.
 * @param {string} filePath - File path
 * @param {string} content - Content to write
 */
export async function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Append text to a file.
 * @param {string} filePath - File path
 * @param {string} content - Content to append
 */
export async function appendFile(filePath, content) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(filePath, content, 'utf-8');
}
