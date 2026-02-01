/**
 * Tool Call Validator - Validates LLM tool calls before execution.
 *
 * Security boundaries from SYSTEM.md:
 * - All file paths must start with `data/` (no `../`, no absolute paths)
 * - No file deletion
 * - No identity writes (data/identity/ is user-maintained)
 * - Max content per tool call: 10,000 characters
 * - Only canonical tool call types allowed
 */

/**
 * Canonical section editing tool call types.
 */
const SECTION_TOOL_TYPES = new Set([
  'append_to_section',
  'prepend_to_section',
  'replace_section',
  'mark_complete',
  'remove_item',
]);

/**
 * Canonical direct write tool call types.
 */
const DIRECT_TOOL_TYPES = new Set([
  'create_project',
  'update_spread',
  'write_log',
  'create_file',
  'trigger_research',
]);

/**
 * All allowed tool call types.
 */
const ALL_ALLOWED_TYPES = new Set([...SECTION_TOOL_TYPES, ...DIRECT_TOOL_TYPES]);

/**
 * Max content size per tool call (characters).
 */
const MAX_CONTENT_SIZE = 10000;

/**
 * Validate a tool call.
 * @param {Object} toolCall - Tool call to validate
 * @returns {{ valid: boolean, error: string|null, truncated: boolean }}
 */
export function validateToolCall(toolCall) {
  if (!toolCall || typeof toolCall !== 'object') {
    return { valid: false, error: 'Tool call must be an object', truncated: false };
  }

  // Check type is allowed
  if (!toolCall.type) {
    return { valid: false, error: 'Tool call missing type', truncated: false };
  }

  if (!ALL_ALLOWED_TYPES.has(toolCall.type)) {
    return { valid: false, error: `Unknown tool call type: ${toolCall.type}`, truncated: false };
  }

  // Check path safety for direct writes
  if (toolCall.path) {
    const pathError = validatePath(toolCall.path);
    if (pathError) {
      return { valid: false, error: pathError, truncated: false };
    }
  }

  // Check content size
  let truncated = false;
  if (toolCall.content && toolCall.content.length > MAX_CONTENT_SIZE) {
    truncated = true;
  }

  // Section tools need heading
  if (SECTION_TOOL_TYPES.has(toolCall.type) && toolCall.type !== 'mark_complete' && toolCall.type !== 'remove_item') {
    if (!toolCall.heading) {
      return { valid: false, error: `${toolCall.type} requires a heading field`, truncated: false };
    }
  }

  // mark_complete and remove_item need item or content
  if (toolCall.type === 'mark_complete' || toolCall.type === 'remove_item') {
    if (!toolCall.item && !toolCall.content) {
      return { valid: false, error: `${toolCall.type} requires an item or content field`, truncated: false };
    }
  }

  return { valid: true, error: null, truncated };
}

/**
 * Validate a file path for safety.
 * @param {string} path - File path to validate
 * @returns {string|null} Error message or null if valid
 */
export function validatePath(path) {
  if (!path || typeof path !== 'string') {
    return 'Path must be a non-empty string';
  }

  // Must start with data/
  if (!path.startsWith('data/')) {
    return `Path must start with data/: ${path}`;
  }

  // No path traversal
  if (path.includes('..')) {
    return `Path traversal detected: ${path}`;
  }

  // No absolute paths within the data path
  if (path.includes('//')) {
    return `Invalid path: ${path}`;
  }

  // No identity writes
  if (path.startsWith('data/identity/')) {
    return `Cannot write to identity files (user-maintained): ${path}`;
  }

  // Normalize and re-check
  const normalized = path.split('/').filter(p => p !== '.').join('/');
  if (normalized !== path) {
    return `Path contains unnecessary components: ${path}`;
  }

  return null;
}

/**
 * Validate a write intent.
 * @param {Object} intent - Write intent { path, op, content, type?, heading? }
 * @returns {{ valid: boolean, error: string|null, truncated: boolean }}
 */
export function validateWriteIntent(intent) {
  if (!intent || typeof intent !== 'object') {
    return { valid: false, error: 'Write intent must be an object', truncated: false };
  }

  // Validate path
  if (intent.path) {
    const pathError = validatePath(intent.path);
    if (pathError) {
      return { valid: false, error: pathError, truncated: false };
    }
  }

  // Validate op
  if (intent.op === 'tool') {
    // Tool intents share the same validation as tool calls
    return validateToolCall({
      type: intent.type,
      heading: intent.heading,
      content: intent.content,
      item: intent.item,
    });
  }

  if (intent.op === 'put') {
    // Put intents need path and content
    if (!intent.path) {
      return { valid: false, error: 'put intent requires a path', truncated: false };
    }
    let truncated = false;
    if (intent.content && intent.content.length > MAX_CONTENT_SIZE) {
      truncated = true;
    }
    return { valid: true, error: null, truncated };
  }

  if (!intent.op) {
    return { valid: false, error: 'Write intent missing op', truncated: false };
  }

  return { valid: false, error: `Unknown write intent op: ${intent.op}`, truncated: false };
}

/**
 * Truncate content to max size.
 * @param {string} content - Content to truncate
 * @returns {string} Truncated content
 */
export function truncateContent(content) {
  if (!content || content.length <= MAX_CONTENT_SIZE) return content;
  return content.slice(0, MAX_CONTENT_SIZE);
}

export { SECTION_TOOL_TYPES, DIRECT_TOOL_TYPES, ALL_ALLOWED_TYPES, MAX_CONTENT_SIZE };
