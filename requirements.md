# Second Brain Requirements
I am a software engineer with executive function challenges. I want to build a second-brain project that is easy and embedded into my life. instructions.md contains the project architecture overall from someone else, however, I want to deviate from that project. 

It is critically important to me that all data and context are owned and stored in a way I can access them -- a github repo makes the most sense to me. I only want to use third party software to help with automation, and APIs to connect to LLMs for any knowledge work. Its critically important to me that any text I enter and data that gets generated gets saved and managed in my repo, where I can maintain and control the data and context over time.

I do not want to be spending a lot of time managing software maintenance daily. And I want the second brain system to eventually also support agents as personal assitants. 

I have used several well known "second brain" personal productivity systems in the past: 7 Habits of Highly Effective people's planning system, David Allen's getting things done, bullet jounraling. Each have major strengths and each have challenges. I have also created and found my own ways of managing tasks, especially adding a somatic element through a process I call basket sorting and weekly practice I call my "quilting practice" based on a psycho-spiritual symbol set I've built for myself.

I want to build a second brain system that works well for what I know works well, where I retain control of my data, and where I can expand it over time to be more productive for me as technology improves.

## Salience: The guiding principle
I want to introduce a definition of salience that I live by. The goal of the second brain is to help me with salience selection. I don't mean this purely as attention: I have my own working definition of salience:

Salience is the process by which an agent, embedded in an arena, compresses an underdetermined world into a ranked action landscape, such that one action becomes locally inevitable given the agent’s constraints, state, and goals.

### Expanded formal definition
Salience is a state-dependent, constraint-weighted orientation function that:
	1.	Maps high-dimensional sensory, interoceptive, and contextual input from an arena
	2.	Through the agent’s biological, learned, and structural constraints
	3.	Into a reduced set of affordances,
	4.	Ranked by expected viability,
	5.	Such that a specific action is selected and enacted rather than all others.

In short:

Salience is what makes “this, now” emerge from “everything, always.”

### Key properties

1. Salience is pre-attentive and post-perceptual
	•	Perception delivers possibilities.
	•	Salience collapses possibilities into direction.
	•	Attention then stabilizes and refines what salience already selected.

Attention follows salience; it does not create it.

2. Salience is inherently agent–arena relative

There is no salience in isolation.
	•	Same stimulus, different agent → different salience
	•	Same agent, different arena → different salience
	•	Same agent & arena, different internal state → different salience

Salience is not “in the thing” or “in the mind”—it exists in the coupling.

3. Salience is about action selection, not representation

This is crucial.

A thing is salient only insofar as it changes what the agent does next.
	•	If it doesn’t bias action, it isn’t salient.
	•	If it overwhelms all alternatives, it is dominantly salient (panic, fixation, hunger, obsession).

4. Salience is compressive

The world is massively underdetermined.
Salience is the mechanism that:
	•	discards 99.999% of available information,
	•	without deliberation,
	•	in real time.

This makes salience a metabolic function, not a reflective one.

5. Salience is teleonomic (goal- and viability-oriented)

Salience always answers the question:

“What matters next for continued existence or goal realization?”

For:
	•	animals → survival, reproduction, safety
	•	humans → survival plus abstract goals, meaning, commitments, will

Importantly:
	•	goals themselves become salient only if they are integrated into the salience system
	•	merely “knowing” a goal is insufficient

### A compact, technical formulation
Salience is the emergent function by which an embodied agent reduces an underdetermined arena into a dynamically ranked action space, such that one affordance is selected as the next viable step given the agent’s constraints, internal state, and teleonomic orientation.

### Distinctions from nearby concepts
Concept | Why it’s not salience
Attention | Stabilizes and enhances what salience already picked
Importance | Static and context-free
Value | One input into salience, not the mechanism
Motivation | A persistent bias, not moment-to-moment selection
Conscious choice | A narrative overlay that may follow selection
Habit | Cached salience paths
Instinct | Hard-coded salience weighting

### Failure modes
Understanding breakdowns clarifies the mechanism.
	•	Trauma → threat salience dominates all other affordances
	•	ADHD → unstable or noisy salience weighting
	•	Depression → flattened salience landscape (nothing pulls)
	•	Mania → runaway salience amplification
	•	Addiction → hijacked salience prioritization

## Salience Is the Primary Success Criterion

This Second Brain exists to improve salience.
If it does not reliably help determine what matters next, it has failed — regardless of how well it captures, organizes, or summarizes information.

### What This System Must Do

The Second Brain must function as an external salience-support system. Its job is not to store everything, but to:
	•	Continuously surface what is most critical right now
	•	Collapse overwhelming information into a small set of actionable priorities
	•	Guide action selection, not just reflection or recall
	•	Protect attention and energy by filtering noise, backlog, and low-viability options
	•	Re-orient me when salience degrades (overwhelm, avoidance, fixation, drift)

