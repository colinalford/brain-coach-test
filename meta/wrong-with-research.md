# Research Feature: Required Changes

## Current Behavior (Bugs)

1. **Output not persisted.** Only the user's input is logged to the stream. The research results are not saved to the project entity, the project spread, or a log file. This violates Prime Directive #1 — all meaningful data must persist to git.
2. **Not project-aware.** `/project research` does not associate results with the project whose channel it's invoked from.
3. **Replies as new messages.** Results post as new top-level messages in the channel instead of threading under the user's original message.
4. **Raw Tavily output.** Search results are returned with minimal processing — no synthesis, no formatting to match the user's request, no contextual filtering through what the system knows about the user.
5. **Incomplete results.** The search agent doesn't try hard enough. For a query about local clinics, it returned 2 results when a simple Google search finds many more. It also failed to extract data that was clearly available on the websites it found.

## Desired Behavior

### Slack UX

- All research responses MUST reply as a **thread** to the user's original message, not as new channel messages.
- `/project research <message>` inside a project channel (`#proj-{name}`) should automatically associate the research with that project. No confirmation needed.
- `/project research <message>` outside a project channel should:
  1. Try to infer which existing project this relates to
  2. Ask the user: "Should I add this to [inferred project] or create a new one?"
  3. Wait for confirmation before executing
  4. Example: User asks about AI agent security → "Do you want me to add this to your second brain implementation project or start a new project?"

### Research Agent Architecture

The research feature must use a coordinator/sub-agent pattern, not a single prompt.

**Flow:**

```
1. PLAN — Parse the request
   - What is the user asking for?
   - What output format do they want? (table, summary, list, comparison)
   - Define research completeness criteria: what data fields are required?
   - Define output quality criteria: what does "done" look like?

2. SEARCH — Spawn sub-agents (up to 3 in parallel) to query Tavily
   - The coordinator should break the research goal into specific queries
   - Each sub-agent runs a focused search and returns raw results

3. EVALUATE — Check research completeness
   - Does the returned data cover all requested fields?
   - Are there gaps? (e.g., found a clinic name but no pricing info)
   - Are there obvious missing results? (e.g., only 2 clinics when there should be more)

4. FILL GAPS — If evaluation fails, spawn targeted follow-up searches
   - Narrow queries to find specific missing data (e.g., search "[clinic name] membership pricing")
   - Add more results if coverage is too thin (e.g., search with different terms to find more clinics)
   - Repeat steps 2-4 until completeness criteria pass

5. SYNTHESIZE — Process results through user context
   - Tavily output is RAW INPUT, not final output
   - The agent must process search results through what it knows about the user
     (identity layer, project context, stated needs, preferences)
   - Format output according to the user's requested format
   - Show sources for all claims

6. QUALITY CHECK — Evaluate the final artifact
   - Does it match the requested format?
   - Is it complete against the original request?
   - If not, repeat steps 5-6

7. DELIVER AND PERSIST — Return results and save to git
   - Post final output to Slack in the thread
   - Write to project `spread.md` (one section per research thread, updated with latest final output only)
   - Write to a log file with the full conversation thread
   - git add, commit, push
```

### Persistence Requirements

After research completes (and after each follow-up in the same thread):

1. **Project spread (`spread.md`):** Add or update a section for this research thread. Contains only the latest final output artifact, not the full conversation. One section per research thread — updates replace, not append.
2. **Research log:** One log file per research thread. Contains the full conversation including the user's request, intermediate results, and final output. Follow-up requests in the same thread append to the same log file.
3. **Git:** `git add`, `git commit`, `git push` after every update. Non-negotiable.

### Example

**User input:**
> `/project research I need you to look up integrative health clinics and doctors offices in Asheville. I want: 1. Name 2. Phone number 3. Address 4. Membership fees (AI summary: how much does it cost and what are options) 5. What can you find about insurance (do they accept? Do they use it for some procedures? Do they give a super bill?) 6. Are they accepting new patients?`

**What should happen:**
1. Coordinator parses: user wants a table with 6 columns, for integrative/functional medicine clinics in Asheville NC. Completeness criteria: at least 5+ clinics, all 6 fields populated for each.
2. Initial search: broad query for integrative health clinics in Asheville. Returns a list of names and basic info.
3. Evaluation: got 5 clinic names but pricing, insurance, and new-patient info is missing for most. Only 2 had detailed results.
4. Follow-up searches (parallel): "[Clinic A] membership pricing", "[Clinic B] insurance accepted", "[Clinic C] accepting new patients", etc.
5. Synthesis: compile into a formatted table, note where info couldn't be found, process through user context (user needs a PCP, has insurance concerns, is in Asheville).
6. Deliver in thread. Persist to spread and log. Push to git.
