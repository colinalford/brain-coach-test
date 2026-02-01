/**
 * BDD Test Helpers
 *
 * Extracted from inline test code after duplication appeared.
 * Each function was born from a real test needing it.
 */

import { createHmac } from 'crypto';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../../../.env.e2e') });

export const env = {
  TEST_WORKER_URL: process.env.TEST_WORKER_URL,
  SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET_TEST,
  INBOX_CHANNEL_ID: process.env.SLACK_INBOX_CHANNEL_ID,
  WEEKLY_CHANNEL_ID: process.env.SLACK_WEEKLY_CHANNEL_ID,
  MONTHLY_CHANNEL_ID: process.env.SLACK_MONTHLY_CHANNEL_ID,
  GITHUB_TEST_REPO: process.env.GITHUB_TEST_REPO,
  GITHUB_TEST_TOKEN: process.env.GITHUB_TEST_TOKEN,
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
  return fetch(`${env.TEST_WORKER_URL}/events`, {
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
  // Only include response_url if explicitly provided — omitting it forces
  // the handler to use the stub Slack client (postMessage) for delivery
  if (opts.responseUrl) {
    paramObj.response_url = opts.responseUrl;
  }
  const params = new URLSearchParams(paramObj);

  const body = params.toString();
  const { signature, timestamp } = sign(body);
  return fetch(`${env.TEST_WORKER_URL}/commands`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Slack-Request-Timestamp': String(timestamp),
      'X-Slack-Signature': signature,
    },
    body,
  });
}

export function buildMessageEvent(text, opts = {}) {
  const ts = opts.ts || `${Date.now() / 1000}`;
  return {
    type: 'event_callback',
    event_id: opts.eventId || `Ev${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    team_id: opts.teamId || 'T_TEST',
    event: {
      type: 'message',
      text,
      user: opts.userId || 'U_SYSTEM_TEST',
      channel: opts.channelId || env.INBOX_CHANNEL_ID,
      ts,
      ...(opts.threadTs && { thread_ts: opts.threadTs }),
    },
  };
}

// --- Stub management ---

export async function registerStubs(testId, stubs) {
  const res = await fetch(`${env.TEST_WORKER_URL}/test/stubs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test_id: testId, ...stubs }),
  });
  if (!res.ok) throw new Error(`Stub registration failed: ${res.status} ${await res.text()}`);
}

export async function getRecordings() {
  const res = await fetch(`${env.TEST_WORKER_URL}/test/recordings`);
  const data = await res.json();
  return data.recordings || [];
}

export async function clearRecordings() {
  await fetch(`${env.TEST_WORKER_URL}/test/recordings`, { method: 'DELETE' });
}

// --- GitHub observation ---

export async function githubGet(endpoint) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TEST_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'BDD-Tests',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getHeadSha() {
  const ref = await githubGet(`/repos/${env.GITHUB_TEST_REPO}/git/ref/heads/main`);
  return ref.object.sha;
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

export async function poll(fn, { interval = 2000, timeout = 10000, description = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Timeout waiting for: ${description}`);
}
