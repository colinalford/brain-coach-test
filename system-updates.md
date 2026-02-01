# System Updates
I want to build an AI powered second brain. The guts of it are already here, but it isn't working correctly. There are some major gaps we missed in the build out.

You can look at the exisitng application documentation to understand the goal. 

This was inspired by another second brain project that I then modified for my own needs. However, in the translation some of the key engineering aspects were lost.

## Critical Engineering Concepts
1. The Drop Box

Technical terms: capture door, ingress point, input channel

This is the one place you throw things without thinking. It has to be frictionless—if capturing a thought takes more than a few seconds, you won’t do it consistently despite your good intentions. That’s not a moral failing; it’s human nature.

In this system, the drop box is a private Slack channel called something like sb-inbox. One message per thought. No organizing, no tagging, no decisions. You type it and you hit send.

Here’s the critical constraint: you’re not allowed to have three capture points. You have one, and it requires zero decisions.

Why does this matter? Because every additional capture point is a decision you have to make in the moment. “Should I put this in my notes app or my Slack channel or my email draft?” That decision, made fifty times a day, is exhausting. It’s the kind of micro-friction that kills systems over time.

One inbox. One action. One habit. That’s it.

2. The Sorter

Technical terms: classifier, router, categorization layer

This is the AI step that decides what bucket your thought belongs in without you having to think about it. Is this about a person? A project? An idea? Some admin errand you need to run?

The sorter is why this system is different from every note-taking app you’ve abandoned.

The number one reason second brains fail is they require taxonomy work at capture time. They force you to decide where something goes. And for non-engineers, that decision is where systems go to die. It’s the blank canvas problem, the perfect structure fantasy, the slow drift into fiddling with folders instead of actually capturing thoughts.

The sorter removes all of that. You throw a raw thought at your Slack channel. Zapier picks it up and sends it to Claude or ChatGPT with a classification prompt. The AI figures out what it is, extracts the relevant details, names it something useful, and returns structured data.

Classification is a solved problem in 2026. You give the model a clear schema and examples, and it routes accurately the vast majority of the time. Let it do the sorting so you don’t have to.

3. The Form

Technical terms: schema, data contract, record structure

This is the set of fields your system promises to produce and store for each type of thing.

For a person in your People database: name, context (how you know them), follow-ups (things to remember for next conversation), and a timestamp for when the entry was last updated.

For a project in your Projects database: name, status (active, waiting, blocked, someday, done), the literal next action you need to take, and any relevant notes.

For an idea: a title, a one-liner that captures the core insight, and space for elaboration.

For an admin task: name, due date, status, notes.

Why does this matter? Because without a consistent form, you get messy notes that can’t be reliably queried, summarized, or surfaced. Claude can’t generate a useful daily digest if every entry is structured differently. The form is what makes automation possible. It’s what lets the system compound like a flywheel.

Think of the form as a contract between you and your future self. Every time you capture something, you’re promising that certain information will be there when you need it. The AI fills out the form; you benefit from the consistency.

4. The Filing Cabinet

Technical terms: memory store, source of truth, persistence layer

This is where the system writes facts so they can be retrieved later. It has to be writable by automation, readable by humans, and able to support simple filters and views.

In this system, the filing cabinet is Notion—specifically, four databases: People, Projects, Ideas, and Admin.

Why Notion? Because Notion databases are visual and easy to edit without breaking anything. You can create different views filtered by status, by date, by tags. When something goes wrong, you can see what happened and fix it directly. And critically, Notion has a solid API that Zapier can write to reliably.

This is also why I don’t recommend starting with Obsidian for this particular system, even though Obsidian is a beautiful tool. Obsidian stores everything as local markdown files, which is great for portability and ownership. But writing into local files from cloud automation introduces a layer of syncing and plumbing that engineers handle easily but often frustrates everyone else. Notion makes the automation clean. You can always migrate later if you want something local-first.