In other words:

The system must help answer “What should I do next?” more clearly than my unaided mind can.

### What “Success” Means

This system is successful only if:
	•	I regularly see the right things rise to the top without effort
	•	Important projects do not silently stall
	•	Urgent or time-sensitive tasks cannot hide in the noise
	•	Follow-ups with people resurface at the right moment
	•	The system reduces decision friction rather than adding review overhead
	•	I act more consistently on what I care about, with less cognitive strain

If the system captures data but fails to change action, it is not a Second Brain — it is an archive.

### What the System Is Explicitly Not
To protect salience, the system must avoid becoming:
	•	A comprehensive knowledge base
	•	A memory dump with no prioritization
	•	A dashboard full of equally “important” items
	•	A productivity theater tool that looks impressive but doesn’t move life forward

Completeness is a liability.
Selective pressure is the feature.

### Design Principle for All Automations & Prompts
When making any design decision, prompt change, or automation tweak, ask:

Does this make the next right action more obvious?

If the answer is no, the change should not be made.

Salience outranks:
	•	elegance
	•	completeness
	•	cleverness
	•	flexibility

This system exists to orient, not to impress.

### Summary
**Salience is the core function. Everything else is support.**

A Second Brain that does not reliably surface what matters next — what is most urgent, most stuck, or most leverage-bearing — is a failure, regardless of how well it captures or organizes information.

## Building From What Works
While the second brain system described above describes a technical architecture, its not exactly what I want to build. There are elements to planning life and salience selection and management that I find to be asbolutely critical that I want to include in a personalized system.

### 7 Habits: Mission, Roles, Goals, Priorities (Salience Over the Long Horizon)

My key takeaway from The 7 Habits of Highly Effective People is not “productivity.” It’s salience management across time.

In the moment, salience is pulled by whatever is loud, urgent, or emotionally charged. The 7 Habits approach is a counterweight: it creates long-term orienting inputs—mission, values, roles, and goals—that keep salience aligned with will, even when the arena is noisy. Writing down mission statements, values, roles, and goals is a way of projecting salience far into the future horizon so that day-to-day action selection stays pointed toward what matters most.

The core ideas I’m pulling forward are:
	•	Begin with the end in mind. If you don’t have a clear sense of where you’re going, you can’t plan—because you don’t know what “relevant” means.
	•	Make your will explicit. A personal mission statement or vision is a written artifact that captures deeper desires and direction. It’s critically important, but it fades into the background unless it is revisited and used as an orienting reference.
	•	Clarify values and priorities. Values determine what wins when priorities conflict. Without them, salience defaults to urgency, habit, or mood.

A major practical tool here is the Eisenhower matrix, especially the discipline of prioritizing what is important but not urgent:
	•	Many tasks are urgent and important; they must be done.
	•	But the important-not-urgent category is where growth, stability, relationship depth, and long-term success are built.
	•	This requires actively carving out space for those actions every week, because they will not be selected by default salience.
	•	It also requires minimizing time spent on urgent-but-not-important tasks and eliminating, as much as possible, time spent on things that are not important and not urgent.

Any Second Brain system that is effective for me must support this long-horizon salience layer. It must make it possible to document and revisit:
	•	Mission / vision (who I’m becoming, what I’m aiming at)
	•	Values (what I refuse to sacrifice; what governs tradeoffs)
	•	Roles (the domains of life that matter, and what “good stewardship” looks like in each)
	•	Goals (what I’m building or changing, and why)
	•	Priorities (especially protecting important-not-urgent actions)

#### Cadences and Horizons
This Second Brain needs to treat salience as a multi-horizon system:
	•	Long-term (yearly cadence): Mission and values are relatively stable. They can evolve, but slowly. They should be revisited intentionally—often best in a yearly review—because they are the deepest orienting inputs for salience.
	•	Medium-term (quarterly cadence): Roles and goals change more frequently. Some roles are stable (e.g., I’m always a dog dad), but what I prioritize within that role can shift. Friends enter and leave. Work changes. New responsibilities appear. The system should make it easy to review and revise roles/goals quarterly.
	•	Short-term (less than quarterly): This is the stream of everyday life—the operational layer where GTD and bullet journal patterns work well. These items are ephemeral and should be held lightly. Some are urgent and important (taxes, registration, property upkeep, commitments). Others will fall away as context changes, and that’s fine. This layer exists to keep the “guts of life” moving without consuming the whole salience budget.

The purpose of all of this is simple:

The Second Brain must help my salience system stay oriented toward my long-term will, not just my short-term pressures.

