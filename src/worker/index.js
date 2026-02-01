/**
 * Second Brain - Cloudflare Worker
 *
 * Routes Slack events to Durable Objects for low-latency processing.
 * BrainDO is the main coordinator that routes by channel type.
 */

// Re-export Durable Objects for wrangler
export { BrainDO, ProjectDO, RitualDO } from './durable-objects/index.js';

// Environment variables (set via wrangler secret or dashboard):
// - SLACK_SIGNING_SECRET
// - SLACK_BOT_TOKEN
// - GITHUB_TOKEN
// - GITHUB_REPO
// - ANTHROPIC_API_KEY
// - SLACK_INBOX_CHANNEL_ID
// - SLACK_WEEKLY_CHANNEL_ID
// - SLACK_MONTHLY_CHANNEL_ID
// - SLACK_BOT_USER_ID

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'second-brain' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Test endpoint to check BrainDO context (debugging)
    if (url.pathname === '/test/context') {
      return routeToBrainDO(env, '/context');
    }


    // Test endpoints for system tests (stub management)
    if (url.pathname === '/test/stubs' && request.method === 'POST') {
      const body = await request.json();
      return routeToBrainDO(env, '/test/stubs', body);
    }

    if (url.pathname === '/test/recordings' && request.method === 'GET') {
      return routeToBrainDO(env, '/test/recordings');
    }

    if (url.pathname === '/test/recordings' && request.method === 'DELETE') {
      const brainDOId = env.BRAIN_DO.idFromName('brain');
      const brainDO = env.BRAIN_DO.get(brainDOId);
      return brainDO.fetch(new Request('http://internal/test/recordings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    // Only accept POST for Slack endpoints
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Get request body as text for signature verification
      const body = await request.text();

      // Verify Slack signature
      const timestamp = request.headers.get('x-slack-request-timestamp');
      const signature = request.headers.get('x-slack-signature');

      if (!await verifySlackSignature(body, timestamp, signature, env.SLACK_SIGNING_SECRET)) {
        return new Response('Invalid signature', { status: 401 });
      }

      // Parse the body
      const contentType = request.headers.get('content-type') || '';
      let payload;

      if (contentType.includes('application/json')) {
        payload = JSON.parse(body);
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(body);
        if (params.has('command')) {
          payload = Object.fromEntries(params);
          payload.type = 'slash_command';
        } else if (params.has('payload')) {
          payload = JSON.parse(params.get('payload'));
        } else {
          payload = Object.fromEntries(params);
        }
      }

      // Route based on path and payload type
      if (url.pathname === '/events') {
        return await handleEvent(payload, env, ctx);
      } else if (url.pathname === '/commands') {
        return await handleSlashCommand(payload, env, ctx);
      } else if (url.pathname === '/interactive') {
        return await handleInteractive(payload, env, ctx);
      }

      return new Response('Not found', { status: 404 });

    } catch (error) {
      console.error('Worker error:', JSON.stringify({ error: error.message, stack: error.stack }));
      return new Response('Internal error', { status: 500 });
    }
  }
};

/**
 * Verify Slack request signature.
 */
async function verifySlackSignature(body, timestamp, signature, secret) {
  if (!timestamp || !signature || !secret) {
    return false;
  }

  // Check timestamp is recent (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false;
  }

  // Compute expected signature
  const sigBasestring = `v0:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBasestring));
  const expectedSignature = 'v0=' + Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === expectedSignature;
}

/**
 * Route a request to BrainDO.
 * @param {Object} env - Environment bindings
 * @param {string} path - Path to call on BrainDO
 * @param {Object} [body] - Request body
 * @returns {Promise<Response>}
 */
async function routeToBrainDO(env, path, body = null) {
  // BrainDO is a singleton - always use the same ID
  const brainDOId = env.BRAIN_DO.idFromName('brain');
  const brainDO = env.BRAIN_DO.get(brainDOId);

  const options = {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return brainDO.fetch(new Request(`http://internal${path}`, options));
}

/**
 * Get channel name from Slack API.
 * @param {string} channelId - Channel ID
 * @param {Object} env - Environment bindings
 * @returns {Promise<string|null>}
 */
async function getChannelName(channelId, env) {
  try {
    const response = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, {
      headers: {
        'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
    });
    const data = await response.json();
    return data.ok ? data.channel.name : null;
  } catch {
    return null;
  }
}

/**
 * Handle Slack Events API.
 */