The key principle: your filing cabinet is your source of truth. When there’s a question about what’s real—what projects are active, what you promised to follow up on, what ideas you’ve captured—this is where the answer lives.

5. The Receipt

Technical terms: audit trail, ledger, activity log

This is a record of what came in, what the system did with it, and how confident it was.

The receipt matters more than you might think. You don’t abandon systems because they’re imperfect. You abandon them because you stop trusting them. And you stop trusting them because errors feel mysterious—something went wrong, but you don’t know what or when or why. You can’t predict when the next error will happen, so you give up.

The receipt fixes that.

In this system, the receipt is a Notion database called Inbox Log. Every capture gets logged there with the original text you typed, where it was filed, what it was named, and a confidence score from the AI.

Now when something looks off, you can trace it. You can see what the system decided. You can see why. Trust comes from visibility, and visibility comes from logging.

6. The Bouncer

Technical terms: confidence filter, guardrail, quality gate

This is the mechanism that prevents low-quality outputs from polluting your memory storage.

Here’s how it works: when Claude or ChatGPT classifies your thought, it also returns a confidence score between zero and one. If that confidence is below a threshold—say, 0.6—the system doesn’t file the item into People or Projects or Ideas. Instead, it logs it in Inbox Log with a status of “Needs Review” and sends you a Slack reply asking for clarification.

“I’m not sure where this goes. Could you repost with a prefix like ‘person:’ or ‘project:’ or ‘idea:’?”

This single mechanism is what keeps your second brain from becoming a junk drawer. The fastest way to kill a system is to fill it with garbage. If every half-formed thought and misclassified entry ends up in your databases, you stop trusting the data. Once you stop trusting it, you stop using it.

The bouncer keeps things clean enough that you maintain trust. And trust is what keeps you coming back.

7. The Tap on the Shoulder

Technical terms: proactive surfacing, notification layer, push mechanism

This is the system pushing useful information to you at the right time without you having to search for it.

In this system, the tap on the shoulder is a daily Slack DM that arrives at whatever time you choose—say, 7 a.m. It’s generated by a scheduled Zapier automation that queries your Notion databases, pulls your active projects, any people with noted follow-ups, and any admin tasks that are due. It sends all of that to Claude or ChatGPT with a summarization prompt and delivers a digest directly to your Slack DMs.

The digest has three parts: your top three actions for the day, one thing you might be stuck on or avoiding, and one small win to notice. It’s designed to fit on a phone screen. It’s designed to be read in two minutes, to know what matters today, and to start your day with clarity.

There’s also a weekly version. Every Sunday at 4 p.m. (or whenever you prefer), another automation runs. It queries everything from the past seven days in your Inbox Log, pulls your active projects, sends it all to Claude with a review prompt, and delivers a weekly summary. That summary tells you what happened, what your biggest open loops are, three suggested actions for next week, and one recurring theme the system noticed.

Here’s why this matters: humans don’t retrieve consistently. We don’t wake up and think, “I should search my Notion databases for relevant information about the meetings I have today.” In the advertisements for productivity tools, we do that. In real life, we don’t.

But we do respond to what shows up in front of us.

The tap on the shoulder exploits that tendency. It puts the right information in your path so you don’t have to remember to look for it. These nudges aren’t optional features—they’re what makes the system alive instead of dead.

8. The Fix Button

Technical terms: feedback handle, human-in-the-loop correction, error recovery mechanism

This is the one-step way to correct mistakes without opening dashboards or doing maintenance.

In this system, whenever Zapier files something, it replies in the Slack thread confirming what it did:

“Filed as Project: Website Relaunch. Confidence: 0.87. Reply ‘fix: [correction]’ if I got it wrong.”

If the filing was wrong, all you do is reply in the thread: fix: this should be people, not projects. The system updates the record.

Why does this matter? Because systems get adopted when they’re easy to repair.

If fixing errors feels like work—if you have to open Notion, navigate to the right database, find the entry, delete it, recreate it in the right place—you won’t do it. You’ll let errors accumulate. You’ll stop trusting the system. And then you’ll stop using it.

