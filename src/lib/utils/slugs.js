/**
 * Slug generation utilities for the Second Brain system.
 * Extracted from GitHub Actions workflow bash logic.
 *
 * Original bash logic:
 * - Convert to lowercase
 * - Replace non-alphanumeric with hyphens
 * - Collapse multiple hyphens
 * - Truncate to 40 chars
 */

const DEFAULT_MAX_LENGTH = 40;

/**
 * Generate a URL-safe slug from a string.
 * @param {string} input - The string to convert
 * @param {Object} options - Options
 * @param {number} options.maxLength - Maximum length of the slug (default: 40)
 * @returns {string} The generated slug
 */
export function generateSlug(input, options = {}) {
  const { maxLength = DEFAULT_MAX_LENGTH } = options;

  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .toLowerCase()                    // tr '[:upper:]' '[:lower:]'
    .replace(/[^a-z0-9]/g, '-')       // sed 's/[^a-z0-9]/-/g'
    .replace(/-+/g, '-')              // sed 's/--*/-/g'
    .replace(/^-|-$/g, '')            // Remove leading/trailing hyphens
    .slice(0, maxLength);             // head -c 40
}

/**
 * Generate a project channel name from a project name.
 * @param {string} projectName - The project name
 * @returns {string} The channel name (prefixed with "proj-")
 */
export function generateProjectChannelName(projectName) {
  const slug = generateSlug(projectName);
  // Slack channel names are limited to 80 chars, and we prefix with "proj-"
  return `proj-${slug}`.slice(0, 80);
}

/**
 * Generate a filename slug for calendar events.
 * @param {string} title - The event title
 * @returns {string} The filename (without extension)
 */
export function generateEventFilename(title) {
  return generateSlug(title);
}

/**
 * Generate an entity filename slug.
 * @param {string} name - The entity name
 * @returns {string} The filename (without extension)
 */
export function generateEntityFilename(name) {
  return generateSlug(name);
}

/**
 * Extract project slug from a channel name.
 * @param {string} channelName - The Slack channel name
 * @returns {string|null} The project slug if this is a project channel, null otherwise
 */
export function extractProjectSlugFromChannel(channelName) {
  if (!channelName || typeof channelName !== 'string') {
    return null;
  }

  if (channelName.startsWith('proj-')) {
    return channelName.slice(5); // Remove "proj-" prefix
  }

  return null;
}

/**
 * Check if a channel name is a project channel.
 * @param {string} channelName - The Slack channel name
 * @returns {boolean} True if this is a project channel
 */
export function isProjectChannel(channelName) {
  return channelName?.startsWith('proj-') ?? false;
}
