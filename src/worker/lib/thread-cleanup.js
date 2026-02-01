/**
 * Thread Cleanup - Manages cleanup of old research and ritual threads.
 *
 * Archives or deletes stale threads from Durable Object storage
 * to prevent unbounded storage growth.
 */

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ARCHIVE_PREFIX = 'archive-';

/**
 * Create a thread cleanup manager.
 * @param {Object} options
 * @param {Object} options.storage - Durable Object storage
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.maxAgeMs] - Maximum age before cleanup
 * @returns {Object} Thread cleanup manager
 */
export function createThreadCleanup({ storage, logger, maxAgeMs = DEFAULT_MAX_AGE_MS }) {
  const log = logger || { info: () => {}, debug: () => {}, warn: () => {} };

  return {
    /**
     * Archive a completed thread.
     * @param {string} threadKey - Storage key for thread (e.g., 'research-123')
     * @param {Object} threadState - Thread state to archive
     * @returns {Promise<string>} Archive key
     */
    async archive(threadKey, threadState) {
      const archiveKey = `${ARCHIVE_PREFIX}${threadKey}`;

      const archive = {
        ...threadState,
        archivedAt: Date.now(),
        originalKey: threadKey,
      };

      await storage.put(archiveKey, archive);
      await storage.delete(threadKey);

      log.info('Thread archived', { threadKey, archiveKey });

      return archiveKey;
    },

    /**
     * Get an archived thread.
     * @param {string} archiveKey - Archive key
     * @returns {Promise<Object|null>}
     */
    async getArchived(archiveKey) {
      return storage.get(archiveKey);
    },

    /**
     * List all archived threads.
     * @returns {Promise<Object[]>}
     */
    async listArchived() {
      // Note: This is a simplified implementation
      // In production, you'd want to use storage.list() with a prefix
      // For now, we'll track archives in a separate key
      const archiveIndex = await storage.get('archive-index') || [];
      return archiveIndex;
    },

    /**
     * Clean up old threads.
     * @param {string} prefix - Thread key prefix (e.g., 'research-', 'ritual-')
     * @param {Object} [options]
     * @param {boolean} [options.archiveFirst] - Archive before deleting
     * @returns {Promise<Object>} Cleanup results
     */
    async cleanup(prefix, options = {}) {
      const { archiveFirst = true } = options;
      const now = Date.now();
      const cutoff = now - maxAgeMs;

      log.info('Starting thread cleanup', { prefix, maxAgeMs });

      // This is a simplified implementation
      // In a real DO, you'd iterate over storage keys
      // For now, we track thread keys in a registry

      const registryKey = `thread-registry-${prefix}`;
      const registry = await storage.get(registryKey) || [];

      let cleaned = 0;
      let archived = 0;
      const remaining = [];

      for (const threadKey of registry) {
        const thread = await storage.get(threadKey);

        if (!thread) {
          // Already deleted
          continue;
        }

        const threadAge = now - (thread.startedAt || thread.createdAt || 0);
        const isComplete = thread.status === 'committed' || thread.status === 'finalized';
        const isStale = threadAge > maxAgeMs;

        if (isComplete || isStale) {
          if (archiveFirst && isComplete) {
            await this.archive(threadKey, thread);
            archived++;
          } else {
            await storage.delete(threadKey);
          }
          cleaned++;
        } else {
          remaining.push(threadKey);
        }
      }

      // Update registry
      await storage.put(registryKey, remaining);

      log.info('Thread cleanup complete', { cleaned, archived, remaining: remaining.length });

      return { cleaned, archived, remaining: remaining.length };
    },

    /**
     * Register a thread for cleanup tracking.
     * @param {string} prefix - Thread prefix
     * @param {string} threadKey - Thread key
     * @returns {Promise<void>}
     */
    async register(prefix, threadKey) {
      const registryKey = `thread-registry-${prefix}`;
      const registry = await storage.get(registryKey) || [];

      if (!registry.includes(threadKey)) {
        registry.push(threadKey);
        await storage.put(registryKey, registry);
      }
    },

    /**
     * Unregister a thread (when manually deleted).
     * @param {string} prefix - Thread prefix
     * @param {string} threadKey - Thread key
     * @returns {Promise<void>}
     */
    async unregister(prefix, threadKey) {
      const registryKey = `thread-registry-${prefix}`;
      const registry = await storage.get(registryKey) || [];

      const newRegistry = registry.filter(k => k !== threadKey);
      await storage.put(registryKey, newRegistry);
    },

    /**
     * Get cleanup statistics.
     * @param {string} prefix - Thread prefix
     * @returns {Promise<Object>}
     */
    async getStats(prefix) {
      const registryKey = `thread-registry-${prefix}`;
      const registry = await storage.get(registryKey) || [];
      const now = Date.now();

      let active = 0;
      let stale = 0;
      let completed = 0;

      for (const threadKey of registry) {
        const thread = await storage.get(threadKey);

        if (!thread) continue;

        const isComplete = thread.status === 'committed' || thread.status === 'finalized';
        const threadAge = now - (thread.startedAt || thread.createdAt || 0);
        const isStale = threadAge > maxAgeMs;

        if (isComplete) {
          completed++;
        } else if (isStale) {
          stale++;
        } else {
          active++;
        }
      }

      return {
        total: registry.length,
        active,
        stale,
        completed,
      };
    },

    /**
     * Clean up old archives.
     * @param {number} [archiveMaxAgeMs] - Maximum archive age (default: 30 days)
     * @returns {Promise<number>} Number of archives deleted
     */
    async cleanupArchives(archiveMaxAgeMs = 30 * 24 * 60 * 60 * 1000) {
      const archiveIndex = await storage.get('archive-index') || [];
      const now = Date.now();
      const cutoff = now - archiveMaxAgeMs;

      let deleted = 0;
      const remaining = [];

      for (const archiveKey of archiveIndex) {
        const archive = await storage.get(archiveKey);

        if (!archive || archive.archivedAt < cutoff) {
          await storage.delete(archiveKey);
          deleted++;
        } else {
          remaining.push(archiveKey);
        }
      }

      await storage.put('archive-index', remaining);

      if (deleted > 0) {
        log.info('Archives cleaned', { deleted, remaining: remaining.length });
      }

      return deleted;
    },
  };
}
