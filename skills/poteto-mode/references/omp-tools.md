# OMP tool names

pstack-omp targets oh-my-pi (OMP). When a skill or playbook names a Cursor or Claude Code tool, model, or built-in, resolve it here. The shared text above stays platform-neutral on purpose; this file is the only place names differ.

## Tools

| Cursor / Claude name | OMP equivalent |
|---|---|
| `Agent` / `Task` tool, one call per agent | `task` tool with a `tasks[]` batch. One call spawns many. Each item takes `name`, `agent`, `task`, `isolated`, `context` |
| `subagent_type: "x"` | `agent: "x"` on the task item |
| `run_in_background: true` | Default. All task jobs run in background and results auto-deliver |
| `AskUserQuestion` | `ask` tool. Batch related questions in one call |
| `Skill` tool (invoke a skill) | OMP discovers skills automatically; the harness reads `skill://<name>` when a matching skill fires |
| Read a skill file | `read skill://<name>` or `read skill://<name>/<path>` |
| Skill search / marketplace | `omp plugin discover <marketplace>`, `omp plugin install <name>@<marketplace>` |
| Inter-agent DM | `hub send` with `to:` an agent id. `await: true` for a round trip |
| Wait on agents | `hub wait`. Never poll; settled `hub jobs` snapshots are the delivery |
| Kill a stuck agent job | `hub cancel` with the job id |
| Background process / watcher / REPL | `hub op:"start"` with a stable `name`, `ready.log` or `ready.port`, restart policy |
| Web fetch | `read` the URL directly; browser only for JS execution, auth, interaction |

## Agents

OMP ships these spawnable agent types. `scout` is read-only and is the default for exploratory research. `task` is the general-purpose worker. `comment-sicko` and `poteto-agent` come from this plugin. The config may disable others (`designer`, `librarian`, `reviewer`, `security-reviewer`, `sonic`).

Isolation. `isolated: true` on a task item runs it in a dedicated git worktree; success auto-applies to the parent checkout.

## Models

No pstack skill names a model. Every seat names a role and OMP's `modelRoles` resolves it. The roles on this machine live in `~/.omp/agent/config.yml` under `modelRoles:` (default, smol, slow, plan, advisor, task, vision, designer). Change a model once there and every skill follows. The presets file in this repo's `presets/omp-native.json` records the intended role per pstack seat; the resolver script validates it against the live config.

Seat to role mapping. Playbook owners and code delegates read `task` or `default`. Judgment, prose, and review panels read `slow`. Fast mechanical sweeps and explorers read `smol`. Architecture and design exploration read `plan`. A second opinion seat reads `advisor`.

## Loops and waking

Cursor's `/loop` has an OMP equivalent already in the harness. Arm long-running or periodic work through `hub op:"start"` with a detached, restartable process. `hub wait` with a long timeout is the heartbeat listener. Playbooks that say "arm a `/loop`" mean this. Cloud sleepers do not exist; there is no cloud.

## Transcripts

Evaluating what a subagent actually did. `history://<id>` is the read-only transcript. `agent://<id>` is its artifact tree. Never glob session storage on disk.
