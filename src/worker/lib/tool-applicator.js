/**
 * Tool Applicator - Pure functions for applying LLM tool calls to markdown content.
 *
 * These operate on current.md held in memory by the DO.
 * Section matching rules from SYSTEM.md:
 * - Match by exact heading text including level (## Open Loops != ### Open Loops)
 * - First occurrence wins
 * - replace_section replaces content between heading and next same-or-higher-level heading
 * - mark_complete matches task text after trimming bullet/checkbox syntax
 * - remove_item matches by exact full-line equality after trimming trailing whitespace
 */

/**
 * Find a section in markdown content by heading.
 * Returns { start, end, headingEnd } where:
 *   - start is the index of the heading line start
 *   - headingEnd is the index after the heading line (content starts here)
 *   - end is the index of the next same-or-higher-level heading (or end of content)
 *
 * @param {string} content - Markdown content
 * @param {string} heading - Full heading including level (e.g., "## Open Loops")
 * @returns {{ start: number, headingEnd: number, end: number } | null}
 */
export function findSection(content, heading) {
  const lines = content.split('\n');
  const headingLevel = getHeadingLevel(heading);

  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimEnd() === heading.trimEnd()) {
      const headingEnd = lineStart + line.length + 1; // +1 for newline
      let end = content.length;

      // Find next heading of same or higher level
      let nextLineStart = headingEnd;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        const nextLevel = getHeadingLevel(nextLine);
        if (nextLevel > 0 && nextLevel <= headingLevel) {
          end = nextLineStart;
          break;
        }
        nextLineStart += nextLine.length + 1;
      }

      return { start: lineStart, headingEnd, end };
    }
    lineStart += line.length + 1;
  }

  return null;
}

/**
 * Get the heading level from a line (e.g., "## Foo" → 2, "# Bar" → 1).
 * @param {string} line - Line to check
 * @returns {number} Heading level (0 if not a heading)
 */
function getHeadingLevel(line) {
  const match = line.match(/^(#{1,6})\s/);
  return match ? match[1].length : 0;
}

/**
 * Apply an append_to_section tool call.
 * @param {string} content - Markdown content
 * @param {string} heading - Section heading (e.g., "## Open Loops")
 * @param {string} newContent - Content to append
 * @returns {{ content: string, error: string|null }}
 */
export function appendToSection(content, heading, newContent) {
  const section = findSection(content, heading);
  if (!section) {
    // Section doesn't exist — create it with the new content
    const prefix = content.length > 0 ? content.trimEnd() + '\n\n' : '';
    return { content: prefix + heading + '\n' + newContent + '\n', error: null };
  }

  const sectionContent = content.slice(section.headingEnd, section.end);
  const trimmed = sectionContent.trimEnd();
  const insertPoint = section.headingEnd + (trimmed.length || 0);

  const before = content.slice(0, insertPoint);
  const after = content.slice(section.end);
  const separator = trimmed.length > 0 ? '\n' : '\n';
  const result = before + separator + newContent + '\n' + after;

  return { content: result, error: null };
}

/**
 * Apply a prepend_to_section tool call.
 * @param {string} content - Markdown content
 * @param {string} heading - Section heading
 * @param {string} newContent - Content to prepend
 * @returns {{ content: string, error: string|null }}
 */
export function prependToSection(content, heading, newContent) {
  const section = findSection(content, heading);
  if (!section) {
    // Section doesn't exist — create it with the new content
    const prefix = content.length > 0 ? content.trimEnd() + '\n\n' : '';
    return { content: prefix + heading + '\n' + newContent + '\n', error: null };
  }

  const before = content.slice(0, section.headingEnd);
  const after = content.slice(section.headingEnd);
  const result = before + newContent + '\n' + after;

  return { content: result, error: null };
}

/**
 * Apply a replace_section tool call.
 * Replaces all content between the heading and the next same-or-higher-level heading.
 * The heading itself is preserved.
 * @param {string} content - Markdown content
 * @param {string} heading - Section heading
 * @param {string} newContent - New section content
 * @returns {{ content: string, error: string|null }}
 */
export function replaceSection(content, heading, newContent) {
  const section = findSection(content, heading);
  if (!section) {
    return { content, error: `Section not found: ${heading}` };
  }

  const before = content.slice(0, section.headingEnd);
  const after = content.slice(section.end);
  const result = before + '\n' + newContent + '\n\n' + after;

  return { content: result, error: null };
}

/**
 * Apply a mark_complete tool call.
 * Changes `- [ ]` to `- [x]` for a matching item text.
 * Matches by exact text after trimming leading bullet/checkbox syntax and trailing whitespace.
 * @param {string} content - Markdown content
 * @param {string} itemText - Task text to match (without bullet/checkbox prefix)
 * @returns {{ content: string, error: string|null }}
 */
export function markComplete(content, itemText) {
  const lines = content.split('\n');
  const normalizedTarget = itemText.trim();
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = stripBullet(line.trimEnd());
    if (stripped === normalizedTarget) {
      // Replace - [ ] with - [x]
      lines[i] = line.replace(/- \[ \]/, '- [x]');
      found = true;
      break;
    }
  }

  if (!found) {
    return { content, error: `Item not found: ${itemText}` };
  }

  return { content: lines.join('\n'), error: null };
}

/**
 * Apply a remove_item tool call.
 * Deletes a specific line from the content.
 * Matches by exact full-line equality after trimming trailing whitespace.
 * @param {string} content - Markdown content
 * @param {string} lineText - Full line text to remove
 * @returns {{ content: string, error: string|null }}
 */
export function removeItem(content, lineText) {
  const lines = content.split('\n');
  const normalizedTarget = lineText.trimEnd();
  let foundIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === normalizedTarget) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex === -1) {
    return { content, error: `Line not found: ${lineText}` };
  }

  lines.splice(foundIndex, 1);
  return { content: lines.join('\n'), error: null };
}

/**
 * Strip bullet/checkbox syntax from the start of a line.
 * @param {string} line - Line text
 * @returns {string} Stripped text
 */
function stripBullet(line) {
  return line
    .replace(/^[-*]\s*\[[ x]\]\s*/, '')
    .replace(/^[-*]\s*/, '')
    .trim();
}

/**
 * Apply a single tool call to content.
 * @param {string} content - Markdown content
 * @param {Object} toolCall - Tool call object
 * @param {string} toolCall.type - Tool call type
 * @param {string} [toolCall.heading] - Section heading (for section operations)
 * @param {string} [toolCall.content] - Content to apply
 * @param {string} [toolCall.item] - Item text (for mark_complete/remove_item)
 * @returns {{ content: string, error: string|null }}
 */
export function applyToolCall(content, toolCall) {
  switch (toolCall.type) {
    case 'append_to_section':
      return appendToSection(content, toolCall.heading, toolCall.content);

    case 'prepend_to_section':
      return prependToSection(content, toolCall.heading, toolCall.content);

    case 'replace_section':
      return replaceSection(content, toolCall.heading, toolCall.content);

    case 'mark_complete':
      return markComplete(content, toolCall.item || toolCall.content);

    case 'remove_item':
      return removeItem(content, toolCall.item || toolCall.content);

    default:
      return { content, error: `Unknown tool call type: ${toolCall.type}` };
  }
}
