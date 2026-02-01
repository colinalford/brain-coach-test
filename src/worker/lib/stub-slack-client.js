/**
 * Stub Slack Client for System Tests.
 *
 * Records all outbound Slack API calls with sequence numbers,
 * so tests can assert both presence and ordering.
 * Does not make real API calls.
 */

/**
 * Create a stub Slack client that records all calls.
 * @param {Object} options
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Stub Slack client with recording capabilities
 */
export function createStubSlackClient({ logger } = {}) {
  const log = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  // Recorded calls: { seq, method, args, timestamp }
  const recordings = [];
  let seq = 0;

  function record(method, args) {
    const entry = {
      seq: ++seq,
      method,
      args,
      timestamp: Date.now(),
    };
    recordings.push(entry);
    log.debug('StubSlackClient recorded call', { seq: entry.seq, method });
    return entry;
  }

  let channelCreateCounter = 0;

  return {
    /** Get all recorded calls */
    getRecordings() {
      return [...recordings];
    },

    /** Get recordings for a specific method */
    getRecordingsFor(method) {
      return recordings.filter(r => r.method === method);
    },

    /** Get recordings containing a specific test_id in any text field */
    getRecordingsForTest(testId) {
      return recordings.filter(r => {
        const text = r.args?.text || '';
        return text.includes(`[test:${testId}]`) || text.includes(testId);
      });
    },

    /** Clear all recordings */
    clearRecordings() {
      recordings.length = 0;
      seq = 0;
    },

    async postMessage({ channel, text, thread_ts, blocks }) {
      const entry = record('chat.postMessage', { channel, text, thread_ts, blocks });
      return {
        ok: true,
        channel,
        ts: `${Date.now() / 1000}`,
        message: { text, ts: `${Date.now() / 1000}` },
      };
    },

    async updateMessage({ channel, ts, text, blocks }) {
      record('chat.update', { channel, ts, text, blocks });
      return { ok: true, channel, ts };
    },

    async addReaction({ channel, timestamp, name }) {
      record('reactions.add', { channel, timestamp, name });
      return { ok: true };
    },

    async getChannelInfo(channelId) {
      record('conversations.info', { channel: channelId });
      return {
        ok: true,
        channel: {
          id: channelId,
          name: `stub-channel-${channelId}`,
          is_channel: true,
        },
      };
    },

    async postResponse(responseUrl, { text, response_type }) {
      record('response_url', { responseUrl, text, response_type });
    },

    async createChannel({ name, is_private }) {
      const entry = record('conversations.create', { name, is_private });
      channelCreateCounter++;
      return {
        ok: true,
        channel: {
          id: `C_STUB_${channelCreateCounter}`,
          name,
          is_channel: true,
        },
      };
    },

    async inviteToChannel({ channel, users }) {
      record('conversations.invite', { channel, users });
      return { ok: true, channel: { id: channel } };
    },

    async archiveChannel({ channel }) {
      record('conversations.archive', { channel });
      return { ok: true };
    },

    async listChannels({ types, limit } = {}) {
      record('conversations.list', { types, limit });
      return { ok: true, channels: [] };
    },

    async findChannelByName(name) {
      record('findChannelByName', { name });
      return null;
    },

    async getThreadReplies({ channel, ts }) {
      record('conversations.replies', { channel, ts });
      return [];
    },
  };
}
