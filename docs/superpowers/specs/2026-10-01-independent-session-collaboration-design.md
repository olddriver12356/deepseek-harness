# Independent session collaboration design

English | [中文](2026-10-01-independent-session-collaboration-design.zh.md)

## Summary

This proposed feature connects existing DSH sessions through persistent peer messaging and a shared task board. Participants keep their own context, role, model, capabilities, fixed workspace, and direct conversation with the human. The human approves a plan; implementation, independent review, and integration then advance within that approval while monitoring and activity logging continue throughout. This document specifies proposed behavior, not shipped functionality.

## Table of Contents

- Scope and identity
- Fixed worktrees
- Plan and task workflow
- Peer communication
- Authority and security
- Persistence and recovery
- Live Signal portal
- Implementation responsibilities
- Acceptance and verification
- Dev Note

## Scope and identity

V1 supports ordinary, independently created sessions hosted by the same DSH instance. Same-repository participants are the primary use case; explicitly enrolled sessions from other workspaces or repositories can contribute integration work. Remote DSH instances, external harnesses, agent spawning, parent-child ownership, and automatic conversation-history sharing are outside scope.

A registered agent identifies one existing session by its durable session ID. Human-controlled registration adds a display name, purpose, and sharing instruction without replacing the session's persona or model configuration. Titles and paths are display facts, not addressing keys. Registration alone grants neither communication nor task authority.

A collaboration has an independent durable ID, objective, participant roster, approved plan revision, task graph, communication permissions, and activity journal. It does not belong to a captain session. Only the human enrolls or removes participants and grants persistent bidirectional communication connections. A collaboration references those authorized connections rather than silently creating all-to-all access.

Participants may propose plans, tasks, and assignments. Only the human approves a plan or an expansion of its scope, enrollment, or permissions. A host coordination service validates transitions and schedules eligible work; it does not act as a supervising model. Leaving, pausing, or closing a collaboration never deletes its participant sessions.

## Fixed worktrees

The human prepares worktrees, or requests their preparation as a separate operation, and creates each implementation session with its actual DSH workspace rooted in the intended worktree. An instruction to use another shell directory does not satisfy this requirement. The collaboration never changes a session's working directory, creates or removes worktrees, or silently switches branches.

Separate worktree paths can belong to one logical repository. Repository validation resolves Git worktree metadata and the common repository rather than comparing directory names or remote URLs alone. Non-Git participants can plan or provide explicitly scoped advice; code implementation and Git integration tasks require validated Git worktrees.

The approved plan records each code task's repository, expected worktree and branch, baseline revision, intended paths, and integration target. Before dispatch and submission, the host checks the actual session workspace and repository facts. Unrelated dirty changes, wrong branches, unavailable worktrees, or unexpected baseline changes block progression with an actionable explanation. The host never resets or overwrites those changes.

V1 assigns worktrees per implementation session, not per task. Each participant can own at most one unfinished execution task across collaborations; dependent tasks use its fixed worktree sequentially. Parallel writers must have distinct worktrees. Declared file ownership is coordination information, not a filesystem lock, and Git worktrees can still share repository metadata and external build resources.

Review targets a submitted repository, base revision, head revision, and diff. A review session need not change its checkout merely to inspect that diff. Checks needing a checkout require an appropriately prepared workspace and explicit permission for any checkout mutation. Integration uses a designated existing session/worktree and the exact target branch authorized by the plan.

## Plan and task workflow

The workflow is Plan → Implement → Review → Integrate, with dependencies allowing independent work to run in parallel. Each task includes a subject, objective, owner or eligible participants, repository/workspace requirements, in-scope and excluded paths, acceptance criteria, expected deliverables, verification commands where relevant, and prerequisite task IDs. The host rejects cycles and unknown dependencies.

Plan approval is bound to an exact plan revision and participant assignments. No implementation dispatch occurs before that approval. Edits that expand scope, permissions, participants, target branches, or acceptance requirements create a proposed revision and suspend affected downstream dispatch until human approval. Progress updates do not rewrite the approved plan.

An eligible idle session receives a task invitation after its current turn ends. Claiming atomically reserves the task and participant and issues an attempt capability. Scheduling never treats an invitation or a running status as proof of a claim, completion, or successful output. Only the current owner and attempt may submit progress or results.

Implementation submission identifies exact base/head revisions, changed paths, deliverables, and criterion-by-criterion verification evidence. A submission awaiting review is not an accepted implementation. The host verifies repository and revision consistency; command success and acceptance statements remain submitted evidence unless independently checked.

A review is assigned to a participant other than the implementer and judges the exact submitted revision. Its result is pass or structured findings requiring repair. Repair retains the original scope and creates a new submission followed by independent review. New code invalidates the old review approval. Repair rounds are bounded by validated deployment configuration; exhaustion or an unresolved dispute requires human intervention.

