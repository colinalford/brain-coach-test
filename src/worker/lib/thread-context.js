/**
 * Thread Context - Build conversation context from Slack thread replies.
 *
 * When a message arrives with thread_ts, the DO fetches thread history
 * and passes it to the LLM. This module handles truncation and formatting.
 */

/**
 * Build thread context from Slack messages.
 * Always includes thread parent (first message). When over limits,
 * keeps the parent + most recent messages.
 *
 * @param {Array} messages - Slack thread messages (chronological order)
 * @param {Object} [opts]
 * @param {number} [opts.messageLimit=20] - Max messages to include
 * @param {number} [opts.charLimit=15000] - Max total characters
 * @returns {{ messages: Array, truncated: boolean }}
 */
export function buildThreadContext(messages, opts = {}) {
  const { messageLimit = 20, charLimit = 15000 } = opts;

  if (!messages || messages.length === 0) {
    return { messages: [], truncated: false };
  }

  if (messages.length === 1) {
    return { messages: [...messages], truncated: false };
  }

  // Always keep the parent (first message)
  const parent = messages[0];
  const rest = messages.slice(1);

  // Start with just the parent
  let selected = [parent];
  let truncated = false;

  // Take messages from the end (most recent first) up to limits
  // Reserve 1 slot for the parent
  const maxRest = messageLimit - 1;
  let restToInclude = rest;

  if (restToInclude.length > maxRest) {
    restToInclude = rest.slice(-maxRest);
    truncated = true;
  }

  // Check character limit
  let totalChars = parent.text?.length || 0;
  const includedFromEnd = [];

  for (let i = restToInclude.length - 1; i >= 0; i--) {
    const msgLen = restToInclude[i].text?.length || 0;
    if (totalChars + msgLen > charLimit) {
      truncated = true;
      break;
    }
    totalChars += msgLen;
    includedFromEnd.unshift(restToInclude[i]);
  }

  selected = [parent, ...includedFromEnd];

  return { messages: selected, truncated };
}

/**
 * Format thread context for LLM consumption.
 * Labels messages as User/Assistant based on bot_id.
 *
 * @param {{ messages: Array, truncated: boolean }} context - Built thread context
 * @param {string} botUserId - Bot's Slack user ID (to identify assistant messages)
 * @returns {string} Formatted conversation text
 */
export function formatThreadForLLM(context, botUserId) {
  const lines = [];

  if (context.truncated) {
    lines.push('[...earlier messages omitted for brevity...]');
    lines.push('');
  }

  for (const msg of context.messages) {
    const isBot = msg.bot_id || msg.user === botUserId;
    const role = isBot ? 'Assistant' : 'User';
    lines.push(`${role}: ${msg.text}`);
  }

  return lines.join('\n');
}
