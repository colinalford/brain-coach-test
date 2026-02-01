/**
 * Agent type definitions and interfaces.
 *
 * All agents follow a consistent pattern:
 * - Take a message/context as input
 * - Return structured actions and a Slack reply
 */

/**
 * Intent types for message classification.
 */
export const INTENTS = {
  CAPTURE: 'capture',      // Log a task, note, event
  QUESTION: 'question',    // Ask about context
  CHAT: 'chat',            // General conversation
  COMMAND: 'command',      // Slash-like command in message
  PROJECT_NEW: 'project_new',
  PROJECT_LIST: 'project_list',
  UNCLEAR: 'unclear',      // Can't determine - ask for clarification
};

/**
 * Action types that agents can return.
 */
export const ACTION_TYPES = {
  // File operations
  APPEND_TO_FILE: 'append_to_file',
  APPEND_TO_SECTION: 'append_to_section',
  PREPEND_TO_SECTION: 'prepend_to_section',
  REPLACE_SECTION: 'replace_section',
  CREATE_FILE: 'create_file',

  // Inline updates to current.md
  UPDATE_OPEN_LOOPS: 'update_open_loops',
  UPDATE_PENDING_REVIEW: 'update_pending_review',

  // External triggers
  TRIGGER_RESEARCH: 'trigger_research',
  TRIGGER_REBUILD: 'trigger_rebuild',
};

/**
 * Result structure returned by all agents.
 * @typedef {Object} AgentResult
 * @property {string} slackReply - Message to send to Slack
 * @property {Array<Object>} actions - File actions to execute
 * @property {Object|null} needsClarification - If we need user input
 * @property {Object} metadata - Additional data for logging
 */

/**
 * Create a standard agent result.
 * @param {Object} options
 * @param {string} options.slackReply - Reply to send
 * @param {Array} [options.actions] - Legacy actions (old format, deprecated)
 * @param {Array} [options.writeIntents] - Write intents (new format)
 * @param {Array} [options.specialActions] - Non-write actions (create_project, etc.)
 * @param {Object} [options.needsClarification] - Clarification needed
 * @param {Object} [options.metadata] - Extra metadata
 * @returns {AgentResult}
 */
export function createAgentResult({
  slackReply,
  actions = [],
  writeIntents = [],
  specialActions = [],
  needsClarification = null,
  metadata = {},
}) {
  return {
    slackReply,
    actions,
    writeIntents,
    specialActions,
    needsClarification,
    metadata,
  };
}

/**
 * Create a file action.
 * @param {string} type - Action type from ACTION_TYPES
 * @param {Object} params - Action parameters
 * @returns {Object} Action object
 */
export function createFileAction(type, params) {
  return {
    type,
    ...params,
  };
}