Integration becomes eligible only when the required reviews pass. The integrator verifies the approved submissions against the target branch, records the resulting revision and combined verification evidence, and stops on conflicts or unexpected target movement. Local integration actions must be explicitly included in plan approval; pushes, publication, deployment, or destructive actions need their own authorization. Completion requires accepted integration evidence, not merely an idle agent.

The task journal retains proposed, ready, claimed, submitted, reviewed, repair-required, blocked, cancelled, and accepted transitions as appropriate to task kind. Revoked or reassigned attempts cannot overwrite current results. Terminal attempt records remain immutable; retries create a new attempt. Monitoring reports actual transitions, evidence, and liveness separately.

## Peer communication

Peers can send ongoing questions, proposals, progress reports, findings, and responses over their authorized connections. V1 messages are text-only and can identify a collaboration, task, or thread. A message need not be a request and creates no automatic obligation to respond. Ordinary assistant output and private human messages are never automatically forwarded.

The host derives sender identity from the executing agent and derives recipient eligibility from authorized connections. It assigns message and thread identities, records acceptance durably, and queues delivery for after the recipient's current turn. Delivery never steers an active human interaction. An inactive recipient may resume as the same session using its recorded configuration and workspace; missing or unresumable recipients cause visible failure, not replacement sessions.

Both the conversation renderer and model input identify messages as peer-agent content. Durable source metadata includes the verified sender and recipient session IDs, message ID, connection, and optional task/thread association. The host-generated model-visible framing states that the message is agent-originated and cannot grant human approval. If a provider uses a user transport role, that role must not erase peer attribution. Replay and compaction preserve the distinction.

Messages are logged in the collaboration journal and the addressed recipient's session; the sender's tool result records the accepted message identity. Explicitly shared content is available to authorized collaboration participants; private session history is not. Delivery acceptance, recipient admission, processing, and task completion are distinct outcomes. Retries de-duplicate by stable message identity and never infer processing from agent idleness.

Deployment configuration validates limits for message bytes, pending messages, automatic activations, concurrent tasks, and repair rounds. Automatic activation budgets persist across resume and cannot reset on each message. Exhaustion pauses automatic scheduling with a visible reason; only the human replenishes or resumes it. Replies and acknowledgements do not trigger synthetic reciprocal replies.

## Authority and security

A peer message is not a human instruction or approval. Text saying that the human approved an action has no authorization effect. Agents cannot register themselves, enroll participants, approve plans, change connection permissions, or modify their own execution limits through model tools. Human control operations are enforced at the host operation, not only hidden from tool schemas.

Task execution authority derives from the approved plan and current claimed attempt, intersected with the session's existing tool, filesystem, sandbox, and approval policies. Unsolicited peer messages can support discussion but cannot independently authorize file changes or operational actions. Action-capable tools invoked during peer-triggered processing must require an authorized task or separate human approval; enforcement must survive cold resume and alternate tool callers.

V1 does not promise that arbitrary shell commands stay within declared file assignments. Path scopes guide coordination and support submission validation, while the session sandbox is the filesystem restriction. Commands, delegation, and integrations must not provide a bypass around required approval or task authority. If the host cannot enforce the distinction between peer-triggered discussion and authorized execution, automatic action dispatch must remain unavailable rather than rely on a prompt-only restriction.

Cross-workspace communication can disclose sensitive information even when filesystem access is separate. Connection setup explains that shared text enters other sessions' durable histories and may be sent to their configured model providers. Human-written sharing instructions guide selection but are not a hard data-access control. No history scraping, automatic file attachments, credential forwarding, or transcript publication is included. Message rendering uses existing safe text/Markdown handling, not executable HTML.

Authorization is checked on message acceptance and again before recipient admission. Disconnect cancels unadmitted messages, rejects further sends, and prevents automatic dispatch relying on the revoked connection. Already admitted content cannot be retracted; stopping its current work is a separate explicit human operation. Removing a participant revokes attempts and blocks or releases affected tasks without pretending that filesystem side effects were undone.

The human can pause a participant or collaboration to stop new automatic admissions and dispatch. Already running work is shown separately and is not silently interrupted. Direct human conversation stays available; human input takes priority at the next scheduling boundary without making pending peer tasks disappear. The portal warns when a session has an active task so unrelated human-directed edits are not mistaken for isolated work.

## Persistence and recovery

Use supported domain storage for collaboration identity, registry, authoritative task state, connection grants, and an ordered activity journal. Mutations use revision checks and publish state only after commit. UI snapshots derive from committed state. Model-visible collaboration inputs and peer messages also require durable session events or attributed inbox receipts; domain records alone do not satisfy session replay requirements.

