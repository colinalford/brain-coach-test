/**
 * Structured logging for Cloudflare Workers.
 * All logging goes through this module - no direct console.log.
 */

/**
 * Log levels in order of severity.
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Create a logger instance with optional request context.
 * @param {Object} [options]
 * @param {string} [options.requestId] - Unique request identifier
 * @param {string} [options.component] - Component name (e.g., 'BrainDO', 'SlackClient')
 * @param {string} [options.level] - Minimum log level ('debug', 'info', 'warn', 'error')
 * @returns {Object} Logger instance
 */
export function createLogger(options = {}) {
  const { requestId, component, level = 'info', traceId, ...extraContext } = options;
  const minLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;

  /**
   * Format and output a log entry.
   * @param {string} severity - Log level
   * @param {string} message - Log message
   * @param {Object} [data] - Additional structured data
   */
  function log(severity, message, data = {}) {
    const severityLevel = LOG_LEVELS[severity] ?? LOG_LEVELS.info;
    if (severityLevel < minLevel) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: severity,
      message,
      ...(traceId && { traceId }),
      ...(requestId && { requestId }),
      ...(component && { component }),
      ...extraContext,
      ...data,
    };

    // In Workers, console methods output to Cloudflare's logging system
    const output = JSON.stringify(entry);
    switch (severity) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  return {
    /**
     * Log a debug message.
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    debug(message, data) {
      log('debug', message, data);
    },

    /**
     * Log an info message.
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    info(message, data) {
      log('info', message, data);
    },

    /**
     * Log a warning message.
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data
     */
    warn(message, data) {
      log('warn', message, data);
    },

    /**
     * Log an error message.
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data (error.message, stack, etc.)
     */
    error(message, data) {
      log('error', message, data);
    },

    /**
     * Create a child logger with additional context.
     * @param {Object} childOptions - Additional context
     * @returns {Object} Child logger instance
     */
    child(childOptions) {
      return createLogger({
        requestId,
        component,
        level,
        traceId,
        ...extraContext,
        ...childOptions,
      });
    },

    /**
     * Time an async operation.
     * @param {string} operation - Operation name
     * @param {Function} fn - Async function to time
     * @returns {Promise<*>} Result of the function
     */
    async time(operation, fn) {
      const start = Date.now();
      try {
        const result = await fn();
        const duration = Date.now() - start;
        log('info', `${operation} completed`, { operation, durationMs: duration });
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        log('error', `${operation} failed`, {
          operation,
          durationMs: duration,
          error: error.message,
        });
        throw error;
      }
    },
  };
}

/**
 * Generate a unique request ID.
 * @returns {string} Unique ID
 */
export function generateRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
