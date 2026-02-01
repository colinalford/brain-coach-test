/**
 * Slack API client for Cloudflare Workers.
 * Lightweight wrapper for edge-based Slack operations.
 */

const SLACK_API_BASE = 'https://slack.com/api';

/**
 * Create a Slack client for the worker.
 * @param {Object} options
 * @param {string} options.token - Slack bot OAuth token
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} Slack client instance
 */
export function createSlackClient({ token, logger }) {
  if (!token) {
    throw new Error('Slack bot token is required');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  /**
   * Make a POST request to Slack API.
   * @param {string} method - API method name
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Response data
   */
  async function post(method, body) {
    const url = `${SLACK_API_BASE}/${method}`;
    logger?.debug('Slack API request', { method, channel: body.channel });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      const error = new Error(`Slack API error: ${data.error}`);
      error.code = data.error;
      error.response = data;
      logger?.error('Slack API error', { method, error: data.error });
      throw error;
    }

    return data;
  }

  /**
   * Make a GET request to Slack API.
   * @param {string} method - API method name
   * @param {Object} [params] - Query parameters
   * @returns {Promise<Object>} Response data
   */
  async function get(method, params = {}) {
    const url = new URL(`${SLACK_API_BASE}/${method}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    logger?.debug('Slack API GET', { method, params });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!data.ok) {
      const error = new Error(`Slack API error: ${data.error}`);
      error.code = data.error;
      error.response = data;
      throw error;
    }

    return data;
  }

  return {
    /**
     * Post a message to a channel.
     * @param {Object} options
     * @param {string} options.channel - Channel ID
     * @param {string} options.text - Message text
     * @param {string} [options.thread_ts] - Thread timestamp for replies
     * @param {Object[]} [options.blocks] - Block kit blocks
     * @returns {Promise<Object>} Response with ts (timestamp) of posted message
     */
    async postMessage({ channel, text, thread_ts, blocks }) {
      return post('chat.postMessage', {
        channel,
        text,
        ...(thread_ts && { thread_ts }),
        ...(blocks && { blocks }),
      });
    },

    /**
     * Update an existing message.
     * @param {Object} options
     * @param {string} options.channel - Channel ID
     * @param {string} options.ts - Message timestamp to update
     * @param {string} options.text - New message text
     * @param {Object[]} [options.blocks] - Block kit blocks
     * @returns {Promise<Object>} Response
     */
    async updateMessage({ channel, ts, text, blocks }) {
      return post('chat.update', {
        channel,
        ts,
        text,
        ...(blocks && { blocks }),
      });
    },

    /**
     * Add a reaction to a message.
     * @param {Object} options
     * @param {string} options.channel - Channel ID
     * @param {string} options.timestamp - Message timestamp
     * @param {string} options.name - Reaction emoji name (without colons)
     * @returns {Promise<Object>} Response
     */
    async addReaction({ channel, timestamp, name }) {
      return post('reactions.add', {
        channel,
        timestamp,
        name,
      });
    },

    /**
     * Get information about a channel.
     * @param {string} channelId - Channel ID
     * @returns {Promise<Object>} Response with channel object
     */
    async getChannelInfo(channelId) {
      return get('conversations.info', { channel: channelId });
    },

    /**
     * Post a response to a response_url (for slash commands).
     * @param {string} responseUrl - The response URL from Slack
     * @param {Object} options
     * @param {string} options.text - Message text
     * @param {string} [options.response_type] - 'in_channel' or 'ephemeral'
     * @returns {Promise<void>}
     */
    async postResponse(responseUrl, { text, response_type = 'in_channel' }) {
      const response = await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, response_type }),
      });

      if (!response.ok) {
        throw new Error(`Failed to post response: ${response.status}`);
      }
    },

    /**
     * Create a new channel.
     * @param {Object} options
     * @param {string} options.name - Channel name
     * @param {boolean} [options.is_private] - Whether channel is private
     * @returns {Promise<Object>} Response with channel object
     */
    async createChannel({ name, is_private = false }) {
      return post('conversations.create', {
        name,
        is_private,
      });
    },

    /**
     * List channels.
     * @param {Object} [options]
     * @param {string} [options.types] - Channel types
     * @param {number} [options.limit] - Maximum channels
     * @returns {Promise<Object>} Response with channels array
     */
    async listChannels({ types = 'public_channel', limit = 200 } = {}) {
      return get('conversations.list', { types, limit });
    },

    /**
     * Find a channel by name.
     * @param {string} name - Channel name
     * @returns {Promise<Object|null>} Channel object or null
     */
    async findChannelByName(name) {
      const response = await this.listChannels();
      return response.channels.find((c) => c.name === name) || null;
    },

    /**
     * Get replies in a thread.
     * @param {Object} options
     * @param {string} options.channel - Channel ID
     * @param {string} options.ts - Thread parent timestamp
     * @returns {Promise<Object[]>} Array of messages in thread
     */
    async getThreadReplies({ channel, ts }) {
      const response = await get('conversations.replies', { channel, ts });
      return response.messages || [];
    },

    /**
     * Invite users to a channel.
     * @param {Object} options
     * @param {string} options.channel - Channel ID
     * @param {string|string[]} options.users - User ID(s) to invite (comma-separated string or array)
     * @returns {Promise<Object>} Response
     */
    async inviteToChannel({ channel, users }) {
      const userList = Array.isArray(users) ? users.join(',') : users;
      return post('conversations.invite', {
        channel,
        users: userList,
      });
    },

    /**
     * Archive a channel.
     * @param {Object} options
     * @param {string} options.channel - Channel ID
     * @returns {Promise<Object>} Response
     */
    async archiveChannel({ channel }) {
      return post('conversations.archive', {
        channel,
      });
    },
    /**
     * Post a message, splitting into multiple messages if too long.
     * Splits on heading boundaries (lines starting with *) to keep
     * sections together. Slack's limit is ~4000 chars per message.
     * @param {Object} options
     * @param {string} options.channel - Channel ID
     * @param {string} options.text - Message text (may be long)
     * @param {string} [options.thread_ts] - Thread timestamp
     * @returns {Promise<Object>} Response from first message (with ts)
     */
    async postLongMessage({ channel, text, thread_ts }) {
      const MAX_LENGTH = 3900; // Leave buffer below 4000

      if (text.length <= MAX_LENGTH) {
        return this.postMessage({ channel, text, thread_ts });
      }

      // Split by heading boundaries
      const chunks = splitByHeadings(text, MAX_LENGTH);
      let firstResponse = null;

      for (const chunk of chunks) {
        const response = await this.postMessage({ channel, text: chunk, thread_ts });
        if (!firstResponse) firstResponse = response;
      }

      return firstResponse;
    },
  };
}

/**
 * Split a long message into chunks at heading boundaries.
 * @param {string} text - Full message text
 * @param {number} maxLength - Max chars per chunk
 * @returns {string[]} Array of message chunks
 */
function splitByHeadings(text, maxLength) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (const line of lines) {
    const lineLength = line.length + 1; // +1 for newline

    // If adding this line would exceed limit and we have content,
    // and this line looks like a heading, start a new chunk
    if (
      currentLength + lineLength > maxLength &&
      currentChunk.length > 0 &&
      (line.startsWith('*') || line.startsWith('## ') || line.startsWith('# '))
    ) {
      chunks.push(currentChunk.join('\n').trim());
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(line);
    currentLength += lineLength;

    // Hard split if a single section exceeds the limit
    if (currentLength > maxLength && currentChunk.length > 1) {
      chunks.push(currentChunk.join('\n').trim());
      currentChunk = [];
      currentLength = 0;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n').trim());
  }

  return chunks.filter(c => c.length > 0);
}