Without mission, values, roles, and goals functioning as active orienting inputs, the system will drift into a reactive mode—busy, but not aligned.

### From David Allen / Getting Things Done

#### Operational Salience: Clearing Overwhelm and Making Action Obvious

What I take from David Allen and Getting Things Done is a set of non-negotiable rules for operational salience. GTD is not about long-term direction or values; it is about preventing the salience system from being overwhelmed by unresolved, ambiguous, or poorly defined obligations.

Uncaptured tasks, vague commitments, and falsely “simple” projects generate constant background salience. Even when I’m not working on them, they compete for attention and energy. GTD works because it systematically removes this noise, allowing meaningful priorities to surface and action to occur without friction.

The core GTD principles I’m carrying forward are:
	•	Get everything out of your head and into an inbox.
The mind should not be a storage system. Anything that must be remembered but is not yet acted on should live outside the brain. Once captured, it no longer needs to pull salience.
	•	Use visible inboxes and outboxes.
Physical or digital inbox/outbox structures create environmental salience: things enter, things leave, and completion is reinforced. This prevents silent accumulation and hidden backlog.
	•	Apply the two-minute rule aggressively.
If something can be done in two minutes, it should be done immediately rather than tracked. Tracking trivial actions wastes salience capacity and increases cognitive load.
	•	Maintain a strict distinction between tasks and projects.
A task is a single, concrete, unambiguous action that can be done immediately.
A project is anything that requires more than one step—no matter how simple it appears.

Most overwhelm occurs when projects are treated as tasks. When that happens, salience detects complexity without clarity, and the result is avoidance, delay, or anxiety.

#### Projects Are Hidden Complexity

People dramatically underestimate how many steps most projects contain. What feels like “just do the thing” often turns out to be a sequence of dependent actions, unknown requirements, and scheduling constraints that only reveal themselves over time.

For example:
“I need to get a patient advocate / care coordinator from my insurance company.”

This initially feels like a single task: call insurance. In reality, it’s a project with multiple sub-projects and hidden event horizons:
	1.	Clarify what is required to obtain a patient advocate (initial research).
	2.	Identify the correct contact method, department, phone number, and hours.
	3.	Schedule sufficient uninterrupted time during business hours.
	4.	Determine whether CPT or ICD-10 codes are required.
	5.	If so, confirm whether I have the correct codes or need to obtain them from a provider.
	6.	Explore alternate channels (chatbots, messaging) and prepare accordingly.

What appeared simple is actually a layered project whose later steps cannot be planned until earlier ones are completed.

#### What the Second Brain Must Do at This Layer

From this GTD layer, the Second Brain must function as a salience-clearing and action-clarifying system. Its responsibilities are not optional.

Specifically, the system must:
	•	Act as a trusted external inbox.
I must be able to put something into the system and know I no longer need to hold it in mind. If the system cannot be trusted to hold commitments, it fails this layer.
	•	Differentiate tasks from projects automatically or explicitly.
Anything that cannot be completed in a single step must be treated as a project, not a task. The system should resist vague “do the thing” entries.
	•	Require concrete next actions.
Every active project must have a clearly defined, executable next action. If no next action is defined, the project is effectively invisible to salience.
	•	Break complexity into approachable steps.
The system should support decomposing projects into smaller actions that reduce friction and make progress possible, even when the ultimate work is difficult or time-consuming.
	•	Prevent trivial work from polluting salience.
Two-minute tasks should be completed quickly and not linger as tracked items unless truly necessary.
	•	Reduce background cognitive load.
By externalizing, clarifying, and structuring obligations, the system should quiet the constant “don’t forget” signals that interfere with focus and decision-making.

#### Why This Layer Is Non-Optional

This GTD layer is the foundation of the entire Second Brain. Without it:
	•	Higher-level priorities and values are drowned out by noise
	•	Important-but-not-urgent work never surfaces
	•	Salience is dominated by anxiety rather than intention
	•	Action selection becomes effortful and inconsistent

In salience terms:

Getting Things Done exists to clear the salience field so that the right action can be selected without resistance.

This is where the rubber meets the road. If this layer fails, no amount of vision, values, or strategy will matter—because nothing will reliably get done.

### From Bullet Journal (BuJo)

#### Salience in Motion: Life as a Stream, Not a Backlog

Bullet Journal has been one of the most effective systems I’ve ever used because it already integrates key ideas from 7 Habits and Getting Things Done—but adds something crucial: a correct model of time, change, and salience.

The core insight of BuJo is this:

Life is a stream, not a static list.
Salience is contextual, temporal, and revisable.

