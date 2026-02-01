/**
 * E2E Test Helpers
 *
 * Unlike system tests, E2E tests hit real APIs:
 * - Worker: second-brain-e2e (no stub mode)
 * - Claude: real API
 * - Slack: real test workspace
 * - GitHub: real test repo
 */

import { createHmac } from 'crypto';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../../../../.env.e2e') });

export const env = {
  E2E_WORKER_URL: process.env.E2E_WORKER_URL,
  SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET_TEST,
  INBOX_CHANNEL_ID: process.env.SLACK_INBOX_CHANNEL_ID,
  WEEKLY_CHANNEL_ID: process.env.SLACK_WEEKLY_CHANNEL_ID,
  MONTHLY_CHANNEL_ID: process.env.SLACK_MONTHLY_CHANNEL_ID,
  GITHUB_TEST_REPO: process.env.GITHUB_TEST_REPO,
  GITHUB_TEST_TOKEN: process.env.GITHUB_TEST_TOKEN,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_BOT_USER_ID: process.env.SLACK_BOT_USER_ID,
};

// --- Signing ---

export function sign(body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sigBasestring = `v0:${timestamp}:${body}`;
  const signature = 'v0=' + createHmac('sha256', env.SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex');
  return { signature, timestamp };
}

// --- Worker requests ---

export async function sendEvent(payload) {
  const body = JSON.stringify(payload);
  const { signature, timestamp } = sign(body);
  return fetch(`${env.E2E_WORKER_URL}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Slack-Request-Timestamp': String(timestamp),
      'X-Slack-Signature': signature,
    },
    body,
  });
}

export async function sendCommand(command, text, opts = {}) {
  const paramObj = {
    command,
    text: text || '',
    user_id: opts.userId || 'U_SYSTEM_TEST',
    channel_id: opts.channelId || env.INBOX_CHANNEL_ID,
    channel_name: opts.channelName || 'sb-inbox',
    trigger_id: `${Date.now()}.test`,
  };
  if (opts.responseUrl) {
    paramObj.response_url = opts.responseUrl;
  }
  const params = new URLSearchParams(paramObj);

  const body = params.toString();
  const { signature, timestamp } = sign(body);
  return fetch(`${env.E2E_WORKER_URL}/commands`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Slack-Request-Timestamp': String(timestamp),
      'X-Slack-Signature': signature,
    },
    body,
  });
}

// --- Slack observation (real API) ---

async function slackGet(method, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://slack.com/api/${method}?${qs}`, {
    headers: { 'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}` },
  });
  return res.json();
}

/**
 * Get thread replies from real Slack.
 */
export async function getThreadReplies(channelId, threadTs) {
  const data = await slackGet('conversations.replies', {
    channel: channelId,
    ts: threadTs,
  });
  return data.messages || [];
}

/**
 * Wait for a bot reply in a thread.
 */
export async function waitForBotReply(channelId, threadTs, opts = {}) {
  const { timeout = 20000, interval = 2000 } = opts;
  return poll(
    async () => {
      const messages = await getThreadReplies(channelId, threadTs);
      // Find a reply from the bot (not the parent message)
      return messages.find(m =>
        m.ts !== threadTs &&
        (m.bot_id || m.user === env.SLACK_BOT_USER_ID)
      );
    },
    { timeout, interval, description: 'bot reply in thread' }
  );
}

// --- GitHub observation ---

export async function githubGet(endpoint) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TEST_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'BDD-E2E-Tests',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getRecentCommits(count = 5) {
  return githubGet(`/repos/${env.GITHUB_TEST_REPO}/commits?per_page=${count}`);
}

export async function getFileContent(path) {
  try {
    const data = await githubGet(`/repos/${env.GITHUB_TEST_REPO}/contents/${path}?ref=main`);
    return data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : null;
  } catch (error) {
    if (error.message.includes('404')) return null;
    throw error;
  }
}

// --- Polling ---

export async function poll(fn, { interval = 2000, timeout = 20000, description = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Timeout waiting for: ${description}`);
}