async function handleEvent(payload, env, ctx) {
  console.log(JSON.stringify({ type: 'event_received', eventType: payload.type }));

  // Handle URL verification challenge
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Handle event callbacks
  if (payload.type === 'event_callback') {
    const event = payload.event;
    console.log(JSON.stringify({
      type: 'event_callback',
      eventType: event.type,
      subtype: event.subtype,
      userId: event.user,
      channelId: event.channel,
    }));

    // Get bot user ID to avoid self-loops
    const OUR_BOT_USER_ID = env.SLACK_BOT_USER_ID || 'U0A9EDFDG2J';

    // Ignore messages from our bot
    if (event.user === OUR_BOT_USER_ID || event.subtype === 'bot_message') {
      console.log(JSON.stringify({ type: 'ignored', reason: 'bot_message' }));
      return new Response('OK', { status: 200 });
    }

    // Ignore message_changed, message_deleted, etc. (except file_share)
    if (event.subtype && event.subtype !== 'file_share') {
      console.log(JSON.stringify({ type: 'ignored', reason: 'subtype', subtype: event.subtype }));
      return new Response('OK', { status: 200 });
    }

    // Handle message events - route to BrainDO
    if (event.type === 'message' || event.type === 'app_mention') {
      // Get channel name for routing
      const channelName = await getChannelName(event.channel, env);

      // Compute trace_id from event_id
      const traceId = `evt_${payload.event_id}`;

      console.log(JSON.stringify({
        type: 'routing_to_brain_do',
        traceId,
        channelId: event.channel,
        channelName,
        userId: event.user,
      }));

      // Route to BrainDO asynchronously
      ctx.waitUntil(
        routeToBrainDO(env, '/message', {
          event_type: event.type,
          channel_id: event.channel,
          channel_name: channelName,
          user_id: event.user,
          text: event.text || '',
          thread_ts: event.thread_ts,
          message_ts: event.ts,
          is_thread_reply: !!event.thread_ts,
          trace_id: traceId,
          event_id: payload.event_id,
          team_id: payload.team_id,
        }).catch(error => {
          console.error(JSON.stringify({
            type: 'brain_do_error',
            traceId,
            error: error.message,
          }));
        })
      );
    }
  }

  // Always respond quickly to Slack
  return new Response('OK', { status: 200 });
}

/**
 * Handle Slash Commands.
 * Routes all commands to BrainDO for processing.
 */
async function handleSlashCommand(payload, env, ctx) {
  const { command, text, user_id, channel_id, channel_name, response_url, trigger_id } = payload;

  // Compute trace_id for slash commands using a hash of key fields
  const cmdKey = `${command}:${channel_id}:${user_id}:${trigger_id || Date.now()}`;
  const traceId = `cmd_${hashString(cmdKey)}`;

  console.log(JSON.stringify({
    type: 'slash_command',
    traceId,
    command,
    channelId: channel_id,
    channelName: channel_name,
  }));

  // Route to BrainDO for processing (async, respond via response_url)
  ctx.waitUntil(
    routeToBrainDO(env, '/command', {
      command,
      args: text || '',
      user_id,
      channel_id,
      channel_name: channel_name || '',
      response_url,
      trace_id: traceId,
    }).catch(error => {
      console.error(JSON.stringify({
        type: 'command_error',
        command,
        error: error.message,
      }));
      // Try to respond via response_url on error
      if (response_url) {
        fetch(response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            text: `Sorry, ${command} failed: ${error.message}`,
          }),
        }).catch(() => {});
      }
    })
  );

  // Return immediate acknowledgment
  return new Response(JSON.stringify({
    response_type: 'ephemeral',
    text: `Processing ${command}...`
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handle Interactive Components.
 */
async function handleInteractive(payload, env, ctx) {
  ctx.waitUntil(triggerGitHubAction(env, 'interactive.yml', {
    type: payload.type,
    action: payload.actions?.[0]?.action_id,
    user_id: payload.user?.id,
    channel_id: payload.channel?.id,
    response_url: payload.response_url,
  }));

  return new Response('OK', { status: 200 });
}

/**
 * Trigger a GitHub Action via workflow_dispatch.
 * Used as fallback for features not yet migrated to DOs.
 */
/**
 * Simple string hash for trace ID generation.
 * @param {string} str - String to hash
 * @returns {string} Short hash string
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

async function triggerGitHubAction(env, workflow, inputs) {
  const [owner, repo] = (env.GITHUB_REPO || '').split('/');

  if (!owner || !repo) {
    console.error(JSON.stringify({ type: 'error', message: 'Invalid GITHUB_REPO' }));
    return;
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'SecondBrain-Worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          payload: JSON.stringify(inputs),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(JSON.stringify({
        type: 'github_action_error',
        status: response.status,
        error: errorText,
      }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      type: 'github_action_error',
      error: error.message,
    }));
  }
}