A task list is not a mission statement.
It is a snapshot of what was salient at a particular moment, given a particular context. If the context changes, salience should change. An item going undone is not a moral failure or a system failure—it may simply mean that the world moved.

BuJo works because it treats plans as lightweight commitments, not eternal obligations. It makes it easy to stop, reassess, cross something off, and move forward without guilt or system collapse.

#### Life as a Stream (and Why This Matters for Salience)

BuJo assumes:
	•	Priorities shift
	•	Energy fluctuates
	•	New information arrives
	•	Some things decay naturally if not acted on

What matters is not perfect execution, but continuous re-orientation.

A healthy salience system must:
	•	Allow items to be abandoned cleanly
	•	Make reprioritization cheap
	•	Avoid punishing missed intentions
	•	Preserve momentum even after interruptions

This is why BuJo is so resilient when you “fall off.” The system is designed for resumption, not perfection.

#### Modularity: Multiple Time Horizons, One System

BuJo is modular by design. Instead of one monolithic list, it uses distinct modules aligned to different salience horizons. These modules can be indexed, referenced, and recombined as needed.

The core modules I find essential are:

1. Index — Orientation Layer

A map of what exists in the system.
This is not about content, but where to look.

Salience function: re-orientation and recall.

⸻

2. Semi-Annual / Future Log — Distant Horizon

A six-month view where major events, travel, and long-range commitments live. This gets revisited during monthly planning and updated as needed.

Salience function: long-range constraint awareness.

⸻

3. Monthly Planning — Medium Horizon

A monthly spread that includes:
	•	A simple calendar (one line per day)
	•	A list of priorities, intentions, or goals for the month
	•	Optional lightweight metadata (habit tracking, health markers, etc.)

This is where higher-level projects are tracked at a glance, even if their detailed steps live elsewhere.

Salience function: mid-range goal alignment.

⸻

4. Weekly Planning — Near-Term Alignment

A weekly spread where I integrate:
	•	Roles and goals (from 7 Habits)
	•	Importance vs urgency (Eisenhower)
	•	Realistic energy and time constraints

This is where intention meets reality.

Salience function: translating values into near-term action.

⸻

5. Daily Entries — Event Stream

The most stream-like part of the system.

Each day:
	•	Tasks
	•	Events
	•	Appointments
	•	Notes
	•	Ideas
	•	Reflections

Simple signifiers distinguish types (task, note, idea, event) and importance.

You could run only this layer if needed. It’s fast, forgiving, and flexible.

Salience function: moment-to-moment capture and action.

⸻

6. Project Spreads — Complexity Containers

Flowing directly from GTD, project spreads are dedicated spaces for:
	•	Multi-step work
	•	Task breakdowns
	•	Notes and research
	•	Dependencies and context

They live in the index and are referenced from other spreads.

Salience function: containing complexity so it doesn’t leak everywhere.

⸻

7. Journaling & Tracking — Meaning and Memory

Free-form or structured entries for:
	•	Emotional processing
	•	Life documentation
	•	Reflection
	•	Health and habit tracking (e.g., blood pressure, ratings, logs)

These become invaluable during review rituals.

Salience function: sense-making and pattern recognition.

#### Review Rituals: How Salience Is Maintained Over Time

BuJo relies on regular rituals, not rigid enforcement. These rituals are what keep salience accurate.
	•	Daily: quick capture; optional reflection
	•	Weekly: review what’s coming up and what’s stuck
	•	Monthly: decide what to carry forward and what to release
	•	Longer horizons: deeper reflection and re-orientation

Crucially, BuJo requires intentional pruning.

At review points, items are not blindly migrated. They are felt into. If something:
	•	No longer feels right
	•	Has no real-world consequence
	•	Doesn’t align with current priorities

…it is crossed off and released.

This is not procrastination.
It is salience hygiene.

#### What the Second Brain Must Take from BuJo

From Bullet Journal, the Second Brain must inherit these properties:
	•	Treat information and commitments as a stream, not a static backlog
	•	Make abandonment and reprioritization easy and explicit
	•	Support multiple time horizons (daily → weekly → monthly → longer)
	•	Separate capture from commitment
	•	Use review rituals to refresh salience, not enforce guilt
	•	Allow fast resumption after lapses
	•	Surface patterns over time, not just tasks

If the system becomes brittle, punitive, or backlog-obsessed, it has failed this layer.

#### Seasonality and Natural Cycles (Optional, but Deeply Resonant)
Something I’m actively considering is extending BuJo’s time horizons beyond the standard month to align with natural cycles. I would keep daily and weekly planning, shortening the Sunday ritual, but rather than operating monthly, I would operate fortnightly to align with the moon and seasonally to align with solar cycles.

Two complementary calendars:

