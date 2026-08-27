---
name: setup-pstack
description: Configure which models pstack uses per role. Validates OMP modelRoles and writes an always-applied rule mapping each pstack seat to an OMP role. Use for /setup-pstack, "configure pstack models", or changing pstack's model choices.
---

# Setup pstack

pstack-omp names no models. Every skill names a seat, and OMP's `modelRoles` resolves the seat to a model. This skill validates that chain and writes an override layer for the seats where the default mapping is wrong for you.

## Steps

### 1. Read the live role registry

Read `~/.omp/agent/config.yml` and take the `modelRoles:` block as the source of truth. The stock roles are `default`, `smol`, `slow`, `plan`, `advisor`, `task`, `vision`, `designer`. Show the user each role with its model. If a role the mapping needs is absent, say so and stop; do not invent a model for it.

### 2. Load current state

If the user's pstack model config already exists, read it and treat its values as the current choices. Otherwise start from the default seat-to-role mapping in this repo's `presets/omp-native.json`.

### 3. Map and confirm

Show every pstack seat with its current role and the model that role resolves to. Ask whether to accept as-is or change specific seats, offering the live roles as options. Prefer `ask` over free text. Panel seats (how critics, arena runners, architect runners, interrogate reviewers) take a list of roles; one subagent runs per entry, so list length sets panel size. OMP caps concurrent task jobs, so panels beyond that queue.

### 4. Validate

Every seat must name a role that exists in `modelRoles`. A seat naming a missing role breaks every delegation that reads it. Validate before writing, not after.

### 5. Write the rule

Overwrite the user's pstack model config with `alwaysApply: true` and one line per seat. Idempotent on re-run. Shape:

```markdown
---
alwaysApply: true
---
# pstack seat configuration

feature, refactoring, bug-fix, perf-issue, hillclimb: default
judgment and prose, hardest tasks: slow
how explorer, why investigators, swarm workers: smol
how explainer, why synthesizer, reflect judgment: slow
reflect tooling: default
how critics: slow
arena runners: slow
arena cross-judge pool: advisor
architect runners: slow
interrogate reviewers: slow
```

### 6. Wire it in

OMP reads its config from `~/.omp/agent/config.yml`. The pstack seat file is read by the skills at dispatch time; nothing to include. If the user wants a different model under a role, the edit belongs in `modelRoles`, not here.

### 7. Confirm

Print the final seat to role to model chain in one table. Done.
