# Test Workspace Setup

This guide walks through setting up an isolated test environment for E2E/acceptance testing.

## Overview

- **Test Slack Workspace**: Completely separate from production
- **Test Worker**: `https://second-brain-test.colinalford.workers.dev` (already deployed)
- **Test Data**: Written to `data-test/` directory (not committed)

---

## Checklist

### 1. Create Test Slack Workspace

- [x] Create workspace at https://slack.com/create
- [x] Note the workspace name: `Second Brain Test`

### 2. Create Slack App from Manifest

- [x] Go to https://api.slack.com/apps
- [x] Click "Create New App" → "From manifest"
- [x] Select your TEST workspace
- [x] Paste contents of `slack-app-manifest.test.json`
- [x] Click "Create"

### 3. Install App to Workspace

- [x] Go to "Install App" in the sidebar
- [x] Click "Install to Workspace"
- [x] Authorize the app

### 4. Get Credentials

From the Slack App settings, collect:

- [ ] **Bot Token** (OAuth & Permissions → Bot User OAuth Token)
  - Starts with `xoxb-`
  - Value: (see .env.e2e)

- [ ] **Signing Secret** (Basic Information → App Credentials → Signing Secret)
  - Value: `211895a9c0fc40641956f9019c479406`

- [ ] **Bot User ID** (run this command after getting the bot token):
  ```bash
  curl -s -H "Authorization: Bearer YOUR_BOT_TOKEN" https://slack.com/api/auth.test | jq -r '.user_id'
  ```
  - Value: `_______________________`

### 5. Create Test Channel

- [ ] In the test Slack workspace, create a channel called `#test`
- [ ] Get the Channel ID (right-click channel → View channel details → scroll to bottom)
  - Value: `C0AAHBGT0JU`
- [ ] Invite the bot to the channel: `/invite @Second Brain Test`

### 6. Configure Test Worker Secrets

Run these commands to set the worker secrets:

```bash
cd src/worker

# Set each secret (you'll be prompted for the value)
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN npx wrangler secret put SLACK_SIGNING_SECRET --config wrangler.test.toml
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN npx wrangler secret put SLACK_BOT_TOKEN --config wrangler.test.toml
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN npx wrangler secret put GITHUB_TOKEN --config wrangler.test.toml
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN npx wrangler secret put GITHUB_REPO --config wrangler.test.toml
```

Values to use:
- `SLACK_SIGNING_SECRET`: From step 4 above
- `SLACK_BOT_TOKEN`: From step 4 above
- `GITHUB_TOKEN`: (see .env — same as production)
- `GITHUB_REPO`: `colinalford/brain-coach` (same as production)

- [ ] SLACK_SIGNING_SECRET set
- [ ] SLACK_BOT_TOKEN set
- [ ] GITHUB_TOKEN set
- [ ] GITHUB_REPO set

### 7. Enable Event Subscriptions

- [ ] Go to "Event Subscriptions" in the Slack app settings
- [ ] Enable Events (toggle on)
- [ ] Set Request URL to: `https://second-brain-test.colinalford.workers.dev/events`
- [ ] Wait for Slack to verify the URL (should show ✓ Verified)
- [ ] Save Changes

### 8. Update `.env.e2e`

- [ ] Update `.env.e2e` with the test workspace credentials (see template below)

### 9. Verify Setup

```bash
# Test the worker is responding
curl https://second-brain-test.colinalford.workers.dev/health

# Run acceptance tests
npm run test:acceptance
```

- [ ] Worker health check passes
- [ ] Acceptance tests run successfully

---

## `.env.e2e` Template

```bash
# E2E and Acceptance Test Configuration
# Uses TEST Slack workspace - completely isolated from production

# Claude API (same as production)
ANTHROPIC_API_KEY=your-anthropic-api-key

# Tavily Search API (same as production)
TAVILY_API_KEY=your-tavily-api-key

# Slack - TEST WORKSPACE
SLACK_BOT_TOKEN=xoxb-PASTE_FROM_STEP_4
SLACK_TEST_CHANNEL_ID=PASTE_FROM_STEP_5
SLACK_BOT_USER_ID=PASTE_FROM_STEP_4

# Optional: User token for posting as user (OAuth & Permissions → User Token)
# SLACK_USER_TOKEN=xoxp-...
```

---

## Troubleshooting

### Event URL verification fails
- Check that the worker is deployed: `curl https://second-brain-test.colinalford.workers.dev/health`
- Check worker logs: `npx wrangler tail --config src/worker/wrangler.test.toml`

### Bot doesn't respond
- Verify bot is in the channel: `/invite @Second Brain Test`
- Check worker secrets are set correctly
- Check GitHub Actions are being triggered

### Cleanup test data

Cleanup is now built into the E2E test helpers and runs automatically after test suites.
Manual cleanup is not needed in most cases.