1. Lunar Cycles — Internal / Esoteric
	•	Fortnightly rhythm (new moon → full moon)
	•	Sowing intentions at the new moon
	•	Harvesting and integrating at the full moon
    *   Increasing energy and effort after the new moon to try new things, decreasing it after the full moon to ingetrate
	•	Tracking six-month arcs when the moon returns to the same sign, focusing on the archetype of that sign to ensure personal growth across different aspects of my life.

This supports internal growth, energy management, and archetypal reflection.

⸻

2. Solar Cycles — External / Exoteric
	•	Six-week planning intervals aligned with solar stations
	•	Solstices and equinoxes as major gates
	•	Cross-quarter days as checkpoints

This supports seasonal goal setting and embodied alignment with the year.

The solar calendar is outward-facing: work, projects, commitments.
The lunar calendar is inward-facing: growth, meaning, integration.

#### Why BuJo Belongs in This System

In salience terms:

BuJo teaches the system how to move through time without breaking.

It ensures that salience can evolve as reality evolves—without losing continuity, agency, or self-trust.

If the Second Brain can do that, it will stay alive.

### Basket Sort Practice (Somatic + Cognitive)

This practice is a **somatic–cognitive processing method** for clarifying action and reducing overwhelm. It intentionally separates **felt response** from **conceptual importance**.

* **Push / Pull / Ambivalence** is the *somatic layer* — how your body and nervous system respond.
* **Importance** is the *cognitive layer* — whether something has real consequences.

The practice works by honoring **both layers in order**, without letting either dominate.

---

#### Core Questions (Always in This Order)

1. **As I notice this item, do I feel pulled toward it, pushed away from it, or ambivalent?**
   *(Somatic sensing)*

2. **If I don’t do this, does anything important actually break?**
   *(Cognitive processing and consequence check)*

---

#### Step 1: Capture into the Basket

Anything that occupies attention can be placed in the Basket:

* tasks, invitations, responsibilities
* ideas, worries, guilt loops
* internal pressure ("I should…", "I meant to…")

Capture is neutral. The Basket is a temporary holding space, not a commitment.

---

#### Step 2: Somatic Sorting (Push / Pull / Ambivalence)

Review each item **one at a time** and pause briefly.

Notice:

* body tension or release
* energy increase or drain
* urge to lean toward, lean away, or shut down
* emotional tone (interest, dread, confusion, flatness)

Then name the felt response:

* **Pull** — curiosity, energy, desire, interest
* **Push** — resistance, dread, avoidance, contraction
* **Ambivalent** — mixed signals, numbness, confusion, “I can’t tell”

This step is about **noticing**, not deciding. Feelings are data.

---

#### Step 3: Cognitive Importance Check

After the felt response is clear, ask:

> **If I don’t do this, does anything important actually break?**

“Important” refers to real consequences:

* legal or financial requirements
* time-bound commitments
* health or safety impacts
* relationships or values you actively choose

“Important” does *not* include:

* guilt or self-judgment
* habit or inertia
* imagined expectations
* past intentions that no longer apply

Answer plainly, without justification.

**A Note On Ordering and prioritization**

When reviewing a list, process items in this sequence:

1. Items identified as **Pull**
2. Then items identified as **Push**
3. **Ambivalent items last**

Ambivalent items require the most cognitive effort and should not be allowed to dominate attention or consume disproportionate processing time.

---

#### The Five Outcomes

##### 1) Pull + Important

Somatic draw and real consequence align.

These are true signals.
Protect them and build structure around them.

---

##### 2) Pull + Not Important

Somatic draw without real consequence.

These are optional pleasures or distractions.
They may be enjoyed deliberately, limited, or ignored without guilt.

---

##### 3) Push + Important

Somatic resistance with real consequence.

These are obligations or chosen commitments.
Handle them by reducing friction, not by waiting for motivation.

---

##### 4) Push + Not Important

Somatic resistance without real consequence.

These are unnecessary burdens.
Drop them cleanly.

---

##### 5) Ambivalent (Somatic Uncertainty)

Ambivalence means the body is not giving a clear signal and/or the mind cannot determine importance.

Ambivalence should generally be met with **skepticism** and a **default posture of dropping**.

Items that are ambivalent must demonstrate **clear, concrete importance** to be kept. If importance cannot be established, they should be dropped.

This reflects the assumption that:

* truly important things tend to reassert themselves
* urgency and clarity increase when consequences are real
* there is already more important action than can be acted on

Because of this, ambivalence is treated as a **decision funnel**, not a place to linger.

###### Clinical / Theoretical Note on Ambivalence