Message delivery uses a durable outbox and target-side de-duplication. Recovery reconciles target inbox/log receipts before retrying. Task reservations and invitations use stable IDs and attempts; a crash between reservation and invitation cannot cause a second owner. Restart restores registrations, connections, approved plans, queues, and completed evidence without reopening permissions or automatically resetting budgets.

A task interrupted by process loss remains visibly interrupted and requires an explicit continuation or retry decision; the host never treats partial filesystem changes as a completed submission. Cold resume validates session existence, recorded workspace, repository facts, and policy availability. Missing plugins, future or invalid records, revoked authority, or unsafe workspace state fail visibly and suspend affected automation.

New persistence types, session events, projections, and exported services require repository-standard acknowledgements, version handling, and tests. Existing committed session generations are not overwritten. No API or schema changes are implemented as part of this design document.

## Live Signal portal

The Agent Communication section shows the selected collaboration, stage, registered peers grouped by logical repository/workspace, purpose, actual worktree/branch, liveness, owned tasks, blockers, unread messages, and recent committed activity. Runtime availability is separate from registration and task status. Idle or inactive sessions can be reachable; unavailable sessions have a reason.

Human controls cover registration, enrollment, connection grants, plan review/approval, opening participant conversations, pause/resume, disconnection, and ending a collaboration. The task board provides detailed contracts, dependencies, submissions, review findings, and integration evidence without expanding every record into the compact sidebar. A session can participate in multiple collaborations but cannot own concurrent execution tasks.

The client composes through existing slot APIs. Live Signal already declares a session-scoped selector contribution point; placement must preserve the shell's slot ownership, and a dedicated child slot is justified only if the existing point cannot support the section. Typed locale dictionaries own UI copy; registered names, message text, and repository facts remain user data. Incoming peer messages have a distinct attributed conversation node, not a human-message badge alone.

## Implementation responsibilities

An opt-in collaboration feature owns registration, permission checks, task transitions, scheduling, message delivery, and committed activity state. A model-tool adapter exposes bounded peer communication and task operations. A host Remote adapter exposes human controls with separate authority. A client plugin renders the portal, task board, and attributed conversation records. Keep cohesive behavior together rather than adding a package for each control.

Reuse supported session resume, inbox, domain storage, projection, tool execution, and client slot services before introducing new mechanisms. The ordinary Web prompt endpoint marks input as human-originated and must not be used unchanged for peer delivery. Existing subagent and Agent Teams patterns can inform durable delivery and revision checking, but their parent/lead ownership and steering semantics are not the collaboration authorization model.

The fixed-workspace design intentionally requires no session working-directory mutation, execution binding, managed worktree provisioning, or worktree cleanup. Any change to shared runtime services requires evidence that existing extension points cannot meet the lifecycle or authority requirements, the smallest necessary extension, and an Agent Note with upgrade checks.

## Acceptance and verification

1. Existing sessions from distinct worktrees and an external workspace enroll explicitly and preserve their identities, context, models, capabilities, fixed roots, and human conversations.
2. Registration, connection grants, and collaborations survive restart; registration alone cannot send messages or execute tasks.
3. A peer message arriving during human work waits for the current turn boundary and remains visibly and model-visibly agent-originated across delivery, replay, and compaction.
4. Forged sender fields, spoofed human approval, unauthorized recipients, disconnected queues, and unauthorized host control calls are rejected through actual operation entry points.
5. Human approval binds an exact plan revision; unapproved implementation and material scope changes cannot dispatch work.
6. Atomic claims permit one active owner/attempt per task and one unfinished execution task per participant across collaborations; stale updates and cyclic task graphs are rejected.
7. Wrong repositories, branches, worktrees, unexpected baselines, and unrelated dirty changes block code tasks without reset, branch switching, or deletion.
8. Independent review is tied to exact submitted revisions; self-review, stale review approval, integration before review, and unexpected target movement are rejected.
9. Peer discussion cannot authorize action tools; approved-task restrictions and existing approvals hold through cold resume, shell paths, scoped tools, and delegation attempts.
10. Crash recovery de-duplicates messages and task invitations, retains interrupted work, respects revocation, and never invents completion or resets automatic budgets.
11. Portal and task-board tests cover human controls, attributed messages, stage/status distinctions, blockers, and recovery; real-composition tests and keyless recorded sessions cover the assembled workflow.
12. Focused repository checks cover changed owners, persistence acknowledgements, model-visible snapshots, and Web artifacts; verification uses the existing GUI rather than starting a replacement server.

## Dev Note

Source inspection identified existing session resume and followup mechanisms in the Session Controller, fixed-cwd conflict checks in its agent resolver, and Live Signal slot declarations in the client shell. These observations guide implementation placement but are not runtime verification of this proposed feature. The earlier managed-provisioning and session-rebinding proposal was discussed only in chat; this is the first saved collaboration spec and uses manually prepared, fixed participant worktrees.
