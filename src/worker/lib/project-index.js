/**
 * Project Index — generates and manages projects/index.md.
 *
 * The index is a markdown table of all projects, derived from
 * individual spread.md files. It is rebuilt whenever any spread
 * is updated, created, or archived.
 */

/**
 * Parse a project spread.md to extract index-relevant fields.
 * @param {string} slug - Project slug (directory name)
 * @param {string} content - Spread file content
 * @returns {Object} Parsed project entry
 */
export function parseSpreadForIndex(slug, content) {
  const name = content.match(/^#\s+(.+)/m)?.[1]?.trim() || slug;

  const statusSection = content.match(/## Status\n([\s\S]*?)(?=\n## |$)/);
  const status = statusSection?.[1]?.trim().split('\n')[0]?.trim().toLowerCase() || 'active';

  const descSection = content.match(/## Description\n([\s\S]*?)(?=\n## |$)/);
  const description = descSection?.[1]?.trim().split('\n')[0]?.trim() || '';

  return { slug, name, status, description };
}

/**
 * Build the index.md content from a list of project entries.
 * @param {Array<Object>} projects - Parsed project entries
 * @returns {string} Index file content
 */
export function buildIndexContent(projects) {
  const sorted = [...projects].sort((a, b) => {
    // Active first, then archived, then by name
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return a.name.localeCompare(b.name);
  });

  let content = '# Project Index\n\n';
  content += '| Project | Status | Description |\n';
  content += '|---------|--------|-------------|\n';

  for (const p of sorted) {
    content += `| [${p.name}](${p.slug}/spread.md) | ${p.status} | ${p.description} |\n`;
  }

  return content;
}

/**
 * Filter projects to active-only for inclusion in current.md.
 * @param {Array<Object>} projects - All project entries
 * @returns {Array<Object>} Active projects only
 */
export function filterActiveProjects(projects) {
  return projects.filter(p => p.status === 'active');
}

/**
 * Build an active-only index summary for current.md embedding.
 * @param {Array<Object>} projects - All project entries
 * @returns {string} Active projects table
 */
export function buildActiveIndexSummary(projects) {
  const active = filterActiveProjects(projects);

  if (active.length === 0) {
    return 'No active projects.';
  }

  let content = '| Project | Description |\n';
  content += '|---------|-------------|\n';

  for (const p of active) {
    content += `| [${p.name}](${p.slug}/spread.md) | ${p.description} |\n`;
  }

  return content;
}
