/**
 * Error Handler - Friendly error messages and error handling utilities.
 *
 * Provides user-friendly error messages for Slack and structured
 * error logging for debugging.
 */

/**
 * Error types for classification.
 */
export const ERROR_TYPES = {
  GITHUB_READ: 'github_read',
  GITHUB_WRITE: 'github_write',
  SLACK_API: 'slack_api',
  CLAUDE_API: 'claude_api',
  TAVILY_API: 'tavily_api',
  TIMEOUT: 'timeout',
  VALIDATION: 'validation',
  INTERNAL: 'internal',
  UNKNOWN: 'unknown',
};

/**
 * User-friendly error messages by type.
 */
const FRIENDLY_MESSAGES = {
  [ERROR_TYPES.GITHUB_READ]: "I'm having trouble reading from storage right now. Your message was received - I'll process it when things are back to normal.",
  [ERROR_TYPES.GITHUB_WRITE]: "I processed your message but couldn't save the changes. I'll retry automatically.",
  [ERROR_TYPES.SLACK_API]: "I'm having trouble communicating. Please try again in a moment.",
  [ERROR_TYPES.CLAUDE_API]: "I'm having trouble thinking right now. Please try again in a moment.",
  [ERROR_TYPES.TAVILY_API]: "I couldn't complete the search right now. Try again or rephrase your query.",
  [ERROR_TYPES.TIMEOUT]: "That took longer than expected. I'll continue working on it.",
  [ERROR_TYPES.VALIDATION]: "I didn't understand that. Could you try rephrasing?",
  [ERROR_TYPES.INTERNAL]: "Something went wrong on my end. The team has been notified.",
  [ERROR_TYPES.UNKNOWN]: "Something unexpected happened. Please try again.",
};

/**
 * Classify an error into a known type.
 * @param {Error} error - The error to classify
 * @returns {string} Error type
 */
export function classifyError(error) {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('github')) {
    if (message.includes('write') || message.includes('commit') || message.includes('put')) {
      return ERROR_TYPES.GITHUB_WRITE;
    }
    return ERROR_TYPES.GITHUB_READ;
  }

  if (message.includes('slack')) {
    return ERROR_TYPES.SLACK_API;
  }

  if (message.includes('claude') || message.includes('anthropic')) {
    return ERROR_TYPES.CLAUDE_API;
  }

  if (message.includes('tavily')) {
    return ERROR_TYPES.TAVILY_API;
  }

  if (message.includes('timeout') || message.includes('aborted') || message.includes('timed out')) {
    return ERROR_TYPES.TIMEOUT;
  }

  if (message.includes('invalid') || message.includes('missing') || message.includes('required')) {
    return ERROR_TYPES.VALIDATION;
  }

  if (error.name === 'TypeError' || error.name === 'ReferenceError') {
    return ERROR_TYPES.INTERNAL;
  }

  return ERROR_TYPES.UNKNOWN;
}

/**
 * Get a user-friendly error message.
 * @param {Error} error - The error
 * @param {Object} [options]
 * @param {boolean} [options.includeDetails] - Include technical details
 * @returns {string} Friendly error message
 */
export function getFriendlyMessage(error, options = {}) {
  const { includeDetails = false } = options;

  const errorType = classifyError(error);
  let message = FRIENDLY_MESSAGES[errorType];

  if (includeDetails && process.env.NODE_ENV === 'development') {
    message += `\n\n_Debug: ${error.message}_`;
  }

  return message;
}

/**
 * Create a structured error for logging.
 * @param {Error} error - The error
 * @param {Object} context - Additional context
 * @returns {Object} Structured error object
 */
