# SYSTEM.md — Behavioral Specification

This document is the authoritative specification for how the Second Brain system behaves. It describes the intended behavior of every feature, the data contracts for every write, and the persistence guarantees the system must uphold.

**If code contradicts this document, the code is wrong.**

BDD tests are written against this spec. When a test fails because the code doesn't match, the code gets fixed — not the spec or the test.

**Companion document**: `meta/meta-learnings.md` contains the cognitive processing protocol — the LLM's playbook for how to process complex input (brain dumps, planning sessions, multi-topic captures). This spec describes *what* the system does; that document describes *how the LLM thinks* about input.

---

## Architecture

```
User (Slack) → Cloudflare Worker → Durable Objects → GitHub (persistence) → Slack (response)
```

- **Slack** is the only user interface. All interaction happens through channels and slash commands.
- **Cloudflare Worker** receives all Slack events and commands, verifies signatures, routes to Durable Objects.
- **Durable Objects (DOs)** hold the system's in-memory state (context pack, project spreads, ritual sessions) and orchestrate all processing.
- **GitHub repo** is the canonical persistence layer. Every write goes to git. If Slack disappeared, no data is lost.
- **Claude API** provides classification, cognitive sorting, conversation, research synthesis, and ritual facilitation.
- **Tavily API** provides web search for the research pipeline.
- **Google Calendar** (future) — planned as a time-based UI layer with bidirectional sync. Not yet integrated. Calendar data is owned in `data/planning/calendar-current.md` so it can be synced to any calendar provider later.

### Durable Objects

| DO | Addressing | Purpose |
|----|-----------|---------|
| BrainDO | Singleton (`brain`) | Routes all messages, handles inbox, slash commands, coordinates other DOs |
| ProjectDO | Per-project (`project-{slug}`) | Manages a single project's spread, handles project channel messages, research |
| RitualDO | Per-type (`ritual-weekly`, `ritual-monthly`) | Manages ritual sessions with multi-turn threaded conversation |

---

## Channel Architecture

Channel routing determines everything. The channel a message arrives in determines which handler processes it, which context is loaded, and where data is written.

### Routing Rules

`BrainDO.getChannelType()` determines channel type using two methods:
1. **By channel ID** — matches against `SLACK_INBOX_CHANNEL_ID`, `SLACK_WEEKLY_CHANNEL_ID`, `SLACK_MONTHLY_CHANNEL_ID` env vars
2. **By channel name pattern** (fallback) — `sb-inbox`, `proj-*`, `sb-weekly`, `sb-monthly`

| Channel | Type | Handler | Context |
|---------|------|---------|---------|
| `#sb-inbox` | INBOX | BrainDO → mainAgent | `current.md` (full context pack) |
| `#proj-{slug}` | PROJECT | BrainDO → ProjectDO → projectAgent | Project's `spread.md` + context pack |
| `#sb-weekly` | WEEKLY | BrainDO → RitualDO (weekly) | Identity (roles, goals) + open loops |
| `#sb-monthly` | MONTHLY | BrainDO → RitualDO (monthly) | Identity (roles, goals) + open loops |

Messages in unknown channels are rejected.

### Channel Conventions

- All bot responses are **threaded** — replies go to the thread of the original message, never as top-level channel messages.
- The bot adds a `:brain:` reaction to messages it processes in `#sb-inbox`.
- Project channels are named `proj-{slug}` where slug is the lowercased, hyphenated project name.

### Thread Conversations

Slack does NOT include previous thread messages in the event payload — it only sends the individual reply with a `thread_ts` pointer. When the DO receives a thread reply, it MUST fetch thread history via `conversations.replies` and pass it as context to the LLM so it can understand the conversation.

**How threads work**:
- User sends a top-level message → bot replies in a thread → user can continue in that thread
- Each reply in the thread is processed with thread history as context
- The LLM makes data updates on each reply as appropriate (same tool calls as top-level messages)
- Threads are essentially open loops — they start with a message and get resolved through the conversation

**Thread context limits**:
- Fetch up to the last 20 messages, always including the thread parent (first message)
- If total thread text exceeds 15,000 characters, summarize older messages into a compact thread summary and include only the last 10 messages verbatim
- The summary is ephemeral (passed to Claude, not persisted) to avoid accidental loss of detail

**What triggers thread replies**: The user replying to a bot thread. This is mostly for corrections ("actually, move the dentist to Wednesday"), follow-up instructions, or continued conversation (thinking-out-loud, planning).

**Slash commands and threads**: Slack slash commands are invoked from the composer UI, not "in" a thread. If Slack provides a `thread_ts` on a slash command invocation, ignore it — respond ephemerally to the invoker at channel level via `response_url`.

