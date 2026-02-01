# Setup Guide

This guide separates what **you need to do** (credentials, account setup) from what **Claude can do** (write code, deploy).

---

## Architecture Overview

```
Slack → Cloudflare Worker → GitHub Actions → Claude API → Repo → Slack
```

- **Cloudflare Worker**: Receives Slack events, triggers GitHub Actions
- **GitHub Actions**: All processing (Claude API calls, repo writes, Slack replies)
- **All code lives in the repo**: Version controlled, portable, maintainable

---

## Phase 1: Credentials You Need to Provide

### 1. GitHub Repository & Token

**You do:**
1. Create a new GitHub repo (or push this one to GitHub)
2. Go to https://github.com/settings/tokens
3. Generate new token (classic) with `repo` scope
4. Copy the token

**Provide to Claude:**
```
GITHUB_TOKEN=ghp_...
GITHUB_REPO=your-username/brain-coach
```

---

### 2. Anthropic API Key

**You do:**
1. Go to https://console.anthropic.com/settings/keys
2. Create a new API key
3. Copy the key

**Provide to Claude:**
```
ANTHROPIC_API_KEY=sk-ant-...
```

---

### 3. Slack App Setup

**You do:**

#### Step 3a: Create the App from Manifest
1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From an app manifest"
3. Select your workspace
4. Choose "YAML" tab
5. Paste the contents of `slack-app-manifest.yaml` from this repo
6. Click "Next", review, then "Create"

> **Note:** The manifest has placeholder URLs for slash commands and events.
> We'll update these after the Cloudflare Worker is deployed.

#### Step 3b: Install to Workspace
1. In left sidebar: "Install App"
2. Click "Install to Workspace"
3. Authorize the permissions
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

#### Step 3c: (Later) Update URLs after Worker is deployed
Once Claude deploys the Worker, you'll update:
1. Event Subscriptions → Request URL: `https://{worker}.workers.dev/events`
2. Each slash command URL: `https://{worker}.workers.dev/commands`
3. Interactivity Request URL: `https://{worker}.workers.dev/interactive`

#### Step 3e: Get Signing Secret
1. In left sidebar: "Basic Information"
2. Scroll to "App Credentials"
3. Copy the **Signing Secret**

#### Step 3f: Create Channels
1. In Slack, create three private channels:
   - `#sb-inbox`
   - `#sb-weekly`
   - `#sb-monthly`
2. Invite your bot to each channel: `/invite @Second Brain`
3. For each channel: right-click → "View channel details" → scroll to bottom → copy **Channel ID**

#### Step 3g: Get Your User ID
1. Click your profile picture in Slack
2. Click "Profile"
3. Click the three dots (⋮) → "Copy member ID"

**Provide to Claude:**
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_INBOX_CHANNEL_ID=C...
SLACK_WEEKLY_CHANNEL_ID=C...
SLACK_MONTHLY_CHANNEL_ID=C...
SLACK_USER_ID=U...
```

---

### 4. Cloudflare Account

**You do:**
1. Go to https://dash.cloudflare.com/sign-up (free)
2. Create an account
3. Go to "Workers & Pages" in the sidebar
4. Note: Claude will help deploy the Worker

**For deployment, you'll need:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create a token with "Edit Cloudflare Workers" permission
3. Copy the token

**Provide to Claude:**
```
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...  (found in Workers & Pages sidebar)
```

---

### 5. Google Calendar API (Optional for Phase 1)

**You do:**
1. Go to https://console.cloud.google.com/
2. Create a new project (or use existing)
3. Enable "Google Calendar API"
4. Create credentials → OAuth 2.0 Client ID
5. Download the JSON credentials file

**Provide to Claude:**
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_ID=primary (or specific calendar ID)
```

*Note: This can be added later. Core system works without calendar.*

---

## Phase 2: Provide Credentials

Once you have everything, copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

Then tell Claude: "I've filled in .env with all credentials"

---

## Phase 3: What Claude Will Do

Once you've provided credentials, Claude will:

1. **Write the Cloudflare Worker** (`src/worker/`)
   - Slack event receiver
   - Signature verification
   - GitHub Action trigger

2. **Deploy the Worker to Cloudflare**
   - Using your API token
   - Provide you the URL for Slack config

3. **Write all GitHub Actions** (`.github/workflows/`)
   - `capture.yml` — process captures
   - `chat.yml` — handle conversations
   - `slash-command.yml` — handle commands
   - `daily-digest.yml` — 6:30 AM digest
   - `weekly-reminder.yml` — Sunday 10 AM
   - `monthly-reminder.yml` — First Sunday 10 AM
   - `project-channel.yml` — create project channels

4. **Push to GitHub** and test

---

## Phase 4: Final Slack Configuration

After Claude deploys the Worker:

1. **Set Event Subscription URL**
   - Go to api.slack.com/apps → your app → Event Subscriptions
   - Request URL: `https://your-worker.workers.dev/events`
   - Slack will verify it

2. **Register Slash Commands**
   - Go to Slash Commands
   - Create each command pointing to `https://your-worker.workers.dev/commands`:

| Command | Request URL | Description |
|---------|-------------|-------------|
| `/capture` | `{WORKER_URL}/commands` | Quick capture |
| `/what-matters` | `{WORKER_URL}/commands` | Today's priorities |
| `/ritual` | `{WORKER_URL}/commands` | Start a review |
| `/project` | `{WORKER_URL}/commands` | Project management |

---

## Quick Reference: What You're Collecting

| Item | Where to Get It | Format |
|------|-----------------|--------|
| GitHub Token | github.com/settings/tokens | `ghp_xxxx` |
| GitHub Repo | Your repo | `username/brain-coach` |
| Anthropic Key | console.anthropic.com | `sk-ant-xxxx` |
| Slack Bot Token | api.slack.com/apps → OAuth | `xoxb-xxxx` |
| Slack Signing Secret | api.slack.com/apps → Basic Info | 32-char hex |
| Channel IDs (x3) | Slack channel details | `C0123456789` |
| Your Slack User ID | Slack profile | `U0123456789` |
| Cloudflare API Token | dash.cloudflare.com/profile/api-tokens | string |
| Cloudflare Account ID | Workers dashboard sidebar | 32-char hex |

---

## Estimated Time

| Task | Time |
|------|------|
| GitHub setup | 5 min |
| Anthropic key | 2 min |
| Slack app setup | 15-20 min |
| Cloudflare account | 5 min |
| **Total (you)** | ~30 min |
| Claude: write + deploy code | (handled for you) |

After that, you'll just need to:
- Set the Event Subscription URL in Slack
- Register the slash commands
- Test it out!