Corrections must be trivial or people won’t make them. The fix button makes corrections trivial.

## The twelve principles
Those are the building blocks. Now let me give you the principles that make them hold together—the rules that experienced system builders have learned the hard way. When you understand these, you can build things that don’t fall apart.

Principle 1: Reduce the human’s job to one reliable behavior.

If your system requires three behaviors, you don’t have a system—you have a self-improvement program. And non-engineers won’t run self-improvement programs consistently. The honest truth is that most engineers won’t either.

The scalable move is to make the human do one thing. In this system, that one thing is: capture thoughts in Slack.

Everything else is automation. Classification is Claude doing the work. Filing is Zapier doing the work. Surfacing is a scheduled automation. The human’s job is just to throw thoughts at the channel. That’s it.

Every time you’re tempted to add a manual step—”and then you review the entries weekly” or “and then you tag things by priority”—stop and ask: can I automate this instead? The answer is usually yes.

Principle 2: Separate memory from compute from interface.

This is the single most important architectural principle for building something that lasts.

Memory is where truth lives. In this system, that’s your Notion databases.

Compute is where logic runs. That’s Zapier and Claude.

Interface is where the human interacts. That’s Slack.

Why separate them? Because it makes everything portable and swappable.

You can change your interface from Slack to Microsoft Teams without rebuilding your databases. You can swap Claude for GPT without touching your storage. You can move from Notion to Airtable if your company mandates it.

Every layer has one job, and they connect through clear boundaries. When something breaks, you know which layer to look at. When you want to upgrade something, you can do it without rebuilding everything else.

Engineers call this “separation of concerns.” It’s the difference between a system that evolves gracefully and one that becomes a tangled mess you’re afraid to touch.

Principle 3: Treat prompts like APIs, not like creative writing.

A scalable agentic prompt is a contract. It has a fixed input format, a fixed output format, and no surprises.

You give Claude or ChatGPT a schema—”here are the exact fields I need.” You give it rules—”status must be one of these five values.” You tell it to return JSON only, with no explanation and no markdown.

That feels restrictive. That’s the point.

You don’t want the model to be helpful in uncontrolled ways. You don’t want it to add a friendly note or restructure the output because it thinks that would be better. You want it to fill out a form. Reliably. Every time.

The prompt specifies exactly what fields to return, exactly what values are valid, and exactly how to handle ambiguous cases. When the model can’t classify something confidently, it returns a specific status code, not a paragraph explaining its uncertainty.

Reliable beats creative in production systems. Save the creative prompting for brainstorming. When you’re building infrastructure, you want boring and predictable.

Principle 4: Build trust mechanisms, not just capabilities.

A capability is: the bot files notes.

A trust mechanism is: I believe the filing enough to keep using it, because I can see what happened.

Trust comes from the Inbox Log that shows you everything the system did. Trust comes from confidence scores that tell you how sure the AI was. Trust comes from the fix button that makes corrections trivial.

Without these small additions, the system would still function. But errors would compound invisibly. You’d file something wrong and not notice for weeks. You’d stop trusting the data. And once trust is gone, adoption follows.

Every time you build a system, ask: what would make someone trust this? Then build that thing explicitly.

Principle 5: Default to safe behavior when uncertain.

A real agentic system has to know how to fail gracefully.

When Claude or ChatGPT isn’t sure how to classify something, the worst thing it can do is guess. A wrong classification pollutes your database with bad data. Bad data erodes trust. Eroded trust kills the system.

The safest default is: when uncertain, don’t act. Log the item, flag it for review, and ask the human for clarification.

That’s exactly why we have a confidence threshold. When confidence is below 0.6, the system doesn’t file. It holds. It asks.

This might seem overly cautious. It’s not. It’s essential. The goal isn’t to automate everything—it’s to automate the things the system can handle reliably, and gracefully hand off the things it can’t.

Principle 6: Make outputs small, frequent, and actionable.