Ambivalence often does not reflect true neutrality about an item, but **noise or interference in the somatic signal**. Feelings of pull or push may be obscured by guilt, shame, internalized expectations, or other people’s values. An intrinsic pull can be covered over by a critical or shaming voice (“I shouldn’t want this”), and an intrinsic push can be overridden by obligation (“I should want this”).

In these cases, somatic data is unreliable or internally conflicted. The only clear information available is the **importance test**. If something is important, it resolves to *Push + Important*. If it is not important and no clear somatic signal is available, it is not actionable and is best dropped rather than consuming ongoing attention.

This posture conserves cognitive and emotional energy while trusting that truly important matters tend to reassert themselves later with greater clarity or urgency.

Clinically, ambivalence is often a productive **entry point for therapy**, rather than a problem to solve inside this practice. Approaches such as values clarification (ACT), learning to notice and trust somatic signals, and differentiating one’s own voice from internalized others (e.g., CBT- or IFS-informed work) can reduce signal contamination over time. As this work progresses, fewer items fall into the ambivalent category to begin with.

---

#### Practice Notes

This practice can be used:

* during regular planning sessions (reviewing task lists, ideas, commitments, desires)
* in the moment, whenever a decision needs to be made

The process is always the same:

1. Notice the somatic response
2. Check importance
3. Prioritize accordingly

**Prioritization rules:**

* Always prioritize what is **important**
* Prefer **pull** over push when importance is equal
* Drop what is **not important** or remains ambiguous

---

#### Minimal Version

1. **How does my body respond — pulled, pushed, or unsure?**
2. **If I don’t do it, does anything important actually break?**

Somatic clarity first.
Cognitive clarity second.

#### How the Basket Sort Practice Interfaces with the Second Brain

The Second Brain is an **LLM-based cognitive system**, not a somatic one. It cannot feel, sense, or substitute for embodied knowing. However, it **must be designed with the assumption that somatic processing is primary** in my decision-making, and that cognitive prioritization comes *after* felt clarity.

Its role is not to decide *for* me, but to **support, prompt, and scaffold the practice**—especially when salience is degraded by overwhelm, noise, or ambiguity.

**Core Interface Principle**

> The Second Brain does not generate salience.
> It helps **restore conditions under which salience can be accurately felt and interpreted**.

---

##### What the Second Brain Must Do

###### Detect Overwhelm and Salience Breakdown

The system should recognize common indicators of degraded salience, including:

* Large numbers of unresolved tasks or projects
* Repeated resurfacing of the same items without progress
* High capture volume with low completion
* Ambiguous or vague next actions
* Expressions of confusion, avoidance, dread, or paralysis
* Conflicting priorities with no clear ranking

When these patterns appear, the Second Brain should **suggest the Basket Sort Practice explicitly**, rather than attempting further optimization or prioritization.

Example intervention:

> “There’s a lot competing for attention right now. Would it help to do a Basket Sort to separate felt response from importance before we prioritize?”

---

###### Treat the Basket as a Neutral Holding Space

When items are placed into the system during overload, the Second Brain must treat them as **non-commitments**.

* Capture does *not* imply obligation
* Undone items are not failures
* Repeated appearance does not automatically imply importance

The system should avoid language that frames backlog as moral debt (e.g., “overdue,” “behind,” “should have”).

---

###### Ask the Right Questions (In the Right Order)

When supporting prioritization or review, the Second Brain should:

1. **Ask for somatic categorization first**, without interpretation:

   * “As you look at this, do you feel pulled toward it, pushed away from it, or unsure?”

2. **Record the response verbatim** (Pull / Push / Ambivalent), without correcting or reframing it.

3. **Only then prompt the importance check**:

   * “If you don’t do this, does anything important actually break?”

This ordering is critical. The system must not collapse somatic data into cognitive importance prematurely.

---

###### Maintain, Track, and Update Mission, Values, Roles, and Goals

The Second Brain must not treat mission, values, roles, and goals as static reference material or occasional context. It must **actively maintain an internal, evolving cognitive model** of these elements over time.

This includes:

* Storing explicit mission statements, values, roles, and goals as first-class entities
* Updating these representations when I revise, restate, or contradict them
* Tracking when items are reaffirmed, modified, deprioritized, or abandoned
* Preserving historical versions to support reflection over time

This tracking should be **largely invisible in day-to-day use**, but the system must operate under the assumption that I can inspect its reasoning at any time. As a result, all internal representations and updates must be **non-judgmental, descriptive, and reversible**.

The purpose of this tracking is not enforcement or consistency checking, but **orientation**.

---

###### Use Tracked Mission, Values, Roles, and Goals as Cognitive Salience Inputs

When prioritizing tasks, surfacing actions, or suggesting focus areas, the Second Brain should actively use its maintained model of:

* Mission and long-term direction
* Current and historical values
* Active and latent roles
* Short-, medium-, and long-term goals

