#!/usr/bin/env node
/**
 * Invite the Second Brain bot to a channel
 *
 * Usage:
 *   1. Get a user OAuth token (xoxp-...) from Slack
 *   2. Run: SLACK_USER_TOKEN=xoxp-... node scripts/invite-bot-to-channel.mjs
 *
 * Or manually invite from Slack:
 *   1. Go to #sb-test channel
 *   2. Type: /invite @second_brain
 */

import { readFileSync } from 'fs';

// Try to load from .env.e2e
let userToken = process.env.SLACK_USER_TOKEN;
if (!userToken) {
  try {
    const env = Object.fromEntries(
      readFileSync('.env.e2e', 'utf8')
        .split('\n')
        .filter(l => l && !l.startsWith('#'))
        .map(l => { const [k,...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
    );
    userToken = env.SLACK_USER_TOKEN;
  } catch (e) {}
}

const botToken = process.env.SLACK_BOT_TOKEN;
const channelId = process.argv[2] || 'C0A9EQXJRFV'; // #sb-test
const botUserId = 'U0A9EDFDG2J';

async function main() {
  console.log('Inviting bot to channel:', channelId);
  console.log('Bot user ID:', botUserId);

  // Method 1: Try conversations.join (requires channels:join scope)
  console.log('\n1. Trying conversations.join...');
  const joinResult = await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ channel: channelId })
  }).then(r => r.json());

  if (joinResult.ok) {
    console.log('✅ Bot joined channel successfully!');
    return;
  }
  console.log('   Failed:', joinResult.error);

  // Method 2: Try with user token if available
  if (userToken && userToken.startsWith('xoxp-')) {
    console.log('\n2. Trying conversations.invite with user token...');
    const inviteResult = await fetch('https://slack.com/api/conversations.invite', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: channelId,
        users: botUserId
      })
    }).then(r => r.json());

    if (inviteResult.ok) {
      console.log('✅ Bot invited to channel successfully!');
      return;
    }
    console.log('   Failed:', inviteResult.error);
  } else {
    console.log('\n2. No user token available (SLACK_USER_TOKEN)');
  }

  console.log('\n❌ Could not invite bot automatically.');
  console.log('\nManual options:');
  console.log('  A) In Slack, go to #sb-test and type: /invite @second_brain');
  console.log('  B) Add "channels:join" scope to the Slack app at:');
  console.log('     https://api.slack.com/apps -> OAuth & Permissions -> Bot Token Scopes');
  console.log('  C) Provide a user token: SLACK_USER_TOKEN=xoxp-... node scripts/invite-bot-to-channel.mjs');
}

main().catch(console.error);
