/**
 * Metrics - Simple metrics collection for observability.
 *
 * Collects operational metrics and stores them in Durable Object storage
 * for later analysis or export.
 */

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const METRICS_KEY = 'metrics';

/**
 * Create a metrics collector.
 * @param {Object} options
 * @param {Object} options.storage - Durable Object storage
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.retentionMs] - How long to keep metrics
 * @returns {Object} Metrics collector instance
 */
export function createMetrics({ storage, logger, retentionMs = DEFAULT_RETENTION_MS }) {
  const log = logger || { info: () => {}, debug: () => {} };

  /**
   * Get current metrics from storage.
   */
  async function getMetrics() {
    const data = await storage.get(METRICS_KEY);
    return data || {
      counters: {},
      timings: {},
      gauges: {},
      events: [],
      createdAt: Date.now(),
    };
  }

  /**
   * Save metrics to storage.
   */
  async function saveMetrics(metrics) {
    await storage.put(METRICS_KEY, metrics);
  }

  return {
    /**
     * Increment a counter.
     * @param {string} name - Counter name
     * @param {number} [value=1] - Value to add
     * @param {Object} [tags] - Optional tags
     * @returns {Promise<void>}
     */
    async increment(name, value = 1, tags = {}) {
      const metrics = await getMetrics();
      const key = formatKey(name, tags);

      metrics.counters[key] = (metrics.counters[key] || 0) + value;
      await saveMetrics(metrics);

      log.debug('Counter incremented', { name, value, total: metrics.counters[key] });
    },

    /**
     * Record a timing value.
     * @param {string} name - Timing name
     * @param {number} durationMs - Duration in milliseconds
     * @param {Object} [tags] - Optional tags
     * @returns {Promise<void>}
     */
    async timing(name, durationMs, tags = {}) {
      const metrics = await getMetrics();
      const key = formatKey(name, tags);

      if (!metrics.timings[key]) {
        metrics.timings[key] = {
          count: 0,
          total: 0,
          min: Infinity,
          max: -Infinity,
        };
      }

      const timing = metrics.timings[key];
      timing.count += 1;
      timing.total += durationMs;
      timing.min = Math.min(timing.min, durationMs);
      timing.max = Math.max(timing.max, durationMs);
      timing.avg = timing.total / timing.count;

      await saveMetrics(metrics);

      log.debug('Timing recorded', { name, durationMs, avg: timing.avg });
    },

    /**
     * Set a gauge value.
     * @param {string} name - Gauge name
     * @param {number} value - Current value
     * @param {Object} [tags] - Optional tags
     * @returns {Promise<void>}
     */
    async gauge(name, value, tags = {}) {
      const metrics = await getMetrics();
      const key = formatKey(name, tags);

      metrics.gauges[key] = {
        value,
        timestamp: Date.now(),
      };

      await saveMetrics(metrics);
    },

    /**
     * Record an event.
     * @param {string} name - Event name
     * @param {Object} [data] - Event data
     * @returns {Promise<void>}
     */
    async event(name, data = {}) {
      const metrics = await getMetrics();

      metrics.events.push({
        name,
        data,
        timestamp: Date.now(),
      });

      // Keep only recent events
      const cutoff = Date.now() - retentionMs;
      metrics.events = metrics.events.filter(e => e.timestamp > cutoff);

      await saveMetrics(metrics);

      log.debug('Event recorded', { name });
    },

    /**
     * Time an async operation.
     * @param {string} name - Timing name
     * @param {Function} operation - Async operation to time
     * @param {Object} [tags] - Optional tags
     * @returns {Promise<any>} Operation result
     */
    async time(name, operation, tags = {}) {
      const start = Date.now();
      try {
        const result = await operation();
        const duration = Date.now() - start;
        await this.timing(name, duration, { ...tags, status: 'success' });
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        await this.timing(name, duration, { ...tags, status: 'error' });
        throw error;
      }
    },

    /**
     * Get all metrics.
     * @returns {Promise<Object>}
     */
    async getAll() {
      return getMetrics();
    },

    /**
     * Get a summary of metrics.
     * @returns {Promise<Object>}
     */
    async getSummary() {
      const metrics = await getMetrics();

      return {
        counters: Object.entries(metrics.counters).map(([key, value]) => ({
          name: key,
          value,
        })),
        timings: Object.entries(metrics.timings).map(([key, data]) => ({
          name: key,
          count: data.count,
          avg: Math.round(data.avg),
          min: data.min === Infinity ? 0 : data.min,
          max: data.max === -Infinity ? 0 : data.max,
        })),
        gauges: Object.entries(metrics.gauges).map(([key, data]) => ({
          name: key,
          value: data.value,
          age: Date.now() - data.timestamp,
        })),
        recentEvents: metrics.events.slice(-10),
        age: Date.now() - metrics.createdAt,
      };
    },

    /**
     * Reset all metrics.
     * @returns {Promise<void>}
     */
    async reset() {
      await saveMetrics({
        counters: {},
        timings: {},
        gauges: {},
        events: [],
        createdAt: Date.now(),
      });

      log.info('Metrics reset');
    },

    /**
     * Clean up old data.
     * @returns {Promise<void>}
     */
    async cleanup() {
      const metrics = await getMetrics();
      const cutoff = Date.now() - retentionMs;

      // Clean old events
      const oldEventCount = metrics.events.length;
      metrics.events = metrics.events.filter(e => e.timestamp > cutoff);

      // Clean stale gauges
      for (const [key, data] of Object.entries(metrics.gauges)) {
        if (data.timestamp < cutoff) {
          delete metrics.gauges[key];
        }
      }

      await saveMetrics(metrics);

      log.info('Metrics cleaned', {
        eventsRemoved: oldEventCount - metrics.events.length,
      });
    },
  };
}

/**
 * Format a metric key with tags.
 */
function formatKey(name, tags) {
  if (!tags || Object.keys(tags).length === 0) {
    return name;
  }

  const tagStr = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

  return `${name}{${tagStr}}`;
}

/**
 * Create a request metrics middleware.
 * @param {Object} metrics - Metrics instance
 * @returns {Object} Middleware with start/end methods
 */
export function createRequestMetrics(metrics) {
  return {
    /**
     * Start tracking a request.
     * @param {Object} context - Request context
     * @returns {Object} Request tracker
     */
    start(context = {}) {
      return {
        startTime: Date.now(),
        context,
      };
    },

    /**
     * End tracking a request.
     * @param {Object} tracker - Request tracker from start()
     * @param {Object} [result] - Request result
     * @returns {Promise<void>}
     */
    async end(tracker, result = {}) {
      const duration = Date.now() - tracker.startTime;

      await metrics.timing('request.duration', duration, {
        ...tracker.context,
        status: result.error ? 'error' : 'success',
      });

      await metrics.increment('request.count', 1, tracker.context);

      if (result.error) {
        await metrics.increment('request.errors', 1, tracker.context);
      }
    },
  };
}