These should function as **cognitive salience weights**, shaping what the system considers important or worth surfacing.

Example check-in:

> “Given your stated priority around health and your role as a caregiver, this is currently being weighted as important. Does that still feel right?”

The system should always present this as a **tentative orientation**, not a directive.

---

###### Infer, Update, and Contrast Values, Roles, and Goals from Behavior

In addition to explicit statements, the Second Brain should continuously infer values, roles, and goals from observed behavior, including:

* What I consistently choose to act on
* What I repeatedly delay, avoid, or abandon
* Where time, energy, and attention actually go
* Which commitments persist across context changes

These inferences should be **stored alongside explicit declarations**, not merged with them.

The system must preserve the distinction between:

* *Declared* values and goals (what I say I want)
* *Inferred* values and goals (what my behavior suggests)

This distinction is critical for later reflection and review.

---

###### Act as a Living, Non-Judgmental Mirror

When salience is unclear, conflicted, or degraded, the Second Brain should use its maintained cognitive model to act as a **living mirror**.

This includes:

* Reflecting back what I have said matters to me in the past
* Reflecting back what I have actually prioritized in practice
* Naming tensions between aspiration and behavior
* Offering hypotheses about importance or misalignment

All such reflections must be framed as **questions or observations**, never conclusions.

Example framing:

> “You’ve described wanting to orient more toward creative work, but most recent actions have clustered around stability and care. Would you like to explore whether this reflects a change in priorities or unresolved push?”

The system must always defer to my current judgment and choice.

---

###### Support Review Rituals with Longitudinal Insight

During weekly, monthly, quarterly, or yearly reviews, the Second Brain should actively draw on its tracked cognitive model to surface:

* Changes in stated mission, values, roles, and goals over time
* Persistent gaps between aspiration and action
* Areas where importance has been cognitively affirmed but somatically resisted
* Values that appear intrinsic vs. values that appear externally imposed

These insights should be presented gently, with the explicit aim of **clarity and self-recognition**, not correction or optimization.

---

###### Infer Values, Roles, and Goals from Behavior

In addition to explicit statements, the Second Brain should treat **repeated action and inaction as data**.

It should quietly infer patterns such as:

* What I consistently make time for
* What I reliably avoid or delay
* Which projects receive follow-through
* Where energy appears to be invested despite stated priorities

These inferred patterns should **never override explicit choice**, but they should be retained as background context for reflection.

---

###### Act as a Non-Judgmental Mirror When Signal Is Mixed

When salience is unclear or conflicted, the Second Brain may serve as a **reflective mirror**.

This includes:

* Reflecting back past statements, commitments, or priorities
* Naming apparent tensions between stated values and observed behavior
* Offering a tentative prioritization hypothesis

This must always be done:

* Without judgment
* Without pressure
* Without assuming correctness

Example framing:

> “You’ve previously said this mattered to you, and you’ve made time for similar things before. Does that still feel important, or has something shifted?”

The system should always defer to my current judgment.

---

###### Track Aspirational Identity vs. Lived Behavior

Over time, the Second Brain should maintain a **background distinction** between:

* Who I say I want to be (aspirations, values, identity statements)
* How I actually act (patterns of behavior and follow-through)

This is not for correction or optimization, but for **clarity**.

During review periods (weekly, monthly, quarterly), the system may surface gentle observations such as:

* Persistent gaps between aspiration and action
* Areas where push appears repeatedly despite stated importance
* Values that appear lived vs. values that appear externally imposed

Example reflection:

> “You’ve described wanting to be this kind of person, but actions here have been consistently delayed. Would you like to explore whether this goal is intrinsic, extrinsic, or no longer relevant?”

The aim is self-recognition, not self-improvement pressure.

---

###### Default Toward Dropping Ambivalence

If I express ambivalence and cannot clearly establish importance, the Second Brain should **support dropping the item**, not retaining it “just in case.”

This includes:

* Suggesting that the item be crossed off
* Reframing dropping as a legitimate decision
* Trusting that important things reassert themselves

Example language:

> “Since this feels ambivalent and there’s no clear consequence, it may be best to drop it for now. If it’s truly important, it will likely come back with more clarity.”

The system should resist the instinct to *resolve* ambivalence through analysis. Ambivalence is a signal to **reduce load**, not increase reasoning.

---

###### Reduce Friction for Push + Important Items

For items that are somatically resisted but cognitively important, the Second Brain should:

* Help break them into smaller, lower-friction steps
* Suggest environmental or structural supports
* Avoid exhortation or pressure

The goal is not to make them *feel good*, but to make them *possible*.

---

###### Normalize Letting Go

The Second Brain should actively reinforce that:

