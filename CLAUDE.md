# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prime Directives

These are non-negotiable. They override everything else. Violating any of these is a system failure.

### 1. All user data MUST persist to git

The git repo is the user's first-party storage. If data was created, classified, updated, or generated during a workflow and it has lasting value, it MUST be committed and pushed. This includes: captures, entity files, journal entries, conversation logs, planning documents, ritual outputs, and any file in `data/`.

**What does NOT need to persist:** ephemeral Slack responses (confirmations, derived summaries the user didn't ask to save), intermediate processing artifacts.

**The test:** If the user's Slack workspace disappeared tomorrow, would they lose information they care about? If yes, it must be in git.

After any workflow that creates or modifies files in `data/`, you MUST `git add`, `git commit`, and `git push`. Do not rely on some other step to do this. Do not finish a task without verifying the data landed in git.

### 2. Tests are the source of truth — BDD drives everything

**Philosophy**: System tests (`npm run test:system`) are the primary proof that behavioral contracts hold. They use real Worker + DOs + GitHub but stub Claude/Tavily for deterministic results. E2E tests (`npm run test:e2e`) prove production wiring with real APIs but are non-deterministic smoke tests. Unit tests verify component logic in isolation. An LLM cannot know its changes work without running the tests that exercise the real system.

**The workflow is red-green-refactor, one test at a time:**

1. **Write or identify ONE test** that describes the behavior you're adding or changing. For behavioral contracts, write a system test in `src/tests/system/`. For internal logic, write a unit test. For wiring verification, write an E2E test.
2. **Run THAT ONE test** to see it fail (red):
   ```bash
   npm run test:system -- --testPathPattern='test-name' -t 'test description'
   ```
   Use `--testPathPattern` to target the file and `-t` to target a specific test name. Never run the whole suite just to check one thing.
3. **Write/fix the code** to make that test pass.
4. **Run THAT ONE test again** to see it pass (green). If it fails, fix the code. Do not move on until it's green.
5. **Repeat steps 1–4** for each behavior. One test at a time. Fail fast, fix fast.
6. **After all individual tests pass — only then run the full suite** as a final regression check:
   ```bash
   yamllint .github/workflows/*.yml && node --check src/scripts/*.js && npm run test:all
   ```
   This catches unintended side effects. Once green, commit and push per Prime Directive #5 before starting the next unit of work.

**Why this order matters:** Tests hit real APIs and have real timeouts. Running the entire suite after every change wastes minutes and tokens waiting for unrelated tests to time out. Running one targeted test takes seconds and gives immediate signal.

**Explicitly banned behaviors (these are system failures):**

- Declaring a task "done" without running tests
- Running only `npm test` (unit tests) and skipping system/E2E tests for behavioral changes
- Running the full test suite as your development loop instead of targeting individual tests
- Making all your changes first, then running tests at the end as a batch — this is waterfall, not BDD
- Updating test expectations to make them pass without verifying the system actually behaves correctly
- Making large changes across multiple files without running tests between logical milestones
- Writing tests and not running them
- Saying "the tests should pass" or "this should work" instead of actually running them and showing the output

**The test:** If you haven't seen green test output in your terminal during this session, you haven't verified your work. If you ran the full suite but never ran a single targeted test, you skipped the development loop.

### 3. SYSTEM.md is the living spec — keep it accurate

`SYSTEM.md` is the authoritative behavioral specification for this system. E2E tests are written against it. If SYSTEM.md is wrong, the tests are testing the wrong thing, and the whole BDD loop breaks down.

**Any plan that changes system behavior MUST include updating SYSTEM.md.** This is not a "nice to have" documentation step at the end — it's part of the design phase. Before writing code, describe the intended behavior in SYSTEM.md. The spec change drives the test change, which drives the code change.

**What belongs in SYSTEM.md:**
- Philosophy and guiding principles
- Feature behaviors (what the system does from the user's perspective)
- Architecture and data flow (how components connect)
- Data contracts (what gets written where, and when)
- Known gaps between spec and implementation (`## Implementation Gaps`)

**What does NOT belong in SYSTEM.md:**
- Implementation details (function names, variable names, internal code structure)
- Temporary workarounds or debugging notes

**When to update:**
- Adding a new feature → add its behavioral description
- Changing existing behavior → update the relevant section
- Closing a gap → remove it from the GAP Summary
- Discovering a new gap → add it to the GAP Summary
- Architecture changes → update the Architecture section

**The test:** If someone read only SYSTEM.md, would they have an accurate understanding of what this system does and how it behaves? If not, SYSTEM.md needs updating.

### 4. Never ask the user to do something you can do

The user has executive function challenges. Every "go do this manually" is a context switch that breaks flow. You have full API access to Slack, Cloudflare, GitHub, and all credentials in `.env` / `.env.e2e`. Before asking the user to do anything, exhaust every option: API calls, scripts, CLI tools. Only escalate to the user for things that genuinely require a browser with no API alternative (OAuth flows, Slack app config UI), and when you do, be specific about exactly what to click.

### 5. Commit, push, deploy, THEN test — pushing is deploying

This system has two deployment targets: the **Cloudflare Worker** (deployed via `wrangler deploy`) and **GitHub Actions** (deployed by pushing to `main`). You cannot claim you've tested something if the code isn't deployed to both. Pushing to `main` isn't just version control — it IS the deployment mechanism for workflows.

**The deploy-test cycle for every unit of work:**
1. Write code and tests
2. `git commit` and `git push` (this deploys GitHub Actions)
3. `wrangler deploy` both workers (this deploys Worker code)
4. Run tests against the deployed system
5. If tests fail, fix and repeat from step 1

**Why this order matters:** If you deploy the Worker but don't push, the GitHub Actions (cron jobs, rebuild-on-push, decompose-on-push) are running stale code. If you push but don't deploy the Worker, the DO behavior doesn't match. Both must be in sync before testing means anything.

**Do this after every workstream or feature, not at the end.** Each unit of work that reaches green gets committed, pushed, deployed, and verified before starting the next one. In the future this should target a lower environment branch, but for now `main` is the deploy target for both.

**Explicitly banned behaviors (these are system failures):**
- Running `wrangler deploy` without first committing and pushing the code being deployed
- Claiming a workstream is "complete" when GitHub Actions changes haven't been pushed
- Accumulating changes across multiple workstreams without committing between them
- Testing Worker behavior while GitHub Actions are out of sync with local code
- Saying "I'll commit at the end" — there is no guaranteed "end"

**The test:** Does `git status` show uncommitted changes? Does `git log origin/main..HEAD` show unpushed commits? If either is yes, you haven't deployed and your tests aren't proving what you think they're proving.

---

## Project Overview

A personal "Second Brain" system designed around **salience** — helping surface what matters next, not cataloging everything. Built for a software engineer with executive function challenges.

**Guiding principle**: Salience is what makes "this, now" emerge from "everything, always." The system succeeds only if it reliably helps determine what to do next.

**Behavioral spec**: `SYSTEM.md` is the authoritative specification for how the system behaves. If code contradicts SYSTEM.md, the code is wrong. See also `meta/meta-learnings.md` for the cognitive processing protocol.

## Architecture

- **Slack** - Primary UI layer (capture, chat, commands, rituals)
- **Cloudflare Worker + Durable Objects** - Receives Slack events, orchestrates processing
- **Claude API** - Cognitive sorting, conversation, research synthesis, ritual facilitation
- **Git repo** - Source of truth for all data (no Notion)
- **Tavily API** - Web search for research pipeline
- **Google Calendar** - (future) Time-based UI layer, not yet integrated. Calendar data is owned in `calendar-current.md`.

Core loop:
1. Slack message → Cloudflare Worker → Durable Objects → GitHub (persistence) → Slack (response)
2. **Inbox processing**: Free-text in `#sb-inbox` → LLM determines depth → cognitive sorting → write to repo → reply to Slack
3. **Project channels**: Messages in `#proj-*` → project-context processing → spread updates → reply to Slack
4. **Commands**: `/what-matters`, `/ritual`, `/project` via DOs
5. **Scheduled**: Daily digest (7:30am), weekly/monthly ritual reminders (Sundays 9am) via cron triggers

## Repository Structure

```
data/                    # DATA LAYER - canonical life archive
├── current.md           # Context pack (system's working memory)
├── .decompose/          # Decompose completion markers
├── stream/              # Daily capture logs (YYYY-MM-DD.md)
├── identity/            # Mission, values, roles, goals (stable, user-maintained)
├── planning/            # Calendar, weekly/monthly plans
│   ├── calendar-current.md
│   ├── calendar-past.md
│   ├── weekly/
│   └── monthly/
├── projects/            # Per-project directories
│   ├── index.md         # Summary table of all projects
│   └── {slug}/          # Each project
│       ├── spread.md    # Working document (status, next actions, context)
│       └── logs/        # Research logs, chat transcripts
└── system/
    └── learned.md       # People, places, patterns

src/                     # CODE LAYER - prompts and automation
├── prompts/             # System prompts for LLM calls
├── scripts/             # rebuild-context.js, sync utilities
├── worker/              # Cloudflare Worker + Durable Objects
└── tests/               # Unit tests, E2E tests, fixtures
```

## Key Concepts

**Salience over completeness**: The system filters and prioritizes, not archives. Dropping items is healthy. Backlog is not moral debt.

**Basket Sort Practice**: Somatic-first prioritization. Ask: (1) "Do I feel pulled, pushed, or ambivalent?" then (2) "If I don't do this, does anything important break?" Default to dropping ambivalent items.

**Task vs Project**: A task is one concrete action. Anything requiring multiple steps is a project, no matter how simple it seems.

**Time horizons**: Long-term (yearly) → Medium (quarterly) → Short (weekly/daily). Identity layer informs all classification.

## Slack Interface

### Channels
| Channel | Purpose |
|---------|---------|
| `#sb-inbox` | Daily driver — freeform capture, chat, commands, daily digest |
| `#sb-weekly` | Weekly review ritual (Sundays 9am) |
| `#sb-monthly` | Monthly review ritual (first Sunday 9am) |
| `#proj-{name}` | Per-project workspace (auto-created) |

### Slash Commands
- `/what-matters` — get today's prioritized task list
- `/ritual <weekly|monthly>` — kick off a review ritual
- `/project <new|status|timeline|description|log|list|archive>` — project management


### Inbox Behavior
The bot in `#sb-inbox` accepts any free-text input and uses LLM judgment to determine what to do:
- **Brain dumps**: cognitive sorting → tasks, projects, calendar events, plans
- **Questions**: answer from context (read-only)
- **Conversation / thinking-out-loud**: engage conversationally
- **Mixed input**: all of the above as appropriate

The LLM determines processing depth — a one-liner gets quick handling, a brain dump gets the full cognitive processing protocol (see `meta/meta-learnings.md`).

## Working on This Project

- Environment variables in `.env` (copy from `.env.example`)
- Prompts are version-controlled in `src/prompts/`
- Data layer must remain usable even if code layer is replaced
- All LLM observations should be non-judgmental and defer to user's current judgment

## API Access Reference (supports Prime Directive #4)

- **Slack API**: Bot tokens in `.env` and `.env.e2e`. Use `curl` or `node` to call any Slack API method.
- **Cloudflare API**: `CLOUDFLARE_API_TOKEN` in `.env`. Use `wrangler` CLI.
- **GitHub API**: `GITHUB_TOKEN` in `.env`. Use `gh` CLI.

### Test & production environments
- **Production Slack workspace**: Tokens in `.env`
- **Test Slack workspace**: Tokens in `.env.e2e`
- **Production worker**: `second-brain` (wrangler.toml at `src/worker/wrangler.toml`)
- **Test worker**: `second-brain-test` (wrangler.test.toml at `src/worker/wrangler.test.toml`)
- Deploy test worker: `cd src/worker && CLOUDFLARE_API_TOKEN=... npx wrangler deploy --config wrangler.test.toml`
- Deploy prod worker: `cd src/worker && CLOUDFLARE_API_TOKEN=... npx wrangler deploy --config wrangler.toml`

## REQUIRED: YAML Linting

**Before committing any changes to `.github/workflows/*.yml` files, you MUST run:**

```bash
yamllint .github/workflows/*.yml
```

Only commit and push if linting passes. If there are errors, fix them first.

### Common YAML Issues in GitHub Actions

1. **Heredocs with special characters**: Don't use heredocs that contain `---` (YAML document separator) or lines starting with `-` at column 0. Use echo statements instead:
   ```bash
   # BAD - causes YAML parsing errors
   cat > file << EOF
   ---
   key: value
   - item
   EOF

   # GOOD - use echo statements
   {
     echo "---"
     echo "key: value"
     echo "- item"
   } > file
   ```

2. **Special characters in strings**: Use proper quoting or escape sequences.

3. **Indentation**: All content in `run: |` blocks must maintain consistent indentation.

## Verification Details (supports Prime Directive #2)

Individual checks in the verification command:

1. **YAML Linting**: `yamllint .github/workflows/*.yml`
2. **JavaScript syntax**: `node --check src/scripts/*.js`
3. **Full test suite**: `npm run test:all` — runs unit + system + E2E tests. This is the real verification.
4. **Minimum viable check** (only acceptable for pure-refactor with zero behavior change): `npm test` (unit only). If in doubt, run `test:all`.
5. **Local workflow testing** (recommended for workflow changes):
   ```bash
   DOCKER_HOST=unix:///Users/calford/.colima/default/docker.sock \
     act workflow_dispatch -j process-message \
     --secret-file .env.test \
     -e src/tests/fixtures/events/message-event.json
   ```

## After Modifying the Worker

If you modify any file under `src/worker/`, deploy BOTH workers AND commit the code:

```bash
cd src/worker
CLOUDFLARE_API_TOKEN=4qEVzAJjUNZFKd6YyDa6--9WTE4Y-UMqh7OCZdOJ npx wrangler deploy --config wrangler.toml
CLOUDFLARE_API_TOKEN=4qEVzAJjUNZFKd6YyDa6--9WTE4Y-UMqh7OCZdOJ npx wrangler deploy --config wrangler.test.toml
```

**CRITICAL:** Never deploy without also committing and pushing the code you deployed. A deployed worker with uncommitted source code means the repo doesn't match production — and if the session ends, the source is lost.

## Local Workflow Testing

To test GitHub Actions workflows locally before pushing, use `act`:

```bash
# Install Docker runtime (macOS with Colima)
brew install docker colima
colima start --cpu 2 --memory 4 --disk 20

# Install act
brew install act

# Run a specific workflow with test secrets
DOCKER_HOST=unix://$HOME/.colima/default/docker.sock \
  act workflow_dispatch -j process-message \
  --secret-file .env.test \
  -e src/tests/fixtures/events/message-event.json

# Or run the slash-command workflow
DOCKER_HOST=unix://$HOME/.colima/default/docker.sock \
  act workflow_dispatch -j handle-command \
  --secret-file .env.test \
  -e src/tests/fixtures/events/command-event.json
```

**Requirements:**
- Docker runtime (Colima recommended for macOS)
- `.env.test` contains mock secrets for testing (do not commit real secrets)
- Event JSON files in `src/tests/fixtures/events/` provide workflow_dispatch inputs

**Expected behavior with test credentials:**
- Workflows will run through setup, checkout, npm install successfully
- API calls will fail with auth errors (401/invalid_auth) - this is expected
- This validates the workflow YAML and Node.js code runs correctly

**Note:** `npm test` (unit only) covers internal logic but does NOT verify the system works end-to-end. Always prefer `npm run test:all` or `npm run test:e2e`. Docker is only needed for local workflow testing with `act`, not for E2E tests.

## Test Tiers

Three tiers — see SYSTEM.md "Testing Architecture" for the full spec.

**Test scripts:**
- `npm test` — Unit tests only (mocked, fast) — `src/tests/unit/`
- `npm run test:system` — System tests (real Worker+DOs+GitHub, stubbed LLM) — `src/tests/system/`. Primary behavioral gate.
- `npm run test:e2e` — E2E smoke tests (all real APIs) — `src/tests/e2e/`. Proves wiring, not correctness.
- `npm run test:all` — All tiers. **This is the default you should run.**

**System tests** are where most new behavioral tests should go. They're deterministic (stubbed Claude/Tavily), exercise real DOs and real GitHub, and test slash commands via signed request replay. When implementing a spec feature, write the system test first.

**E2E tests** use real Claude/Tavily and real Slack messages. They're non-deterministic and slow. Use them for smoke testing end-to-end wiring, not for proving behavioral contracts.

**Important:** All tests use the TEST environment (test Slack workspace, `second-brain-test` worker, `colinalford/brain-coach-test` repo). Never production.

See `SETUP_TEST.md` for credential setup.
