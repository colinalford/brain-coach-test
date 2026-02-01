# Rearchitecting The System
I was doing some research and I want to update the system using Cloudflare Workers and Durable Objecfts. 

I'd have an agent at the edge that can coordinate tasks with very low latency. Then maybe there are other workers or maybe they just offload to github actions.


We already talked about how current.md is constructed from the source of truth files (project files, monthly/weekly plans, identity files, etc). There is some ephemeral state in current.md itself. 

I still want the git repo to be the source of truth. Nothing about the file system changes. But!

When the cloudflare worker initializes, it populates the DO with the current state of current.md. That always gets passed as context to the LLM.

We define a set of tool calls to define how to modify the current.md file by other agents. This is always the current.md file as held by the durable object, not the git repo. 

The Worker with Durable object responds to slack quickly with responses and whatnot. Whenever current.md is written, it pushes those updates back to github.

When github receives current.md, it checks for updates by section and decomposes it into the appropriate files. 

That works really well for the high level, what matters workflows. 

We'd need to setup additional flows for projects and weekly planning, but I think it would work the same. We'd need additional tool calls for updating project spreads that aren't included by default, tool calls for handling weekly and monthly planning rituals, and teaching it how to handle the logging. 

We'll still need an environment to run longer running tasks. Github actions can work well here. Cloudflare workers have CPU processing time limits. Github actions can run for up to 6 hours. Github is already the persistence layer for this application, so that works great to let github actions manage making direct commits. 

I definitly want to build a multi agent systme where the main agent is the coordinating work to the other agents. That helps with a lot of things: 
1. Expanded context windows (sort of). If an agent has a dedicated job (find the right file), that's less context passed to the main agent
2. Jobs can be done in parallel - this is really nice. The main agent can determine what's sync and what's async and spread the jobs around.
3. The main agent can contain more context around goals and manage the subagents, judging whether their outputs are valid or not, correcting them as needed.

Overall, this seems like a solid architecture for improving responsiveness and scalability while maintaining the integrity of the source of truth in the git repository. The use of Cloudflare Workers and Durable Objects will allow for low-latency interactions and efficient state management, while the multi-agent system will enhance task delegation and parallel processing.

## Summary of Proposed Architecture
- **Cloudflare Workers**: Serve as the edge agents for low-latency interactions.
- **Durable Objects**: Maintain the state of `current.md` for quick access and modifications.
- **Tool Calls**: Define specific operations for modifying `current.md` and handling projects, weekly, and monthly planning.
- **Multi-Agent System**: A main coordinating agent that delegates tasks to specialized sub-agents for efficiency and parallel processing.
- **GitHub Integration**: The repository serves as the persistence layer in plain markdown files with occasiaional yaml or json. Media and other document types may be supported in the future as well. Github actions works as a slower but longer running and robust platform to spin up additional agents for larger operations.

## Development changes
I'm really frustrated with how this project has gone. I want it to be an LLM driven first project, completely coded by coding agents managed by me. I don't think the repo is structured well for that. 

First, we don't have sufficient claude.md, skills, or agents files. Skills are apparently more important than agents now. 

Second, I want this to be built according to the best engineering principles:
1. Use test driven development, both unit, integration, and e2e testing. I don't ever want to be confused about the state of the system. The LLM should know whether or not its changes work by direct testing and investigation, not by "code and guess". That's not how real engineering works. Its going to be hard given how much 3rd driven this is. But its critical.
2. I need logging and reporting. We need to know what went wrong so we can fix it.

Here's an attempt. I really want TDD and BDD though -- tests and behaviors should drive the implementation, not the other way around. We should always think "How am I going to be able to verify this to the person who I'm reporting to? How will I show my work?"

Engineering Principles & Behavioral Guardrails
1. The "Plan-Verify-Execute" Loop
Think First: Before writing any code, output a "Technical Approach" section. Identify the specific files to be changed, the logic to be implemented, and any potential side effects on the existing system.
State Management: Explicitly describe how this change affects the state of the application. If introducing a new state, justify why it cannot be derived from existing data.
Edge Case Audit: List at least three ways this code could fail (e.g., null inputs, network timeouts, race conditions) and how you will handle them.
2. Defensive Implementation
Validation at the Boundary: Every function or method must validate its inputs. If the data is invalid, fail fast with a descriptive error message.
Total Error Handling: Never "swallow" errors. Use structured error types. If you catch an exception, you must either handle it, wrap it with context, or re-throw it.
Idempotency: Where possible, design functions (especially data mutations) to be idempotent. Running the same operation twice should not result in inconsistent states.
3. Architecture & Clean Code
Readability Over Cleverness: Prefer boring, explicit code over "clever" one-liners or complex abstractions. If a junior developer couldn't understand it in 10 seconds, it is too complex.
The Rule of Three: Do not abstract or "DRY" code until you see the pattern repeated at least three times. Premature abstraction is more expensive than duplication.
Small Surface Area: Keep functions small (ideally <30 lines). If a function does two things, split it.
Explicit Dependencies: Pass dependencies into functions (dependency injection) rather than relying on global state or hidden imports. This ensures the code remains testable.
4. Observability & Maintenance
Meaningful Logging: Do not use print or console.log. Use a structured logger. Logs must include "Why" something happened, not just "What."
Self-Documenting naming: Variables should be descriptive (e.g., user_account_balance vs bal). Use verbs for functions (e.g., calculate_total vs total).
No Magic Values: Use named constants or enums for any string or number that has specific meaning. Never hardcode "magic strings."
5. The Testing Standard
Test-Driven Intent: For every new feature or bug fix, you must provide the corresponding test code.
Regression Guard: If fixing a bug, the test must specifically reproduce the bug before the fix is applied.
Mocking Boundaries: Only mock what you don't own (e.g., external APIs). Test your internal logic with real data structures.
6. Security & Privacy
Zero-Trust Inputs: Treat all data coming from a user, an API, or a database as potentially malicious. Sanitize and escape accordingly.
Secrets Awareness: Never generate code that includes hardcoded credentials, API keys, or PII (Personally Identifiable Information).
7. Definition of Done (DoD)
A task is not complete until:
The code passes all linting and type-checking rules.
Unit tests cover the "happy path" AND the "failure path."
Public-facing methods are documented with clear comments.
The agent has verified that no unrelated functionality was broken.