* Dropping items is part of healthy salience regulation
* Changing priorities is expected as context evolves
* The system is designed for revision, not consistency

This is especially important during reviews, where guilt narratives often appear.

---

##### What the Second Brain Must Not Do

* Override somatic data with logic
* Treat backlog as evidence of failure
* Optimize for completion rate over alignment
* Push ambivalent items forward by default
* Confuse “previous intention” with “current importance”

---

##### Summary: Division of Labor

**I provide:**

* Felt response (pull / push / ambivalence)
* Final judgment of importance
* Somatic truth

**The Second Brain provides:**

* Structure
* Memory
* Pattern recognition
* Gentle prompting
* Cognitive cross-referencing
* Load reduction

Together, the goal is simple:

> **Protect salience, conserve energy, and act on what actually matters.**

If the system supports that—even imperfectly—it is doing its job.

## Technical Requirements

I love the Second Brain conceptually as described in the original technical doc, but I have several personal requirements that shape the implementation.

### Data ownership is non-negotiable

All meaningful Second Brain data must be **first-party**, **portable**, and **recoverable**.

* The canonical store of truth is a **GitHub repo** (or Git repo) I control.
* Data must be stored as **plain text** (primarily Markdown), with **JSON/YAML** used when structure is required.
* The system must be designed so I can **migrate between platforms** (Slack → Discord, Google Calendar → iCloud, Zapier → Make, etc.) without losing continuity.

Third-party platforms are allowed as *interfaces* and *execution environments*, but not as the only place the data lives.

**Rule:** external tools are *clients*; the repo is the *source of truth*.

---

### Prefer off-the-shelf tools for UX and automation

I do **not** want to build or maintain a custom UI (mobile app, web app, bespoke dashboard).

I want to rely on off-the-shelf tools to:

* capture thoughts quickly (low friction)
* chat with the Second Brain when needed
* integrate with calendar and communication channels
* run automations now, and later potentially orchestrate agents

The goal is low maintenance, high reliability, and minimal bespoke surface area.

---

### Push out to third-party systems, write back to the repo

Even when the system creates objects in external platforms (calendar events, reminders, messages), the repo must contain the corresponding records.

Examples:

* If an event is created in Google Calendar, the event spec should also exist in the repo in a structured form (YAML/JSON), with IDs for sync.
* If a task is created in Notion, the canonical task record should still exist in the repo (and Notion becomes a view).
* If conversations happen in Slack, the system should capture durable summaries and/or logs back into the repo.

This ensures continuity and platform independence.

---

## Repository Structure

The repo should be split into two major sections:

### Second Brain Data Layer (canonical life archive)

This is the durable record of:

* captures / notes / journal stream
* mission / values / roles / goals
* plans (daily/weekly/monthly/seasonal)
* key decisions, reflections, reviews
* the Second Brain’s internal working memory artifacts (non-judgmental, inspectable)

#### Format preferences

* Markdown for freeform: notes, plans, reflections, checklists, reviews
* YAML/JSON for structured objects: events, entities, schemas, state snapshots
* Date-oriented directories for stream-based material

#### Suggested high-level structure (illustrative, not final)

* `data/`

  * `identity/` (mission, values, roles, goals; stable-ish)
  * `planning/` (year/month/week/day; short-horizon stream)
  * `journal/` (freeform entries, reflections, reviews)
  * `entities/` (people, projects, concepts; optionally structured)
  * `system/` (LLM-maintained notes, memory state, non-judgmental mirrors, audit logs)

#### Salience rules for retrieval

* Pull from the **most recent** stream data by default (today/week/month)
* Always include the **identity layer** (mission/values/roles/goals) as an orienting prior
* Maintain an LLM-editable workspace for its own notes and evolving cognitive model
* Prefer relevance over completeness; keep “active context” small and current

---

### Source Code Layer (prompts, automation, glue)

This contains everything that *operates on* the data layer:

* prompts (classification, digest, review, mirror-mode, basket-sort support)
* automation definitions (Zapier/Make configs where possible)
* scripts/glue code for syncing, exporting, importing, and transformations
* schema definitions and validation (if needed)

#### Principles

* Prefer automation-as-code when possible (exportable JSON, API-pushed configuration)
* Prompts live here, version-controlled
* Code **writes into the data layer**, never the reverse
* The data layer must remain usable even if the code layer is replaced

---

### Summary

* Off-the-shelf tools for capture/chat/automation: **yes**
* Custom UI and heavy maintenance burden: **no**
* Canonical truth in a **portable text repo**: **required**
* Two-layer repo split:

  * **Data layer** = life archive + LLM memory + planning stream
  * **Code layer** = prompts + automations + sync glue