**Thread logging**: User replies in threads are always logged to the stream (same as top-level messages — Prime Directive #1). System responses in threads follow the same information-value criteria as top-level responses: log when the response contains new information or thinking; don't log simple acknowledgments or derived output.

**[GAP]**: `getThreadReplies()` exists in `slack-client.js` but is not called anywhere. Thread replies in `#sb-inbox` are processed without thread context.

---

## Context System

### `current.md` — The Context Pack

`data/current.md` is the system's working memory. It is assembled from source files and contains everything the DOs need to understand the user's current state.

**Sections (most volatile at top, most stable at bottom):**

| Section | Source | Inline? |
|---------|--------|---------|
| Pending Review | Managed inline in current.md | Yes |
| Today's Stream | `data/stream/{date}.md` | No |
| Open Loops | Managed inline in current.md | Yes |
| This Week's Plan | `data/planning/weekly/{weekId}.md` | No |
| Upcoming Calendar | `data/planning/calendar-current.md` | No |
| Project Index | `data/projects/index.md` (filtered to active only during rebuild) | No |
| This Month's Plan | `data/planning/monthly/{month}.md` | No |
| Learned Context | `data/system/learned.md` | No |
| Identity | `data/identity/*.md` (combined) | No |

"Inline" sections (Pending Review, Open Loops) are preserved during rebuild — they are written directly to current.md by the DOs and not sourced from separate files.

### Bidirectional Sync

current.md flows in two directions:

**Build (source files → current.md → DO)**: When source files change (stream, calendar, spreads, etc.), `rebuild-context.js` rebuilds current.md from them. The rebuilt current.md is pushed to GitHub. DOs detect the SHA change and reload it into memory.

**Decompose (DO → current.md → source files)**: The DO holds current.md in memory. The LLM has tool calls that edit current.md sections directly in DO memory. When the LLM is done processing a message, the DO pushes the updated current.md to GitHub. A GitHub Action detects the current.md change and decomposes it — diffing sections against their source files and writing changes back to the appropriate locations (stream files, calendar, learned context, etc.).

**The data flow for a typical inbox message**:
1. Message arrives at DO
2. DO passes current.md (from memory) as context to the LLM
3. LLM returns tool calls that edit current.md sections (add to stream, add to Open Loops, add calendar event, etc.)
4. DO applies edits to current.md in memory — the DO's state is immediately up to date
5. DO commits updated current.md to GitHub (atomic commit via Git Data API)
6. DO responds to Slack — the commit is the durability point
7. GitHub Action decomposes current.md into source files (eventual, after reply)

**Why this matters**: The DO never needs to make multiple individual GitHub API calls to write to stream, calendar, open loops, and learned context separately. It makes one write (current.md) and GitHub handles the fan-out. The DO's in-memory state is already current, so the next request sees the changes immediately without waiting for the decompose round-trip.

**When to use decompose vs direct writes**:
- **Decompose (edit current.md)**: Anything that has a section in current.md — stream entries, Open Loops, Pending Review, calendar entries, learned context, project index updates
- **Direct writes (separate GitHub API calls)**: Things that don't live in current.md — creating project directories/spreads/logs, writing research log files, creating weekly/monthly plan files during rituals

Both paths end in the same place: source files and current.md are in sync.

**[GAP]**: The decompose direction is not implemented. The GitHub Action to decompose current.md into source files does not exist yet. Currently all writes go through direct GitHub API calls from the DOs.

### LLM Tool Calls

The LLM interacts with the system through structured tool calls returned in its response. These operate on current.md as held in memory by the DO.

**Section editing tools** (decompose path — edit current.md in memory):

| Tool | Description | Example |
|------|-------------|---------|
| `append_to_section` | Append content under a section heading | Add a stream entry under `## Today's Stream` |
| `prepend_to_section` | Prepend content at the start of a section | Add an urgent item to top of Open Loops |
| `replace_section` | Replace entire section content | Rewrite Open Loops after basket sort |
| `mark_complete` | Change `- [ ]` to `- [x]` for a matching item | Complete a task in Open Loops |
| `remove_item` | Delete a specific line/item from a section | Remove a parked item from Open Loops |

**Inline sections** (Open Loops, Pending Review) are managed directly in current.md — they have no separate source file. Edits to these sections persist through the decompose path (they stay in current.md) and survive rebuilds (rebuild preserves inline sections).

**Direct write tools** (for things outside current.md):

| Tool | Description | Files affected |
|------|-------------|----------------|
| `create_project` | Create full project structure | `projects/{slug}/spread.md`, `projects/{slug}/logs/`, `projects/index.md`, Slack channel |
| `update_spread` | Edit a project's spread.md | `projects/{slug}/spread.md`, `projects/index.md` (rebuilt) |
| `write_log` | Write a timestamped log file | `projects/{slug}/logs/{timestamp}-{type}.md` |
| `create_file` | Create a new file with content | Any path under `data/` |
| `trigger_research` | Kick off the research pipeline | Delegated to research agent |

A single LLM response can return multiple tool calls — e.g., a brain dump might produce section edits to current.md (stream, open loops, calendar) AND direct writes (create two new projects). The DO executes both: applies current.md edits in memory and pushes, then makes direct writes for the rest.

**[GAP]**: The LLM tool calls are partially defined in code (`src/worker/agents/types.js`) but the current capture prompt (`src/prompts/capture-system.md`) still instructs the LLM to write to individual source files rather than editing current.md sections. The prompt needs to be rewritten to match this architecture.

### Context Pack Rebuild Contract

current.md must stay in sync with source files. The full rules are in "Keeping current.md in sync" under Data Persistence Contracts. In summary:
- After any commit that changes source files **without also updating current.md**, a rebuild must run.
- A write to current.md triggers **decompose**, not rebuild.
- If BrainDO commits source files and current.md together (the normal coordinator path), no rebuild is needed.

Rebuild is performed by `src/scripts/rebuild-context.js` which reads all source files and assembles current.md while preserving inline sections.

### DO Context Caching

The DO holds current.md in memory. This is both a cache and the live working copy.

**On LLM tool calls**: The DO applies edits directly to its in-memory current.md. No cache invalidation needed — the DO's state IS the latest state.

**On external changes** (source files changed by GitHub Actions, rituals, etc.): The DO checks the GitHub file's SHA against its cached version. If the SHA has changed (meaning a rebuild happened), the DO reloads current.md from GitHub.

**Contract**: After a DO makes direct file writes (project creation, log files, etc.), the source files have changed but current.md hasn't been rebuilt yet. The DO must either trigger a rebuild or reload current.md after the rebuild completes.

---

## Inbox Processing

The inbox (`#sb-inbox`) is the primary interface. The user sends free-text messages — anything from a quick one-liner ("dentist at 3pm") to a full stream-of-consciousness brain dump mixing tasks, feelings, plans, and anxieties. The system accepts it raw and does all the cognitive sorting.

There is no explicit capture command. There is no rigid intent taxonomy. The LLM reads the message and uses judgment to determine what it is and how deep to go.

**Reference**: The cognitive processing protocol is defined in `meta/meta-learnings.md`. That document is the LLM's playbook for how to think about complex input.

### Intent Model

The LLM reads the message and determines what to do. This is not a fixed classification tree — it's judgment:

- **If it's a question** — answer it from context (read-only)
- **If it's conversational / thinking-out-loud** — engage conversationally (response is logged to stream)
- **If it contains information, tasks, plans, events, or brain dump material** — process it through cognitive sorting (writes to multiple locations)
- **If it's a mix** — do all of the above as appropriate

### Processing Depth (LLM-Determined)

The LLM determines how deep to go based on the complexity of the input. There is no fixed pipeline that runs on every message.

**Quick input** (one-liners, simple statements): Identify the type (task, event, note, project mention), write to appropriate locations, confirm briefly.

**Complex input** (brain dumps, journal entries, planning discussions): Run the full cognitive processing protocol:

1. **Identify themes and projects** — group related items into clusters
2. **Task vs Project analysis** — pressure-test everything with the "secret projects test": *Can I literally just do this right now with no preparation?* If not, it's a project. (See `meta/meta-learnings.md` for the full decomposition framework.)
3. **Temporal planning** — find deadlines, work backwards, identify dependencies, factor in lead times and buffer
4. **Calendar events** — extract dates and time windows
5. **The plan** — projects with next actions, prioritized tasks, what to drop/defer

This protocol is NOT a rigid 5-step pipeline. It's the LLM's playbook. A simple "dentist Saturday 3pm" only needs step 4. A full brain dump needs all five passes.

### Stream Logging (Prime Directive #1)

Every user message goes to the stream, always.

System responses go to the stream **only when they contain new information or thinking that would be lost if not persisted**.

**Log system responses when:**
- The system is in a conversation thread (chat, planning, thinking-out-loud)
- The system processes a brain dump and produces a sorted plan
- The system is in a ritual exchange
- The system generates analysis, synthesis, or new insight

**Don't log system responses when:**
- It's derived/computed output from existing data (`/what-matters` — that's just a view, the source data is already persisted)
- It's a simple acknowledgment or confirmation
- It's an ephemeral slash command response

**The test**: Does this response contain new information or thinking that would be lost if not persisted? If yes, log it. If it's just surfacing existing data, don't.

### Side Effects

What gets written depends on what the LLM identifies in the input:

| What the LLM identifies | Action | Files |
|--------------------------|--------|-------|
| Any user input | Log to stream | `data/stream/{date}.md` |
| System response with new info | Log to stream | `data/stream/{date}.md` |
| An actionable task | Add to Open Loops | `data/current.md` (inline) |
| A calendar event or deadline | Add to calendar | `data/planning/calendar-current.md` |
| A new project | Create project (dir + spread + logs/ + index + channel) | `data/projects/{slug}/spread.md`, `data/projects/index.md` |
| An existing project update | Update project spread → rebuild index | `data/projects/{slug}/spread.md`, `data/projects/index.md` |
| People/places/patterns | Add to learned context | `data/system/learned.md` |
| Items to drop/defer | Explicitly note as parked | Stream entry notes parking |

**After all writes**: If any spread was updated, rebuild project index. Then rebuild `current.md`.

### Pending Review Lifecycle

When the LLM is unsure about something (ambiguous reference, unclear timing, unknown person), it adds the item to the Pending Review section of current.md AND asks the user for clarification immediately in the Slack reply.

**Resolution path**:
1. **Immediate**: The Slack reply asks the clarifying question. If the user responds in the thread, the system resolves it and moves the item to the appropriate location (Open Loops, calendar, learned context, etc.).
2. **If ignored**: Pending Review items surface in the daily digest (`/what-matters` output) every morning until resolved. They don't silently rot.
3. **During rituals**: The weekly review's OPEN_LOOPS phase should also surface any lingering Pending Review items.

Items leave Pending Review when they are either resolved (moved to the right place) or explicitly dropped by the user.

**[GAP]**: Daily digest does not currently surface Pending Review items.

### Slack Reply Behavior

The bot does NOT need to send affirmative-only replies ("Got it, captured!"). That's noise. The reply should add value:

- **For a brain dump**: the sorted plan, projects created, what was parked
- **For a question**: the answer
- **For a quick item**: a brief confirmation or just an emoji reaction — only if there's nothing more useful to say
- **For chat/conversation**: the actual conversational response

The reply itself is also logged to the stream (when it meets the logging criteria above).

---

## Basket Sort Practice

Basket Sort is the system's prioritization framework. It separates somatic signal (how does this feel in my body?) from cognitive analysis (does this actually matter?). It's used during rituals, overwhelm moments, and whenever the system helps the user prioritize.

**Reference**: Full documentation in `requirements.md`. The practice is inspired by KonMari's somatic sensing ("does this spark joy?") combined with the Eisenhower matrix's importance filter.

### The Two Questions

1. **Somatic**: "As I notice this item, do I feel *pulled* toward it, *pushed* away from it, or *ambivalent*?"
2. **Cognitive**: "If I don't do this, does anything important actually break?"

### The Matrix

| | Important | Not Important |
|---|-----------|---------------|
| **Pull** | Prioritize — important things I desire to do | Can indulge with no guilt, but don't prioritize over important things |
| **Push** | Must-do — things that align with my values even if I don't prefer them (paying taxes, attending a friend's recital) | Drop — doesn't matter, don't want to do it |
| **Ambivalent** | Keep if importance is clear and concrete — it will resurface with more clarity if it truly matters | Drop — no somatic signal, no importance signal, this is noise |