export function structuredError(error, context = {}) {
  return {
    type: classifyError(error),
    message: error.message,
    name: error.name,
    stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    ...context,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error handler for a Durable Object.
 * @param {Object} options
 * @param {Object} options.slackClient - Slack client
 * @param {Object} options.logger - Logger instance
 * @param {Object} [options.retryQueue] - Retry queue instance
 * @returns {Object} Error handler instance
 */
export function createErrorHandler({ slackClient, logger, retryQueue }) {
  return {
    /**
     * Handle an error with appropriate actions.
     * @param {Error} error - The error
     * @param {Object} context
     * @param {string} [context.channelId] - Slack channel to notify
     * @param {string} [context.threadTs] - Thread timestamp
     * @param {Object} [context.operation] - Failed operation for retry
     * @returns {Promise<void>}
     */
    async handle(error, context = {}) {
      const { channelId, threadTs, operation } = context;

      // Log the error
      logger.error('Error occurred', structuredError(error, context));

      // Queue for retry if applicable
      if (retryQueue && operation) {
        const errorType = classifyError(error);
        if (errorType === ERROR_TYPES.GITHUB_WRITE || errorType === ERROR_TYPES.TIMEOUT) {
          await retryQueue.enqueue({
            type: operation.type,
            payload: operation.payload,
            error: error.message,
          });
        }
      }

      // Notify user via Slack if channel provided
      if (channelId && slackClient) {
        try {
          await slackClient.postMessage({
            channel: channelId,
            text: `_${getFriendlyMessage(error)}_`,
            thread_ts: threadTs,
          });
        } catch (slackError) {
          logger.error('Failed to send error notification', {
            originalError: error.message,
            slackError: slackError.message,
          });
        }
      }
    },

    /**
     * Wrap an async operation with error handling.
     * @param {Function} operation - Async operation to wrap
     * @param {Object} context - Error context
     * @returns {Promise<any>} Operation result or null on error
     */
    async wrap(operation, context = {}) {
      try {
        return await operation();
      } catch (error) {
        await this.handle(error, context);
        return null;
      }
    },

    /**
     * Try an operation with fallback.
     * @param {Function} operation - Primary operation
     * @param {Function} fallback - Fallback operation
     * @param {Object} context - Error context
     * @returns {Promise<any>} Result from operation or fallback
     */
    async tryWithFallback(operation, fallback, context = {}) {
      try {
        return await operation();
      } catch (error) {
        logger.warn('Operation failed, using fallback', {
          error: error.message,
          ...context,
        });
        return await fallback();
      }
    },
  };
}

/**
 * Create a graceful degradation manager.
 * @param {Object} options
 * @param {Object} options.storage - Durable Object storage
 * @param {Object} options.logger - Logger instance
 * @returns {Object} Degradation manager
 */
export function createDegradationManager({ storage, logger }) {
  const SERVICE_STATUS_KEY = 'service-status';

  return {
    /**
     * Mark a service as unavailable.
     * @param {string} service - Service name
     * @param {string} error - Error message
     * @returns {Promise<void>}
     */
    async markUnavailable(service, error) {
      const status = await storage.get(SERVICE_STATUS_KEY) || {};
      status[service] = {
        available: false,
        lastError: error,
        unavailableSince: Date.now(),
      };
      await storage.put(SERVICE_STATUS_KEY, status);

      logger.warn('Service marked unavailable', { service, error });
    },

    /**
     * Mark a service as available.
     * @param {string} service - Service name
     * @returns {Promise<void>}
     */
    async markAvailable(service) {
      const status = await storage.get(SERVICE_STATUS_KEY) || {};
      if (status[service]) {
        const downtime = Date.now() - status[service].unavailableSince;
        logger.info('Service recovered', { service, downtimeMs: downtime });
      }
      status[service] = { available: true };
      await storage.put(SERVICE_STATUS_KEY, status);
    },

    /**
     * Check if a service is available.
     * @param {string} service - Service name
     * @returns {Promise<boolean>}
     */
    async isAvailable(service) {
      const status = await storage.get(SERVICE_STATUS_KEY) || {};
      return status[service]?.available !== false;
    },

    /**
     * Get overall system status.
     * @returns {Promise<Object>}
     */
    async getStatus() {
      const status = await storage.get(SERVICE_STATUS_KEY) || {};
      const services = Object.entries(status);

      return {
        healthy: services.every(([, s]) => s.available !== false),
        services: status,
        degraded: services.filter(([, s]) => s.available === false).map(([name]) => name),
      };
    },

    /**
     * Check if system should operate in read-only mode.
     * @returns {Promise<boolean>}
     */
    async isReadOnly() {
      const status = await storage.get(SERVICE_STATUS_KEY) || {};
      return status.github?.available === false;
    },
  };
}
