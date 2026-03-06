# Intent Rules

Intent Rules let you automate how agent decisions are handled. Instead of manually reviewing every request from your AI agents, you define rules that auto-approve routine decisions, flag risky ones for review, or queue them silently.

## How It Works

When an agent makes a decision that needs confirmation (changing architecture, adding a dependency, modifying tests), Flightdeck checks your intent rules in priority order:

1. **Match** — Does the decision category match a rule? Is the agent's role in scope?
2. **Evaluate conditions** — Do any optional conditions pass (file count thresholds, context usage, etc.)?
3. **Execute action** — The matched rule determines what happens next.

### Actions

| Action | What Happens |
|--------|-------------|
| **Auto-approve** | Decision is confirmed immediately — no human review needed |
| **Require review** | Decision stays pending until you explicitly approve or reject it |
| **Auto-reject** | Decision is automatically rejected |
| **Queue silent** | Decision is queued without notification — for batch review later |

### Decision Categories

Rules match against these categories:

| Category | Examples |
|----------|---------|
| **Style** | Code formatting, naming conventions, comment style |
| **Architecture** | Component structure, data flow patterns, API design |
| **Dependency** | Adding/removing packages, version changes |
| **Tool access** | File system operations, external API calls |
| **Testing** | Adding/modifying tests, test configuration |
| **General** | Anything that doesn't fit the above categories |

## Quick Start: Trust Presets

Don't want to create rules from scratch? Use a preset:

- **Conservative** — Review everything except basic style decisions. Best when you're starting out or working on critical code.
- **Moderate** — Routine decisions (style, testing, tool access) are auto-approved. Architecture decisions still require review. Good default for most teams.
- **Autonomous** — Maximum delegation. Only architecture decisions trigger alerts. Everything else is auto-approved. Best for trusted, well-tested workflows.

Apply a preset from **Settings → Intent Rules** using the preset buttons at the top.

## Creating Rules

1. Open **Settings → Intent Rules**
2. Click **New Rule**
3. Configure:
   - **Action** — what to do when the rule matches
   - **Categories** — which decision types to match (style, architecture, etc.)
   - **Role scope** — apply to all agents or only specific roles (e.g., only Developer agents)
   - **Conditions** (optional) — additional checks like file count thresholds or context usage limits
4. Save the rule

Rules are checked in **priority order** — higher-priority rules match first. Drag rules to reorder them.

## Scoping Rules to Roles

You can limit a rule to specific agent roles. For example:

- Auto-approve **style** decisions from **Code Reviewer** agents (they know what they're doing)
- Require review for **architecture** decisions from **Developer** agents (want the Architect to weigh in)
- Auto-approve **testing** decisions from **QA Tester** agents

If no role scope is set, the rule applies to all agents.

## Conditions

Rules can have optional conditions that add runtime checks:

| Condition | What It Checks |
|-----------|---------------|
| **File count** | Number of files affected by the decision |
| **Context usage** | How much of the agent's context window is consumed |
| **Time elapsed** | How long the session has been running |

Conditions use operators: **less than**, **greater than**, or **between**. All conditions on a rule must pass for it to match.

## Effectiveness Tracking

Each rule tracks how well it's working:

- **Match count** — how many times the rule has triggered
- **Effectiveness score** — percentage of auto-approved decisions that stayed approved (0–100%)
- **Issues after match** — how many times you manually rejected an auto-approved decision

After 5+ matches, the effectiveness score appears as a colored bar:
- 🟢 **Green (80%+)** — rule is working well
- 🟡 **Yellow (50–79%)** — rule might need tuning
- 🔴 **Red (<50%)** — rule is auto-approving things you're rejecting — consider tightening it

## API Reference

Intent rules are managed through the decisions API:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/intents` | List all rules |
| `POST` | `/api/intents` | Create a new rule |
| `PATCH` | `/api/intents/:id` | Update a rule |
| `DELETE` | `/api/intents/:id` | Delete a rule |
| `POST` | `/api/intents/reorder` | Reorder rules by priority |
| `GET` | `/api/intents/presets` | Get available presets |
| `POST` | `/api/intents/presets/:name` | Apply a preset |

## Tips

- **Start with a preset**, then customize. Moderate is a good default.
- **Watch the effectiveness scores** — if a rule drops below 50%, you're rejecting what it auto-approves. Tighten the scope or change the action.
- **Use role scoping** to give trusted agent roles more autonomy while keeping others on a shorter leash.
- **Priority matters** — the first matching rule wins. Put specific rules (scoped to a role + category) above general ones.
- **Don't over-automate early** — start with Require Review for categories you're unsure about, then switch to Auto-approve once you trust the pattern.
