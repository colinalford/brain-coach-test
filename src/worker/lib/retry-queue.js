/**
 * Retry Queue - Manages failed operations for retry.
 *
 * Queues failed operations in Durable Object storage and
 * retries them on subsequent requests.
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create a retry queue for a Durable Object.
 * @param {Object} options
 * @param {Object} options.storage - Durable Object storage
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.maxRetries] - Maximum retry attempts
 * @param {number} [options.retryDelayMs] - Delay between retries
 * @param {number} [options.maxAgeMs] - Maximum age of queued items
 * @returns {Object} Retry queue instance
 */
export function createRetryQueue({
  storage,
  logger,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}) {
  const log = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  const QUEUE_KEY = 'retry-queue';

  /**
   * Get the current queue from storage.
   */
  async function getQueue() {
    const queue = await storage.get(QUEUE_KEY);
    return queue || [];
  }

  /**
   * Save the queue to storage.
   */
  async function saveQueue(queue) {
    await storage.put(QUEUE_KEY, queue);
  }

  return {
    /**
     * Add an operation to the retry queue.
     * @param {Object} operation
     * @param {string} operation.type - Operation type (e.g., 'github_write')
     * @param {Object} operation.payload - Operation payload
     * @param {string} [operation.error] - Error message from failed attempt
     * @returns {Promise<void>}
     */
    async enqueue(operation) {
      const queue = await getQueue();

      const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: operation.type,
        payload: operation.payload,
        error: operation.error,
        attempts: 0,
        createdAt: Date.now(),
        nextRetryAt: Date.now() + retryDelayMs,
      };

      queue.push(item);
      await saveQueue(queue);

      log.info('Operation queued for retry', {
        id: item.id,
        type: item.type,
        queueLength: queue.length,
      });
    },

    /**
     * Get operations ready for retry.
     * @returns {Promise<Object[]>} Operations ready for retry
     */
    async getReadyForRetry() {
      const queue = await getQueue();
      const now = Date.now();

      return queue.filter(item =>
        item.attempts < maxRetries &&
        item.nextRetryAt <= now &&
        (now - item.createdAt) < maxAgeMs
      );
    },

    /**
     * Mark an operation as successfully completed.
     * @param {string} id - Operation ID
     * @returns {Promise<void>}
     */
    async complete(id) {
      const queue = await getQueue();
      const newQueue = queue.filter(item => item.id !== id);
      await saveQueue(newQueue);

      log.info('Retry operation completed', { id });
    },

    /**
     * Mark an operation as failed (increment retry count).
     * @param {string} id - Operation ID
     * @param {string} error - Error message
     * @returns {Promise<boolean>} True if will retry, false if exhausted
     */
    async fail(id, error) {
      const queue = await getQueue();
      const item = queue.find(i => i.id === id);

      if (!item) {
        log.warn('Retry item not found', { id });
        return false;
      }

      item.attempts += 1;
      item.error = error;
      item.lastFailedAt = Date.now();
      item.nextRetryAt = Date.now() + (retryDelayMs * Math.pow(2, item.attempts)); // Exponential backoff

      const willRetry = item.attempts < maxRetries;

      if (!willRetry) {
        log.error('Retry exhausted', {
          id,
          type: item.type,
          attempts: item.attempts,
          error,
        });
      } else {
        log.warn('Retry failed, will retry', {
          id,
          type: item.type,
          attempts: item.attempts,
          nextRetryAt: new Date(item.nextRetryAt).toISOString(),
        });
      }

      await saveQueue(queue);
      return willRetry;
    },

    /**
     * Process all ready operations with a handler.
     * @param {Function} handler - Async function to process each operation
     * @returns {Promise<Object>} Results summary
     */
    async processQueue(handler) {
      const ready = await this.getReadyForRetry();

      if (ready.length === 0) {
        return { processed: 0, succeeded: 0, failed: 0 };
      }

      log.info('Processing retry queue', { count: ready.length });

      let succeeded = 0;
      let failed = 0;

      for (const item of ready) {
        try {
          await handler(item);
          await this.complete(item.id);
          succeeded++;
        } catch (error) {
          await this.fail(item.id, error.message);
          failed++;
        }
      }

      log.info('Retry queue processed', { processed: ready.length, succeeded, failed });

      return { processed: ready.length, succeeded, failed };
    },

    /**
     * Clean up old/expired items.
     * @returns {Promise<number>} Number of items cleaned
     */
    async cleanup() {
      const queue = await getQueue();
      const now = Date.now();

      const newQueue = queue.filter(item => {
        const isExpired = (now - item.createdAt) >= maxAgeMs;
        const isExhausted = item.attempts >= maxRetries;
        return !isExpired && !isExhausted;
      });

      const cleaned = queue.length - newQueue.length;

      if (cleaned > 0) {
        await saveQueue(newQueue);
        log.info('Retry queue cleaned', { removed: cleaned, remaining: newQueue.length });
      }

      return cleaned;
    },

    /**
     * Get queue statistics.
     * @returns {Promise<Object>} Queue stats
     */
    async getStats() {
      const queue = await getQueue();
      const now = Date.now();

      return {
        total: queue.length,
        pending: queue.filter(i => i.attempts < maxRetries && i.nextRetryAt > now).length,
        ready: queue.filter(i => i.attempts < maxRetries && i.nextRetryAt <= now).length,
        exhausted: queue.filter(i => i.attempts >= maxRetries).length,
        byType: queue.reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {}),
      };
    },
  };
}