Non-engineers don’t want a weekly 2,000-word analysis. They want a top-three list that fits on a phone screen. Frankly, most engineers want that too.

The daily digest should be under 150 words. The weekly review should be under 250 words. That’s intentional.

Small outputs reduce cognitive load. They increase the chance you’ll actually read them. They increase the chance you’ll act on them.

Agentic systems scale when they produce outputs that are small, useful, and reliable on a set cadence. Each delivery is a breadcrumb of value that builds trust. Over time, you start depending on those nudges—not because you have to, but because they’ve earned it.

Principle 7: Use “next action” as the unit of execution.

Most project notes fail because they store intentions, not actions.

“Work on the website” is an intention. It’s not executable. When you see it on a list, you have to think about what it actually means—and that thinking is friction.

“Email Sarah to confirm the copy deadline” is an action. It’s specific. It’s concrete. You can do it without additional interpretation.

That’s why the Projects database has a field called “Next Action.” And that’s why the classification prompt is tuned to extract specific actions from vague statements. When you dump “need to make progress on the website redesign” into your inbox, the AI should return something like “Next Action: Schedule kickoff meeting with design team.”

If your project entries don’t have concrete next steps, your daily digest will feel motivational rather than operational. “You have three active projects!” is not helpful. “Email Sarah, review the mockups, call the vendor” is helpful.

Principle 8: Prefer routing over organizing.

Humans hate organizing. Or more precisely, most humans hate organizing. The 5% who genuinely enjoy building taxonomies are already well-served by existing tools. Everyone else needs a different approach.

Here’s the good news: AI is excellent at routing. You give it a small set of buckets and clear criteria, and it sorts things into the right buckets reliably.

The principle is: don’t make users maintain structures. Let the system route into a small set of stable buckets.

That’s why this system has only four categories: People, Projects, Ideas, Admin. More categories can feel more precise, but they’re harder to scale. Each additional category creates more decision surface—for the AI and for you when you’re reviewing. Four buckets is enough for most knowledge work. You can always add more later if you discover a genuine need.

Principle 9: Keep categories and fields painfully small.

This is counterintuitive for smart people. We want richness. We want nuance. We want to capture every dimension of an idea or a project or a relationship.

But richness creates friction. And friction kills adoption.

The People database has five fields. The Projects database has six fields. The Ideas database has five fields. That’s it.

You might think: but what about priority levels? What about project phases? What about linking ideas to projects?

You can add all of that later. But you shouldn’t add it at the start.

Start simple. Stay simple until you feel genuine pain that a new field would solve. “This would be cool” is not pain. “I keep losing track of X and it’s costing me” is pain.

Minimal fields mean faster entry, easier maintenance, and fewer things to go wrong. You can always add sophistication. You can’t undo abandonment.

Principle 10: Design for restart, not perfection.

A scalable system assumes users will fall off.

Life happens. You get sick. You travel. You have a brutal week at work. You forget to capture anything for ten days. That’s normal.

The question is: what happens when you come back?

If missing a week creates a backlog monster—if you have to “catch up” on everything you missed, reconcile inconsistent entries, and rebuild trust in the data—you won’t restart. You’ll just feel bad about yourself. And the system will stay abandoned.

That’s why the operating manual for this system explicitly says: don’t catch up. Just restart.

Do a 10-minute brain dump into your inbox. Whatever’s in your head right now. Don’t worry about the last ten days. Resume tomorrow.

The automation keeps running whether you engage or not. The daily digests still arrive. The system waits for you. It’s patient. It doesn’t judge. It’s just there when you’re ready to come back.

Principle 11: Build one workflow, then attach modules.

The temptation is to build everything at once. Voice capture and email integration and calendar sync and birthday reminders and meeting prep and—

Don’t.

Build the core loop first. Capture to Slack, file to Notion, get a daily digest, get a weekly review. That’s the minimum viable system. Get it running. Use it for a month. Trust it.