### Ambivalence

Ambivalence is the most important signal. It means the body isn't giving a clear pull or push. Possible reasons:
- Internalized "shoulds" from outside values (I feel like I *should* want this but don't)
- Suppressed desire (I feel like I *shouldn't* want this but do)
- Genuine indifference (this doesn't matter to me)

Since there's no somatic signal, only importance determines the outcome. The system's philosophy: if something really matters, it will resurface with more clarity or urgency. Default to dropping ambivalent items.

### When the System Suggests Basket Sort

The LLM should suggest Basket Sort when it detects overwhelm:
- Many unresolved items at once (>10 competing things mentioned)
- Language expressing overwhelm ("I have so much to do", "I'm drowning", "I don't know where to start")
- Same items appearing repeatedly without progress
- Vague anxiety or dread in the user's language

The suggestion is conversational, not robotic: *"There's a lot competing for attention right now. Would it help to do a Basket Sort — separating felt response from importance — before we prioritize?"*

### Where Basket Sort Is Used

- **Inbox processing**: When a brain dump has many items, the cognitive processing protocol's "The Plan" step (pass 5) should apply Basket Sort to determine what to prioritize, defer, and drop
- **Weekly ritual**: The OPEN_LOOPS phase explicitly runs Basket Sort on all open loops
- **Monthly ritual**: Same, at a higher time horizon
- **`/what-matters`**: If there are too many competing priorities, suggest Basket Sort in the output

---

## Project Lifecycle

### Automatic Project Creation (from Inbox Processing)

When the cognitive processing protocol identifies something as a project (using the "secret projects test" — can you literally do this right now with no preparation?), the system creates it automatically. No asking, no waiting. This is Prime Directive #4 in action.

The inbox processing pipeline creates projects as a side effect of cognitive sorting. If a brain dump contains "I need to get a BP monitor that auto-logs via bluetooth," the LLM recognizes this as a project (research options, purchase, set up, start logging) and creates it.

Auto-creation follows the same steps as explicit creation below.

### `/project new <name>` — Explicit Project Creation

The slash command is an alternative path for when the user wants to explicitly create a project. Both paths perform the same steps.

### Project Structure

Each project lives in `data/projects/{slug}/` with:

```
data/projects/{slug}/
├── spread.md        # All important project data (Bullet Journal-style spread)
└── logs/            # Timestamped markdown files for research and chat logs
    ├── 2026-01-19T14-30-research.md
    └── 2026-01-20T09-15-chat.md
```

**`spread.md`** is the project's working document — status, description, next actions, context, research summaries. Based on the Bullet Journal concept of project spreads. There is NO log section in spread.md — logs live in the `logs/` directory.

**`logs/`** stores timestamped markdown files for research back-and-forth, extended chat sessions, and any conversational history that would clutter the spread. File names are `{ISO-timestamp}-{type}.md` (e.g., `2026-01-19T14-30-research.md`).

**`data/projects/index.md`** is a summary table of all projects. It gets loaded into `current.md` so the system always knows what projects exist, their status, and next actions.

### Creating a Project

Creating a project MUST do all of the following:

1. **Create the project directory** at `data/projects/{slug}/`
2. **Create the project spread** at `data/projects/{slug}/spread.md` with template sections (Status, Description, Next Actions, Context, Research)
3. **Create the logs directory** at `data/projects/{slug}/logs/`
4. **Update the project index** at `data/projects/index.md` — add a row with the new project's name, status (active), summary, next action, and path
5. **Create the Slack channel** `#proj-{slug}` — the system has `slack-client.js` with `createChannel()` and MUST use it (Prime Directive #4: never ask the user to do something you can do)
6. **Invite both the bot AND the user** to the new channel
7. **Rebuild `current.md`** so the project appears in the Project Index section immediately
8. **Invalidate BrainDO's context cache** so subsequent requests see the new project

**Response**: Confirm project creation with the channel link.

**[GAP]**: Current code only does step 1-2 partially. Steps 3-8 are not implemented.

### Project Channel Chat

When a user sends a message in `#proj-{slug}`:

1. Message is routed to ProjectDO for that slug
2. ProjectDO loads the project's `spread.md` (from cache or GitHub)
3. The projectAgent processes the message in project context
4. For basic chat: Claude updates the spread directly (next actions, context, status changes)
5. For research or extended back-and-forth: conversation is written to `logs/{timestamp}-{type}.md`, and a summary/reference is added to the spread's Research section
6. The spread is committed to GitHub
7. Bot replies in the thread

**After ANY spread update**: Rebuild the project index from all project spreads, then rebuild `current.md`.

### `/project list`

Returns a list of active projects from the context pack. Read-only, no writes.

### `/project status <name>`

Returns the current spread content for a project. Read-only.

### `/project archive <name>`

Archives a project:
1. Update the project's spread status to "archived"
2. Rebuild project index (project stays in index with status "archived", but filtered out of current.md's active-only view)
3. Archive the Slack channel
4. Rebuild `current.md`

### Project Index Maintenance

`data/projects/index.md` is a markdown table of **all** projects (active and archived), with a Status column. It is rebuilt (regenerated from all project spreads) whenever ANY `spread.md` is updated. This is not selective — the entire index is rebuilt every time. This ensures it never goes stale.

**Index vs context pack**: The index file contains all projects. The Project Index section in current.md is a **filtered view** — only active projects are included. Archived projects stay discoverable in the index file but don't consume context window space. `rebuild-context.js` performs this filtering when embedding the index into current.md: it reads `data/projects/index.md`, selects rows where status=active, and writes only those rows into the Project Index section.

The project index is a source file for the context pack rebuild. If it's stale, current.md is stale, and the system gives wrong answers.

**Rebuild trigger**: Any write to any `data/projects/{slug}/spread.md` → rebuild index → rebuild `current.md`.

**[GAP]**: Current code does not rebuild the project index on any operation.

---

## Research Pipeline

Research is a 7-step automated pipeline that searches the web, synthesizes findings, and persists results. It can be triggered from a slash command or from chat in a project channel.

### Triggering Research

**From slash command**: `/project research <query>` — can be run from any channel. If run in a `#proj-*` channel, the project is detected from the channel name. If run elsewhere, the system tries to infer the project from the query and context.

**From project channel chat**: Messages containing research trigger words ("research", "look up", "find out", "search for") in a `#proj-*` channel trigger research via the projectAgent.

### Pipeline Steps

1. **PLAN** — Claude analyzes the query and generates 2-3 search angles, completeness criteria, and desired output format
2. **SEARCH** — Tavily runs all planned queries in parallel (advanced depth, 5 results each)
3. **EVALUATE** — Claude checks if findings satisfy completeness criteria
4. **FILL GAPS** — If incomplete, runs up to 3 additional queries, re-evaluates, possibly runs 2 more
5. **SYNTHESIZE** — Claude synthesizes all findings into a structured summary with key points, recommendations, and sources
6. **QUALITY CHECK** — Claude scores the synthesis 0.0-1.0. If below 0.7, re-synthesizes with feedback
7. **DELIVER + PERSIST** — Posts results to Slack thread, writes to GitHub

### Slack Threading

Research ALWAYS posts to a thread in the channel where it was triggered:

| Message | When | Content |
|---------|------|---------|
| Thread parent | Pipeline start | "Research: {query}" + project association if detected |
| Progress update | After planning | "Searching N angles..." |
| Gap filling | If needed | "Filling gaps: {missing items}" |
| Final result | After synthesis | Full formatted synthesis: summary, key findings, recommendations |
| Error | On failure | "Research failed: {error}" |

### Persistence

Research ALWAYS writes to these locations on completion:

| File | Content | When |
|------|---------|------|
| `data/stream/{date}.md` | `- HH:MM \| [research] {query}` under `## Captures` | Always |
| `data/projects/{slug}/logs/{timestamp}-research.md` | Full research log (query, search results, conversation, sources, synthesis) | Always (when project is associated) |
| `data/projects/{slug}/spread.md` | Brief summary + reference to log file, appended to `## Research` section | Always (when project is associated) |

The full research back-and-forth lives in the logs directory, not in spread.md. The spread gets a concise summary and pointer.

**After writes**: Rebuild project index, then rebuild `current.md`.

### Corrections and Follow-Up

If the user responds in the research thread with corrections or requests:
- The system processes the follow-up in the context of the existing research
- The conversation continues in the same log file
- The spread's research summary is updated if conclusions change

**[GAP]**: Current interactive research coordinator exists in code but is the older conversational flow. The new pipeline runs to completion automatically. Follow-up behavior needs to be unified.

---

## Ritual Flow

Rituals are structured review sessions that happen in dedicated channels as multi-turn threaded conversations.

### Weekly Ritual (`#sb-weekly`)

**Triggered by**: User posting in `#sb-weekly` or `/ritual weekly` command from within `#sb-weekly`.

**Channel requirement**: The `/ritual weekly` command MUST be run from `#sb-weekly`. If run from another channel, the system tells the user to go to the correct channel.

**Threading**: The entire ritual is a single thread. The first message becomes the thread parent, and all subsequent exchanges happen as replies in that thread.

**Phases** (in order):

1. **KICKOFF** — "How are you feeling heading into this review?" (somatic check-in)
2. **ROLES** — Presents user's roles from identity, asks which need focus
3. **GOALS** — Presents goals, asks about progress
4. **OPEN_LOOPS** — Basket Sort through open loops (pull/push/ambivalent)
5. **PLANNING** — Based on review, asks what would make the week successful
6. **FINALIZE** — Shows summary, asks user to say "commit" to save

**Phase navigation**:
- "skip", "next", "move on" → advance to next phase
- Claude can auto-advance when it determines the user is ready (`ready_to_advance: true`)
- Each phase includes context-specific prompts and the user's actual data

**On commit** (user says "commit" in FINALIZE phase):
1. Write weekly plan to `data/planning/weekly/{weekId}.md` (e.g., `2026-W05.md`)
2. Write conversation log to `data/planning/weekly/{weekId}-log.md`
3. Rebuild `current.md` (new weekly plan appears in "This Week's Plan" section)
4. Clean up ritual session state

### Monthly Ritual (`#sb-monthly`)

Same structure as weekly but:
- Triggered in `#sb-monthly`
- Longer time horizon — reviews the month, not the week
- Writes to `data/planning/monthly/{month}.md` (e.g., `2026-02.md`)
- Writes conversation log to `data/planning/monthly/{month}-log.md`
- Monthly plan appears in "This Month's Plan" section of current.md

### Ritual Contracts

- Rituals are ALWAYS threaded — every message in a ritual session is in the same thread
- Rituals write to the planning directory on commit — this is how plans get into the system
- The ritual coordinator uses the Basket Sort practice during the OPEN_LOOPS phase
- Ritual responses are non-judgmental, support-oriented, and defer to the user's current state (per requirements.md)

**[GAP]**: The `/ritual` slash command's `/start` route is not handled in RitualDO (returns 404). Rituals can only be started by posting a message in the ritual channel.

---

## `/what-matters`

Surfaces today's priorities. Read-only — no file writes.

**Data sources** (read from GitHub, NOT from DO cache — ensures the response reflects committed state). Resolve HEAD commit SHA once and read all files at that commit to avoid torn reads:
- `data/planning/calendar-current.md` — today's calendar events
- `data/stream/{date}.md` — today's captures so far
- `data/planning/weekly/{weekId}.md` — this week's plan
- Specific sections extracted from `data/current.md`: Open Loops, Pending Review, Project Index, Identity (mission + roles). The Project Index in current.md is already filtered to active-only by `rebuild-context.js`, so no additional filtering is needed here.

**Claude prompt**: Given today's date, day of week, and all the above data, identify:
1. Calendar events for TODAY (prominently)
2. 2-3 other priorities from open loops, weekly goals, and patterns

**Response**: Posted via response_url with `response_type: 'in_channel'` (visible to all).

---

## Scheduled Messages

### Daily Digest — 7:30am every day

Posts to `#sb-inbox` every morning at 7:30am. Same output as `/what-matters` — today's calendar events, 2-3 priorities from open loops and weekly goals. This is the user's "here's what matters today" nudge to start the day.

Read-only — no file writes.

**[GAP]**: Not implemented. Needs a cron-triggered GitHub Action (or Cloudflare Cron Trigger) that runs the `/what-matters` logic and posts to `#sb-inbox`.

### Weekly/Monthly Ritual Reminder — Sundays at 9am

Posts a reminder to the appropriate ritual channel every Sunday at 9am:

- **First Sunday of the month**: Post to `#sb-monthly` prompting the user to do their monthly review. No weekly reminder that week — the monthly review covers weekly concerns.
- **All other Sundays**: Post to `#sb-weekly` prompting the user to do their weekly review.

The message should be conversational, not robotic — something like "Good morning. Ready for your weekly review?" with a nudge to start the ritual by replying in the channel.

Read-only — no file writes. The ritual itself starts when the user responds.

**[GAP]**: Not implemented. Needs a cron-triggered job that checks if it's the first Sunday of the month and posts to the correct channel.

---

## Data Lifecycle and Housekeeping

### Philosophy

Life is a stream. Picking things up and dropping them should be easy. The system should never make the user feel guilty about unfinished items or stale data. current.md is the current context of the user's life — it should stay lean and relevant. Everything important is stored somewhere permanent (streams, project archives, plans), but current.md only holds what matters *right now*.

The user can type "clear my todo list" into the inbox and the system should do exactly that — clear Open Loops, note it in the stream, done. At the next weekly planning, only what the user says is relevant gets added back.

### Stream Files (`data/stream/{date}.md`)

Stream files are like Bullet Journal daily logs — chronological capture of what happened that day. They accumulate one per day and are never deleted. They are the permanent record.

**Daily digest cleanup**: When the daily digest runs each morning, anything important from yesterday's stream should already have been captured as a task (Open Loops), a project, or a calendar event during inbox processing. The stream file itself is the archive — it stays, but its contents don't need to remain in current.md's active sections.

Today's stream section in current.md shows only today's stream file. Yesterday's stream is history.

### Calendar (`data/planning/calendar-current.md` and `calendar-past.md`)

Calendar data splits into two files:

- **`calendar-current.md`** — holds all future events. This is what gets loaded into current.md and what the LLM sees for scheduling.
- **`calendar-past.md`** — a log of past events, moved from calendar-current.md after they pass. Kept for reference but not loaded into the context pack.

**Housekeeping job**: Runs as a Cloudflare Cron Trigger handled by BrainDO, daily at 7:00am (30 minutes before the daily digest). Moves past events from calendar-current.md to calendar-past.md. Produces one commit tagged `[housekeeping]`. This keeps the context pack lean — the LLM only sees upcoming events, not a growing backlog of things that already happened.

**Failure handling**: If the housekeeping job fails (GitHub API error, timeout, etc.), the daily digest at 7:30am still runs — it is not gated on housekeeping success. The digest includes a system health line when housekeeping failed (e.g., "Note: calendar cleanup didn't run this morning — past events may still appear"). The failed housekeeping is logged and retried on the next cron cycle.

**[GAP]**: calendar-past.md does not exist. No housekeeping cron trigger. calendar-current.md accumulates without cleanup.

### Open Loops (inline in `current.md`)

Open Loops is the active task list. It should stay short and current. Items leave Open Loops when:
- Completed (marked done in stream, removed from Open Loops)
- Dropped (noted as parked in stream, removed from Open Loops)
- Promoted to a project (project created, task removed from Open Loops, next action lives in project spread)
- Cleared by the user ("clear my todo list")

Weekly and monthly rituals are the natural pruning points — the user reviews what's there and decides what carries forward.

### Projects (`data/projects/`)

Active projects live in the index and the context pack. When a project is done or abandoned, it gets archived:
- Spread status → "archived"
- Stays in `projects/index.md` with status "archived" (the full index is the historical record)
- Filtered out of current.md's Project Index section (only active projects load into context)
- Slack channel archived
- Project directory stays in the repo for history — never deleted

### What gets loaded into current.md

Only current, relevant data. The context pack stays lean because:
- Stream: only today's file
- Calendar: only future events (calendar-current.md)
- Projects: only active projects in the index
- Plans: only current week and current month
- Open Loops / Pending Review: managed inline, pruned by rituals and user commands

If current.md feels bloated, the user can prune it directly ("clear my todo list", "archive project X", "drop everything that's not urgent"). The system is designed for this.

---

## Data Persistence Contracts

These contracts are non-negotiable. They are what makes the system trustworthy.

### Keeping current.md in sync

After any commit that changes source files **without also updating current.md**, a rebuild must run. This ensures the context pack is always fresh. A stale context pack means wrong answers, missed tasks, and broken salience.

**When rebuild is NOT needed**:
- A write to `current.md` itself triggers **decompose** (current.md → source files), not rebuild.
- If BrainDO commits both source files and current.md in the same atomic commit (the normal coordinator path), current.md is already up to date — no rebuild needed.

**When rebuild IS needed**:
- Direct source-file writes that don't also update current.md (e.g., a GitHub Action modifying a plan file, or manual edits to the repo).

**Workflow trigger contract**:
- If `data/current.md` changed in the push → run decompose → write `.done` marker → run rebuild.
- If only source files changed (not `data/current.md`) → run rebuild directly (no decompose needed).

**[GAP]**: Currently, rebuild happens via GitHub Actions workflow `rebuild-on-push.yml` which triggers on pushes to `data/**`. This introduces latency (seconds to minutes). The DOs should either rebuild locally or ensure the rebuild completes before serving the next request.

### Project index stays in sync

`data/projects/index.md` MUST reflect the current state of all projects. Any operation that changes a project's status, summary, or next action MUST update the index.

**[GAP]**: No code currently updates the project index. It's only manually maintained.

### All user data persists to git

Per Prime Directive #1: If data has lasting value, it MUST be committed and pushed. This includes:
- Stream entries (captures, research logs)
- Project spreads and logs
- Planning documents (weekly/monthly plans from rituals)
- Calendar updates
- Open loop changes
- Learned context

### File locations by feature

| Feature | Files written |
|---------|-------------|
| Inbox processing (all input) | `data/current.md` (in-memory edits to stream, Open Loops, calendar, learned context sections → decomposed to source files by GitHub Action), optionally: `data/projects/{slug}/spread.md`, `data/projects/index.md` (direct writes for project creation/updates) |
| `/project new` | `data/projects/{slug}/spread.md`, `data/projects/index.md` |
| Project channel chat | `data/projects/{slug}/spread.md`, optionally: `data/projects/{slug}/logs/{ts}-chat.md`, `data/projects/index.md` |
| Research | `data/stream/{date}.md`, `data/projects/{slug}/logs/{ts}-research.md`, `data/projects/{slug}/spread.md`, `data/projects/index.md` |
| Weekly ritual commit | `data/planning/weekly/{weekId}.md`, `data/planning/weekly/{weekId}-log.md` |
| Monthly ritual commit | `data/planning/monthly/{month}.md`, `data/planning/monthly/{month}-log.md` |
| `/what-matters` | None (read-only) |
| Question / chat (read-only) | None — but conversational responses are logged to stream |

---

## Implementation Contracts

These are the engineering rules that govern how the system actually executes. Without these, the behavioral spec above will fail in production due to concurrency, partial failures, and API reality.

### Concurrency and Write Ownership

**Single-writer principle**: Each file has exactly one owner that may write to it. This prevents concurrent writes from clobbering each other.

| File(s) | Owner | Notes |
|---------|-------|-------|
| `data/current.md` | BrainDO only | BrainDO is the sole writer. ProjectDO and RitualDO request changes via BrainDO, never write current.md directly. |
| `data/projects/{slug}/spread.md` | ProjectDO for that slug (content); BrainDO (commit) | ProjectDO decides what to write, returns write intents to BrainDO for atomic commit. |
| `data/projects/{slug}/logs/*` | ProjectDO for that slug (content); BrainDO (commit) | Same pattern as spread. |
| `data/projects/index.md` | BrainDO only | Rebuilt by BrainDO after any spread change is reported by a ProjectDO. |
| `data/stream/{date}.md` | BrainDO only | Written via decompose (from current.md) or directly by BrainDO. |
| `data/planning/calendar-*.md` | BrainDO only | Written via decompose or directly. |
| `data/planning/weekly/*`, `monthly/*` | RitualDO (content); BrainDO (commit) | Written on ritual commit, committed by BrainDO. |
| `data/system/learned.md` | BrainDO only | Written via decompose or directly. |

**Ordering model**: Per-DO. Each Durable Object processes requests sequentially (guaranteed by the CF runtime). Single-writer-per-file prevents conflicts.

### Commit Orchestration (Coordinator Model)

**BrainDO is the only component that commits to GitHub.** ProjectDO and RitualDO produce write intents and return them to BrainDO. BrainDO collects all intents from a single user message — its own current.md edits, any ProjectDO spread changes, any RitualDO plan writes — applies index rebuilds, and commits everything in one atomic operation.

This is how "atomic multi-file commits" and "single-writer principle" coexist. ProjectDO owns the *content* of its spread (it decides what to write), but BrainDO owns the *commit* (it decides when to write to GitHub).

**Write intent format**: Each write intent is a structured object:
```
{ path: "data/projects/find-pcp/spread.md", op: "put", content: "..." }
{ path: "data/current.md", op: "tool", type: "append_to_section", heading: "## Open Loops", content: "- [ ] Call PCP" }
```
- `op: "put"` — replace the entire file with `content` (used for spreads, log files, new files)
- `op: "tool"` — apply an LLM tool call to an existing file. The `type` field MUST be one of the canonical tool call types defined in the LLM Tool Calls section (`append_to_section`, `prepend_to_section`, `replace_section`, `mark_complete`, `remove_item`). No separate dialect — tool calls and write intents use the same schema.
- `base_ref_sha` (optional) — the repo HEAD commit SHA at the time the intent was created. If present, BrainDO verifies this matches the `base_ref_sha` used for the current commit assembly. This is a commit-level guard (not per-file blob SHA), consistent with the Git Data API model.

**If a write intent fails to apply** (e.g., the target section no longer exists, or `base_ref_sha` doesn't match HEAD):
1. If HEAD hasn't changed: BrainDO reloads the target file and retries applying the intent once.
2. If HEAD changed: BrainDO restarts commit assembly at the new HEAD and revalidates all intents. Intents that still apply are kept; intents that fail are re-run per step 3.
3. If the intent still fails after reload/revalidation: BrainDO re-runs the LLM once for the failing DO's portion with updated context.
4. If still fails: abort the commit and post a Slack error describing what didn't persist.

This keeps failures bounded (max 1 restart + 1 LLM re-run per intent) and debuggable.

**Cross-DO notification**: When BrainDO routes a message to ProjectDO and ProjectDO produces spread changes, the response flows back to BrainDO as write intents. BrainDO then:
1. Commits the spread changes (on behalf of ProjectDO)
2. Rebuilds the project index
3. Updates current.md
4. Commits all changes in one commit

For asynchronous spread updates (e.g., research pipeline completing later), ProjectDO calls BrainDO via Durable Object stub with `notify_spread_updated(slug, spread_content, trace_id)`. BrainDO coalesces notifications for up to 5 seconds (in case multiple spreads update in rapid succession), then rebuilds the index and commits once.

**Index rebuild source consistency**: When BrainDO rebuilds the project index as part of a commit, it reads spread data from the write set being assembled (the blobs about to be committed), NOT from DO memory caches or a separate GitHub read. This guarantees the index reflects exactly what will be in the commit. For spreads not in the current write set, BrainDO reads from GitHub at the `base_ref_sha` used for the commit.

### GitHub Commit Model

**Atomic multi-file commits via Git Data API**: All writes for a single user message MUST be committed in one commit. BrainDO uses the Git Data API (not the Contents API) to create a single commit affecting multiple files:

1. Read `refs/heads/main` to get the current commit SHA (`base_ref_sha`)
2. Create blobs for each file in the write set
3. Create a tree from the blobs, based on the current commit's tree
4. Create a commit pointing to the new tree, with `base_ref_sha` as parent
5. Update `refs/heads/main` to the new commit (force=false — fails if HEAD moved)

If HEAD changes between step 1 and step 5 (update ref fails), BrainDO retries from step 1 with the new HEAD. Write intents with `base_ref_sha` are re-validated; if stale, the failing DO's LLM is re-run.

The Contents API (per-file, requires file SHA) is NOT used for multi-file writes — it cannot produce atomic commits across files.

**Branch strategy**: All writes go to `main`. No feature branches. The repo is a single-user system — branching adds complexity with no benefit.

**Commit messages**: Include a feature tag and trace ID for auditability. Format: `[feature] description (trace: {trace_id})`. Examples:
- `[inbox] Process brain dump: 3 tasks, 1 project (trace: evt_abc123)`
- `[ritual] Weekly plan committed (trace: evt_def456)`
- `[decompose] Fan out current.md changes (trace: sha_789ghi)`

### Idempotency and Slack Retries

Slack retries events if the worker doesn't ACK within 3 seconds. The system will see duplicate events.

**ACK immediately, process after**: The Cloudflare Worker MUST ACK the Slack request immediately after verifying the Slack signature and extracting the event envelope. ACK does not depend on BrainDO accepting the request — the Worker returns 200 to Slack first, then dispatches the envelope to BrainDO asynchronously (via `ctx.waitUntil(fetch(brainDO))` or equivalent). All downstream work (dedup check, thread fetch, Claude calls, GitHub commit) happens after ACK. If dispatch to BrainDO fails (rare — DO unavailable), the Worker posts an error to Slack (best-effort) and logs the failure. If the Slack error post also fails, log only — do not retry or escalate.

**At-most-once processing**: Every Slack event is deduplicated using a composite key stored in BrainDO.

**Dedup keys**:
- Events API: `{team_id}:{event_id}` — TTL 1 hour
- Slash commands: `{team_id}:{command}:{channel_id}:{user_id}:{request_ts}:{text}` — TTL 5 minutes (retries are near-term; short TTL avoids blocking legitimately repeated commands). Alternatively, use `X-Slack-Signature` as the key — it is unique per request.

**BrainDO is the dedup gate** for all Slack events and slash commands. It stores dedup keys in DO storage with the TTLs above and only forwards to ProjectDO/RitualDO after dedup passes. No other DO performs dedup.

**Dedup check** (in BrainDO, first thing after receiving a forwarded event):
1. Compute dedup key
2. Check if key exists in DO storage
3. If yes → skip processing, return
4. If no → store key with TTL, proceed with processing and routing

**User re-sends** (same text, different event ID): These are NOT duplicates — the user intentionally sent the message again. Process normally.

**Message edits**: Ignore. The original capture stands. If the user wants to correct something, they send a new message or reply in the thread.

**Message deletes**: Ignore. Captured data is not removed from the stream. History is append-only.

### Durability and Race Handling

**Durability point**: A change is "persisted" when `data/current.md` is committed to GitHub. Once the Slack response is sent, the change is in git. Decompose (current.md → source files) is an eventual fan-out optimization — source files may lag, but current.md is the authoritative record.

**Version stamp**: current.md includes a metadata comment at the top:
```
<!-- context_pack_version: {sha} source_ref: {git_sha} direction: build|decompose -->
```
- `{sha}` — the commit SHA of the current.md file itself
- `source_ref` — the commit SHA of the repo state used to produce this version (for builds: the HEAD when source files were read; for decompose pushes: the HEAD when the DO pushed)
- `direction` — whether this version was assembled from sources (`build`) or pushed by a DO (`decompose`)

**Decompose completion tracking**: The version stamp does not track decompose completion — that's handled by a sidecar marker file. When the decompose Action finishes fanning out current.md to source files, it writes `data/.decompose/{current_md_sha}.done` in a follow-on commit. Rebuild checks for this marker instead of modifying current.md itself.

**Marker contract**:
- The `.done` marker is written only after all source file writes succeed (including preservation of inline sections if applicable).
- If decompose results in zero diffs (current.md matches source files already), the marker is still written. No-op decompose is still "complete."
- One marker per current.md version (keyed by commit SHA).
- Marker files are append-only and never deleted. The `data/.decompose/` directory grows monotonically; cleanup is not required (files are tiny).

**Race rules**:
- **Rebuild abort condition (deterministic)**: Before writing, rebuild reads the version stamp. If `direction: build`, rebuild proceeds normally. If `direction: decompose`, rebuild checks for the sidecar marker `data/.decompose/{sha}.done`. If the marker exists, decompose is complete and rebuild proceeds. If no marker, rebuild aborts — decompose hasn't fanned out yet, so source files are stale. No git ancestry traversal needed.
- **Decompose-then-rebuild ordering**: The GitHub Action pipeline runs decompose first (fan out current.md to source files, write the `.done` marker), then rebuild (reassemble current.md from the now-updated sources). This ensures the round-trip is consistent.
- **If decompose and rebuild race**: decompose's source file writes may be overwritten by a concurrent rebuild from stale sources. The sidecar marker prevents this — rebuild won't run until decompose writes the marker.

**Partial failure**: If decompose fails after current.md is committed:
- current.md is still authoritative — it has the latest state
- Source files are stale but not corrupted
- A retry of decompose will fix the drift
- The reconciliation job will detect the inconsistency

**Reconciliation**: A nightly job verifies that `rebuild(source_files) == current.md` (modulo inline sections and timestamps). If they disagree, log a warning. This is a drift detector, not auto-repair — manual investigation is warranted.

### Tool Call Validation

The LLM returns structured tool calls. The DO MUST validate them before execution.

**Path safety**: All file paths MUST start with `data/`. Reject any path outside the data directory. Reject path traversal (`../`).

**Section semantics**: Sections in markdown are defined by headings. A section spans from its heading line to the line before the next heading of the same or higher level. For example, `## Open Loops` includes everything until the next `##` or `#` heading, but subsections (`###`) within it are part of the section.

**Section matching rules**:
- `append_to_section`, `prepend_to_section`, `replace_section` match by exact heading text including level (e.g., `## Open Loops` does not match `### Open Loops`).
- First occurrence wins. If there are duplicate headings (a bug), the first match is used.
- `replace_section` replaces all content between the heading and the next same-or-higher-level heading. The heading itself is preserved.

**Line matching rules**:
- `mark_complete` matches a task line by exact text after trimming leading bullet/checkbox syntax (`- [ ] `, `- `) and trailing whitespace. Case-sensitive.
- `remove_item` matches by exact full-line equality after trimming trailing whitespace. Case-sensitive.

**Payload limits**: Max content per tool call: 10,000 characters. If the LLM tries to write more (e.g., a massive brain dump plan), truncate and log a warning.

**Invalid tool calls**: If the LLM returns a tool call with an unknown type, invalid path, or missing required fields — skip that tool call, log it, and continue processing the remaining valid tool calls. Do not fail the entire request.

**Allowed tool call types**: Only the types defined in the LLM Tool Calls section of this spec. Any other type is rejected.

**Write intent validation**: BrainDO validates `op: "tool"` write intents using the same rules above (path safety, section matching, payload limits, allowed types). Write intents and LLM tool calls share the same validation code path.

**Security boundary**: The LLM's tool calls are constrained to prevent unintended damage:
- **No file deletion**: No tool call can delete a file. Archiving (setting status) is allowed; removing from disk is not.
- **No identity writes**: The LLM cannot directly modify files under `data/identity/`. Identity files are manually maintained by the user. The LLM can suggest changes in a Slack reply but cannot write them.
- **Path containment**: All file paths must resolve to `data/` after normalization. Reject `../`, absolute paths, and symlink traversal.
- **Channel creation only via `create_project`**: The LLM cannot create arbitrary Slack channels. Channel creation is a side effect of the `create_project` tool call only, which enforces the `proj-{slug}` naming convention.

### Slack Response Handling

**Threading rule**: If the incoming message has `thread_ts`, reply to that `thread_ts`. If it does not, reply to the message's own `ts` (creating a new thread under it).

**Slash commands in threads**: Slash commands always execute at channel level. If invoked from a thread, the response still goes to the channel (via `response_url`), not the thread.

**Message size**: If the Slack API returns a message-too-long error:
1. Split by markdown heading into multiple messages
2. Post sequentially in the same thread
3. If a single section still exceeds the limit, truncate with "… (continued)" and post the remainder

**Ephemeral vs in_channel**: Slash command responses default to ephemeral (only the user sees them) EXCEPT `/what-matters` which uses `in_channel`.

### Timezone and Date Conventions

**Authoritative timezone**: `America/New_York`. All dates, times, "today", "tomorrow", and cron schedules are interpreted in this timezone.

**Day boundary**: Local midnight in `America/New_York`. A message at 11:59pm ET belongs to today's stream. A message at 12:01am ET belongs to tomorrow's.

**File naming conventions**:
- Stream files: `YYYY-MM-DD.md` (e.g., `2026-01-31.md`)
- Log files: `YYYY-MM-DDTHH-mm-{type}.md` (e.g., `2026-01-31T14-30-research.md`) — local time, hyphenated
- Weekly plans: `YYYY-Www.md` (ISO week date, e.g., `2026-W05.md`) — computed in local time
- Monthly plans: `YYYY-MM.md` (e.g., `2026-02.md`)

**DST handling**: The system uses `America/New_York` which observes DST. File dates use local time. The 7:30am digest and 9am ritual reminder fire at local clock time regardless of DST transitions.

### Rate Limits and Context Window Management

**current.md size limit**: If current.md exceeds 80,000 characters (~20k tokens), the system must prune before passing to the LLM. Pruning follows a deterministic cascade — each step is tried in order until under the limit:

1. Truncate Identity section to mission + roles only (drop detailed values/goals)
2. Truncate Learned Context to the 20 most recently updated entries
3. Truncate stream to last 20 entries
4. Truncate monthly plan to goals only (drop details)
5. If still over limit, summarize the truncated sections into a single paragraph each

**Pruning is ephemeral**: The pruned/summarized version is passed to Claude but never written back to git. The full current.md in the repo is always the complete version. This prevents accidental loss of detail through repeated pruning cycles.

**GitHub API**: Use conditional requests (If-Match, ETags) to minimize rate limit consumption. On 403/429, exponential backoff with max 3 retries. Log failures.

**Claude API**: On rate limit (429), retry with exponential backoff. On context window overflow (400), prune context and retry once. On other errors, log and return a Slack error message.

**Tavily API**: On failure/timeout during research, log the failed query, continue with available results, and note incomplete coverage in the synthesis.

**Slack API**: On rate limit (429), respect `Retry-After` header. Queue messages and drain when allowed. Never drop a message silently.

### Observability

**Trace ID**: Every Slack event gets a `trace_id` derived from the event ID (e.g., `evt_{event_id}`). This ID flows through:
- DO processing logs
- Claude API call metadata
- GitHub commit messages
- Slack reply metadata (as a debug field, not user-visible)

**Structured logging**: DOs log to console (captured by CF) with JSON format including `trace_id`, `do_type`, `action`, `duration_ms`, and `outcome`. No `console.log` with bare strings.

**Audit trail per write**: Every GitHub commit is an audit record (who triggered it, what changed, trace ID). For additional granularity, the DO can persist a lightweight event log to DO storage keyed by date.

### Bootstrap and Migration

**Required repo structure**: On first run (or if files are missing), the system must be able to create the minimum viable structure:

```
data/
├── current.md              # Empty context pack with section headers
├── .decompose/             # Decompose completion markers (created by Action if missing)
├── stream/                 # Empty directory
├── planning/
│   ├── calendar-current.md # Empty
│   └── calendar-past.md    # Empty
├── projects/
│   └── index.md            # Empty table header
├── system/
│   └── learned.md          # Empty
└── identity/               # Must be manually populated by user
```

**Template versioning**: Spread templates and current.md section structure should include a version comment (e.g., `<!-- template: v1 -->`). When the template evolves, a migration script updates existing files.

**Corrupt/missing file recovery**: If a source file referenced by current.md is missing or unparseable:
- Log a warning
- Skip that section in the rebuild (don't crash)
- Surface the issue in the next daily digest as a system health note

---

## Testing Architecture

This spec is verified through automated tests at three tiers. Tests run against isolated test environments that mirror production but share no data with it.

### Test Environments

| Component | Production | Test |
|-----------|-----------|------|
| Slack workspace | User's real workspace | Separate test workspace with test Slack app |
| Cloudflare Worker | `second-brain` | `second-brain-test` (separate secrets, separate DO namespaces) |
| GitHub repo | `colinalford/brain-coach` (data in `data/`) | `colinalford/brain-coach-test` |

Test and production environments are fully isolated. Same code, different credentials, different data. A test run cannot corrupt production data.

### Test Tiers

**Tier 1 — Unit tests** (`src/tests/unit/`): Verify internal logic — routing, parsing, formatting, agent behavior — with all external APIs mocked. Fast, no credentials needed, fully deterministic. Run with `npm test`.

**Tier 2 — System tests** (`src/tests/system/`): Verify system behavior with deterministic outputs. Real Worker + DOs + GitHub test repo. Claude, Tavily, and Slack Web API are stubbed. Slack requests into the system are simulated via signed HTTP POST (request replay) targeting the production webhook routes on the test Worker (same URL paths, same Content-Type, same signature headers) — not test-only endpoints. This tier tests the things that matter most: commit orchestration, tool call application, dedup, thread fetch, decompose gating, write intent validation — all without LLM variability or vendor availability as confounds. Run with `npm run test:system`.

System tests are the primary behavioral gate. They prove the spec's contracts hold under deterministic conditions. System tests never evaluate whether Claude "made the right decision" cognitively — they only verify that given a set of tool-call outputs, the system applies them correctly and durably. Cognitive quality is an E2E/human concern, not a system test concern.

**Tier 3 — E2E smoke tests** (`src/tests/e2e/`): Exercise real flows through the full stack with real Claude/Tavily/Slack APIs. A test sends a real Slack message to the test workspace, the test worker processes it through real DOs, calls real LLM/search APIs, writes to the real test GitHub repo, and replies in real Slack. These tests are inherently non-deterministic (LLM output varies, network flakes, rate limits) and should be treated as smoke tests, not correctness proofs. Run with `npm run test:e2e`.

**What each tier proves**:
- Unit → components are correct in isolation
- System → the system's behavioral contracts hold (deterministic)
- E2E → production wiring and third-party integrations work (smoke)

### Stubbing in System Tests

System tests must be deterministic and parallel-safe. External APIs are stubbed as follows:

**Stubbing mechanism**: The Worker uses dependency injection — an `LLMClient` interface with `RealLLMClient` (production/E2E) and `StubLLMClient` (system tests). Same pattern for `SearchClient` (Tavily) and `SlackClient` (outbound Slack Web API calls). The stub implementation is selected via environment flag: `LLM_MODE=stub`, `SEARCH_MODE=stub`, `SLACK_MODE=stub` set on the test worker.

**Stub responses are keyed by `test_id`**: Each system test registers its expected stub responses before sending the request. The stub looks up the `test_id` from the incoming message text and returns the corresponding canned response. This prevents one test's stub from leaking into another when tests run concurrently. If no stub response is registered for the `test_id`, the stub client throws an error and the test fails immediately — never fall back to the real API.

**What is stubbed vs real in each tier**:

| Component | Unit | System | E2E |
|-----------|------|--------|-----|
| Worker + DOs | Mocked | Real | Real |
| Claude API | Mocked | Stubbed (canned tool calls) | Real |
| Tavily API | Mocked | Stubbed (canned results) | Real |
| Slack Web API (outbound) | Mocked | Stubbed (recorded + asserted) | Real |
| Slack requests (inbound) | N/A | Signed replay | Real Slack events |
| GitHub API | Mocked | Real (test repo) | Real (test repo) |

**Slack API in system tests**: Outbound Slack Web API calls (postMessage, createChannel, invite) are stubbed and recorded with sequence numbers so tests can assert both presence and relative ordering. For example, project creation must produce `createChannel` → `conversations.invite` (bot) → `conversations.invite` (user) → `chat.postMessage` (confirmation) in that order. Tests also assert absence of calls — e.g., "inbox quick capture must not call createChannel" and "/what-matters must not produce any GitHub writes." Asserting absence prevents over-eager side effects, which are a common bug class. Real Slack Web API is exercised only in E2E smoke tests.

### Slash Command Testing

Slash commands cannot be reliably invoked via the Slack Web API — Slack requires them to be typed in the message composer. The system tests and E2E tests handle this differently:

- **System tests + E2E tests (default)**: Cover slash commands via **signed request replay**. The test generates an `application/x-www-form-urlencoded` payload matching what Slack would send, signs it with `SLACK_SIGNING_SECRET_TEST`, and POSTs it to the test Worker endpoint. Signed replay MUST target the same webhook routes used in production (identical paths and middleware), not test-only endpoints — this ensures signature verification and request parsing are exercised exactly as in production. It does not prove Slack UI wiring.
- **Playwright smoke tests (optional, nightly)**: Automate the Slack web client to type `/what-matters`, press enter, and verify the response. Proves real UI invocation works. Brittle and slow — not a per-commit gate.

In E2E tier, slash commands are still tested via signed replay (not real Slack invocation) unless Playwright is enabled. Slash command correctness is defined by request signature verification and handler behavior, not by Slack UI invocation. This is a settled decision — do not reopen it.

### Test Correlation

The system is async — ACK happens immediately, processing happens later, replies arrive eventually. Tests need a reliable way to find the artifacts produced by their specific test input.

**Correlation mechanism**:
- Each test includes a unique `test_id` in the message text using the exact format `[test:<id>]` (e.g., `[test:inbox-quick-1738300800-001]`). Stubs extract the `test_id` by matching the first `[test:...]` token in the message. If no `[test:...]` token is found, the stub throws (see Stubbing section).
- BrainDO derives a `trace_id` from the Slack event and includes it in:
  - GitHub commit messages (already specified: `(trace: {trace_id})`)
  - Slack reply via message metadata (`metadata.event_payload.trace_id`). If Slack message metadata is unavailable, include a literal `trace: {trace_id}` line in the reply text (acceptable in test workspace; gate behind `ENV=test` so production stays clean).
- Tests locate their artifacts by searching:
  - Slack: poll `conversations.replies` for bot reply containing the `test_id` or `trace_id`
  - GitHub: search recent commits for `trace_id` in the commit message

This makes test assertions deterministic even when multiple tests run concurrently.

### Observing Async Results

**Polling model**: Tests poll for expected artifacts until they appear or timeout. The observation mechanism differs by tier:
- **System tests**: Slack observations come from inspecting recorded Slack stub calls (no Slack API token needed). GitHub observations come from polling the test repo via Git Data API or Contents API.
- **E2E tests**: Slack observations come from polling `conversations.replies` (bot token, test workspace) with the parent message `ts`. GitHub observations come from the same API polling as system tests.
- **Poll interval**: 2 seconds (Slack), 3 seconds (GitHub)
- **Max wait**: 90 seconds (covers Claude processing + GitHub commit + Slack reply)
- **"Done" means** (system tests): The Slack stub recorded a reply containing the test's `trace_id` AND (for write tests) the GitHub commit containing the `trace_id` is at HEAD — not just "exists somewhere in history." The "at HEAD" requirement enforces the single-atomic-commit invariant.
- **"Done" means** (E2E): The Slack reply containing the `trace_id` has appeared via `conversations.replies` AND the GitHub commit containing the `trace_id` exists in history. E2E does not require "at HEAD" because concurrent smoke runs and GitHub Actions (decompose/rebuild) may advance HEAD.

**On timeout failure**, test output must include:
- Last seen Slack messages in the channel/thread
- Last 5 commit SHAs and messages from the test repo
- The `test_id` and expected `trace_id` for manual investigation

### What Tests Should Cover

Each behavioral section of this spec should have corresponding tests. The tier column indicates where the test belongs:

| Spec Section | Tier | Test Approach |
|-------------|------|--------------|
| Inbox processing (quick input) | System | Send signed event, verify stream entry + Open Loops update + Slack reply (stub returns predetermined tool calls) |
| Inbox processing (brain dump) | System | Send signed event with brain dump text, stub returns predetermined multi-tool-call response (projects, tasks, calendar), verify all writes + commit + reply formatting |
| Inbox processing (brain dump) | E2E | One smoke scenario: send real brain dump, verify real Claude produces reasonable cognitive sorting |
| `/what-matters` | System | Send signed slash-command request, verify in-channel response contains correct data sources |
| `/project new` | System | Send signed command, verify spread + index + GitHub commit. Assert Slack stub recorded createChannel + invite calls with correct params |
| Project channel chat | System | Send signed event in `#proj-*`, verify spread update + index rebuild |
| Research pipeline | System | Stub Tavily results + Claude synthesis, verify thread updates + log file + spread summary + commit |
| Research pipeline | E2E | One smoke scenario: trigger real research, verify real APIs produce coherent output |
| `/ritual weekly` | System + E2E | System: signed requests through phases, verify plan file. E2E: real Slack conversation |
| Thread conversations | System | Send reply with `thread_ts`, verify thread history fetched and used in response |
| Daily digest | System | Invoke the cron handler function directly — this is a pure function call (no Slack envelope, no dedup, no signature verification, no DO routing). Pass a fixed `now` timestamp for determinism. Verify Slack stub recorded a post to `#sb-inbox` with correct priorities. |
| Error handling | System | Send malformed input, verify graceful degradation + error reply |

### Invariant Tests (Highest Priority)

These tests verify the spec's "must never happen" rules. They belong in the system test tier (deterministic, no LLM variability) and should be the first tests written:

| Invariant | Test |
|-----------|------|
| **Durability point** | A test must never observe the Slack reply before it can observe the corresponding GitHub commit. Send a message, poll GitHub and Slack concurrently. Assert the GitHub commit for that `trace_id` exists at HEAD before (or at the same time as) the Slack reply appears. This is an observation-ordering invariant, not a wall-clock ordering — timestamp comparison is never used. |
| **ACK timing** | Send a signed event to the Worker. Assert the HTTP response is 200 and returns within 3 seconds. Then poll for the Slack reply and GitHub commit, which arrive later. This protects the "ACK immediately, process after" contract from accidental regression. |
| **Single commit** | A message that triggers changes to current.md + a project spread + index must produce exactly one commit. Assert commit count for that `trace_id` == 1. |
| **Dedup** | Send the same event payload twice (same `event_id`). Assert exactly one commit and one Slack reply. |
| **Rebuild gating (negative)** | Push current.md with `direction: decompose` and no `.done` marker. Trigger rebuild. Assert rebuild aborts (no new current.md commit). |
| **Rebuild resumes after decompose** | Push current.md with `direction: decompose`, then write the `.done` marker, then trigger rebuild. Assert exactly one rebuild commit occurs and current.md `source_ref` updates to the new HEAD. Closes the loop — rebuild must actually run when it should. |
| **Write isolation** | LLM tool call attempts to write outside `data/`. Assert rejected, no file created, processing continues. |
| **No partial persistence** | Stub returns one valid tool call and one invalid tool call (e.g., bad path). Assert: no commit occurred, Slack error posted, repo unchanged. Guards against half-committed state. |
| **Dedup produces zero side effects** | Send a dedup-rejected event (same `event_id` as a previously processed event). Assert: no Slack outbound call, no GitHub commit, no DO state mutation. Dedup rejection must be completely silent. |

### Negative Assertions (Required)

System tests must assert the absence of side effects, not just presence. Over-eager behavior is a common bug class — the system does too much, not too little. Canonical absence checks:

- **Inbox quick capture**: must not call `createChannel`, must not write project index
- **`/what-matters`**: must not write any GitHub files, must not modify DO storage
- **Read-only questions/chat**: must not modify `current.md`
- **Failed/aborted commits**: must not partially write files to GitHub
- **Dedup-rejected events**: must not produce any side effects (no commit, no Slack reply, no DO state change)

These are not optional — every system test should include at least one absence assertion relevant to its scenario.

### Test Isolation Contracts

- Tests use unique test IDs (timestamps + sequences) in message content and project names to avoid collisions between concurrent test runs.
- Cleanup is **best-effort, not required for correctness**. Tests archive channels and delete messages when possible, but cleanup failures must not cause test failures. The test workspace is disposable infrastructure.
- **Never delete**: GitHub commit history in the test repo, `.decompose/` marker files, and stream files. These are append-only in production and must be append-only in tests.
- Test data in the GitHub test repo accumulates (append-only, like production). Tests do not depend on a clean repo state.
- Tests must not depend on prior test state. Each test sets up its own preconditions.
- AI-generated output (E2E tier only) is validated with semantic matchers (keyword/pattern checks), not exact string equality, because LLM output varies. E2E tests must still assert at least one persisted side effect (GitHub commit exists) and one visible effect (Slack reply exists), even when content is semantically validated. System tests use canned stubs and can assert exact output.
- **E2E failures due to rate limits, transient API errors, or LLM variance are environmental failures, not spec violations.** Do not "stabilize" E2E tests by weakening assertions — fix the environment or accept the flake.
- **E2E scope is deliberately minimal**: one inbox brain dump, one research, one ritual. That's the smoke suite. Everything else belongs in system tests.

### Verification Gate

Before committing:

```
yamllint .github/workflows/*.yml && node --check src/scripts/*.js && npm run test:all
```

`npm run test:all` runs unit + system + E2E tests. During development, use targeted test runs (one test at a time) for fast feedback. The full suite is the gate before commit, not the development loop.

---

## Implementation Gaps (Codebase vs Spec)

These gaps describe where the **current codebase** does not yet match this spec. The spec above is the target behavior; these are the implementation work items. If a gap is described in the spec text (e.g., the spec defines how dedup works, but the code doesn't implement it yet), the gap is listed here to track the implementation work.

| ID | Feature | Gap |
|----|---------|-----|
| G8 | Research follow-up | Interactive research coordinator exists but is not integrated with the new write-intent pipeline |
| G22 | Google Calendar | Bidirectional sync with external calendar not implemented. Calendar data is owned in markdown only. |
