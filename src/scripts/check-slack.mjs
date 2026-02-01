import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.e2e', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const [k,...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const token = env.SLACK_BOT_TOKEN;

// List channels
const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100', {
  headers: { 'Authorization': 'Bearer ' + token }
});
const data = await response.json();

if (!data.ok) {
  console.log('Error:', data.error);
  process.exit(1);
}

console.log('Channels where bot is a MEMBER:');
data.channels.filter(c => c.is_member).forEach(c =>
  console.log('  ' + c.id + ' #' + c.name)
);

console.log('\nSB-related channels:');
data.channels.filter(c => c.name.includes('sb-') || c.name.includes('inbox')).forEach(c =>
  console.log('  ' + c.id + ' #' + c.name + (c.is_member ? ' [MEMBER]' : ' [NOT MEMBER]'))
);

console.log('\nTest channel from .env.e2e:', env.SLACK_TEST_CHANNEL_ID);