Then, once the core loop is solid, you can add modules. Voice capture through Slack’s mobile app. Email forwarding to your inbox channel. Meeting prep by integrating with your calendar. Birthday reminders from your People database.

Each module attaches to the core loop without modifying it. If a module breaks, the core keeps running. If you decide you don’t need a module, you remove it without disrupting anything else.

This is how professional systems are built. A stable core with optional extensions. The extensions can be experimental; the core must be reliable.

Principle 12: Optimize for maintainability over cleverness.

The engineering temptation is to build a beautiful system. Elegant abstractions. Sophisticated logic. Clever automations that handle every edge case.

The real-world reality is that moving parts are failure points.

Every additional tool is something that can break. Every additional step in your automation is something that can fail. Every clever conditional is something you’ll have to debug at 9 p.m. when it stops working.

Optimize for fewer tools, fewer steps, clear logs, easy reconnects.

When your Zapier automation stops because your Slack token expired—which will happen, every few months—you want to fix it in five minutes, not debug it for an hour. When Notion permissions get weird, you want to reconnect and move on.

That’s maintainability. That’s what makes a system last for years instead of weeks.

## What went wrong
In the effort to customize the second brain to fit what I needed, I wasn't clear in the requirements about maintaining the engineering concepts.

So while many things are done correctly, many more are not working as expected. Here's how the system should work.

Whenever I send a message through Slack, the first classifier should map it into a high level schema. I think all messages need an interface that inherits a subset of properties:
```
{
    message: any; // whatever data was sent on the message
    received: Datetime; // time message was received
    confidence_score: number; // how confident the LLM is of its output
    next_action: Action; // enum of system capabilities. the router should be able to direct based on this
    system_log: string; // Notes from the LLM on its reasoning, brief
    error?: string; // Any error state
}
```
I don't want to be too prescriptive but that seems like a good minimum.

From there, the script should receive that message back, then be able to redirect it to the appropriate subsystem. 

It should always go through some kind of confidence filter that should handle the confidence rating and also the error message. If the confidence is low or there is an error, that should be dumped into the "Needs review" flow, which would push a notification back to me for more information. 

Once it comes back to me, there should be a really easy way for me to resolve the needs review action. And once I've clarified, the item should be removed from needs reivew by the system.

While that part is kind of working now, when I've interacted back with the system, it didn't clean up the review. Whatever intermediate state it made, it didn't clean up. Any early guess it made, e.g., it created people files but had questions, when I clarified, it didn't automatically update th entry it made. It ended up creating another entry, so I had two entries representing the same person. It also treated my response as if it were a new response with no history connecting it to the fact I was responding to its needs review action. Which that's fine -- I want the system to be cognitively easy for me. But it should be able to use context clues to say "Oh, this is clarifying a needs review item, it seems related to the other one, I should update." But also -- it shouldn't have created an entity file for the person when things needed review. It should have done nothing except dump into needs review with any additional information requests for me and then notified me.

So that's sort of the complex path, what happens when the system is unsure. But even the happy path isn't working the way i want it to.

I already have a complex directory structure setup to store my data. There are entities, planning, inbox, journal, system, identity, etc. Different workflows should format messages to the appropriate schema and store them correctly. 

However, I'm really unhappy with how the systme is handling this. The schemas are much too simple. There is a kind of common schema for entities, which is fine for high level processing. But there should be a people schema that would have the kind of information a contact file would have, plus a freeform notes field. There's a places entity that should have a type of contact schema. There's a projects entity that should have a schema that makes sense for projects. 

The planning directory is like a calendar system that should have files for events that are dated. 

But the thing I need the system to do the most is broken. 

Every day, it should surface the most relevant things for me to do that day. And right now I'm getting a "null" message. I haven't added to the system this week because it was broken. And I've passed any dates that mattered. But even before, it was just giving me a giant list of tasks. And then at some point I think it took the instruction too literally to look at the task list ofr a given date and send that file. What it should be doing is generating a task list every day based on the full context of the data, then generating that file, then sending it to me. 