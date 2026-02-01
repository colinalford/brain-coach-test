/**
 * Write Intent - Schema and builder for write intents.
 *
 * Write intents are structured objects that describe what to write to GitHub.
 * BrainDO collects intents from all DOs and commits them atomically.
 *
 * Two op types:
 * - "put": Replace entire file with content
 * - "tool": Apply an LLM tool call to an existing file
 */

import { validateWriteIntent, truncateContent, MAX_CONTENT_SIZE } from './tool-validator.js';

/**
 * Create a "put" write intent (replace entire file).
 * @param {string} path - File path (must start with data/)
 * @param {string} content - File content
 * @param {string} [baseRefSha] - Optional base ref SHA for conflict detection
 * @returns {Object} Write intent
 */
export function putIntent(path, content, baseRefSha) {
  return {
    path,
    op: 'put',
    content: content.length > MAX_CONTENT_SIZE ? truncateContent(content) : content,
    ...(baseRefSha && { base_ref_sha: baseRefSha }),
  };
}

/**
 * Create a "tool" write intent (apply tool call to existing file).
 * @param {string} path - File path
 * @param {string} type - Tool call type (append_to_section, etc.)
 * @param {Object} params - Tool call params (heading, content, item)
 * @param {string} [baseRefSha] - Optional base ref SHA
 * @returns {Object} Write intent
 */
export function toolIntent(path, type, params, baseRefSha) {
  return {
    path,
    op: 'tool',
    type,
    ...params,
    ...(params.content && params.content.length > MAX_CONTENT_SIZE && {
      content: truncateContent(params.content),
    }),
    ...(baseRefSha && { base_ref_sha: baseRefSha }),
  };
}

/**
 * Validate an array of write intents.
 * Returns { valid: intent[], invalid: { intent, error }[] }
 * @param {Array} intents - Write intents to validate
 * @returns {{ valid: Object[], invalid: Array<{ intent: Object, error: string }> }}
 */
export function validateIntents(intents) {
  const valid = [];
  const invalid = [];

  for (const intent of intents) {
    const result = validateWriteIntent(intent);
    if (result.valid) {
      valid.push(intent);
    } else {
      invalid.push({ intent, error: result.error });
    }
  }

  return { valid, invalid };
}

/**
 * Apply tool intents to in-memory content.
 * For "tool" ops, applies the tool call to the content.
 * For "put" ops, returns the content as-is.
 * @param {Object} intent - Write intent
 * @param {string} currentContent - Current file content
 * @param {Function} applyToolCall - Tool applicator function
 * @returns {{ content: string, error: string|null }}
 */
export function resolveIntent(intent, currentContent, applyToolCall) {
  if (intent.op === 'put') {
    return { content: intent.content, error: null };
  }

  if (intent.op === 'tool') {
    return applyToolCall(currentContent, {
      type: intent.type,
      heading: intent.heading,
      content: intent.content,
      item: intent.item,
    });
  }

  return { content: currentContent, error: `Unknown op: ${intent.op}` };
}
