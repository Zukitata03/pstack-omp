---
name: pstack-omp
description: OMP adapter for pstack. Maps the Cursor names in pstack skills (Task, AskQuestion, model slugs, ~/.cursor paths, /loop, cloud agents) to oh-my-pi. Read once per session before you follow any pstack skill.
disable-model-invocation: true
---

# pstack in OMP

pstack is Lauren Tan's ([poteto](https://github.com/poteto)) skill pack, open-sourced by Cursor in [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack). Its skills ship here unchanged and use Cursor names. In OMP, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the plugin folder that holds `skills/` and `agents/`; `skill://<name>` reaches any pstack skill without knowing that folder. If a Cursor name or field has no row, drop it and say so in one line. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | OMP |
| --- | --- |
| `Task` | `task`. One call takes a `tasks[]` batch and a shared `context`. Each item has `task` and `solutionSpace`, plus optional `name`, `agent`, `model`, and `isolated`. "Spawn N in one message" means one batch of N items. |
| `AskQuestion` | `ask`, one HTML form. When `ask` is absent, as in `omp -p`, ask in plain text. |
| Open a todolist, or copy steps into the todolist tool | `todo`: `init` with the steps verbatim, then `start` and `done` as each step runs. |
| Run another pstack skill (`/name` or "the **name** skill") | `read skill://<name>` and follow it. A file inside it is `skill://<name>/<path>`. When you tell the user to type it, write `/skill:<name>`. |
| `Grep`, `Glob` | `grep`, `glob`. Use `find` when you don't know where to look. |
| `/loop` | OMP's `/loop` is a user command. It re-submits the next prompt after every turn, bounded by a count or duration, or gated by `--until '<cmd>'` or `--while '<cmd>'`. When a step arms `/loop`, give the user the exact line to type, with the step's check as the command, and keep working. |
| A watcher that wakes you on an event | A background `task` item or a `bash` call with `async: true`. Results arrive as messages and wake the session. Call `wait` only when you are blocked. |

## Subagent fields

| Cursor | OMP |
| --- | --- |
| `subagent_type: generalPurpose` | `agent: "task"`, or omit `agent`. |
| `poteto-agent`, `comment-sicko` | `agent: "poteto-agent"`, `agent: "comment-sicko"`. This plugin ships both in `agents/`. |
| The `model:` line in `poteto-agent`'s file | This build rewrites it to an OMP role alias (`@default`). Pass `model` per the Models table when the task's role line names another role. |
| `readonly: true` | `agent: "scout"`, the read-only explorer. The brief still says "do not edit files". |
| `readonly: false` | `agent: "task"`. It keeps the session's MCP tools. |
| `environment: "cloud"` | `isolated: true` on the item when the schema offers it. Otherwise open a separate checkout the way your session's rules say, and name it in the brief. Name the branch or commit the worker starts from. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Tell the worker to check out `<b>` first. |
| `run_in_background: true` | Omit. Every spawn runs as a background job and its result auto-delivers. |
| `resume` | `write agent://<id>` with the follow-up. It revives a parked agent with its context. Read its work so far with `history://<id>`. |
| `file_attachments` | List the paths in the brief. |
| A Project worker | A `task` item. |

## Models

| Cursor | OMP |
| --- | --- |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | `~/.omp/agent/rules/pstack-models.md`, an always-apply rule that OMP loads into every new session (`rule://pstack-models`). If its lines are not in context, read the file. If the file or the role's line is missing, map the skill's default slug with the rows below. |
| A role value `<role>` or `<role>:<level>`, such as `slow` or `default:high` | `<role>` is an OMP model role. Pass `model` as the exact `provider/model-id` the `task` tool lists for that role, with `:<level>` when given. If the tool lists no model for the role, or `task` has no `model` field, omit `model`, run on the agent's default, and say so. |
| `claude-fable-*` | Role `slow`. |
| Any other `claude-` slug, such as `claude-opus-*` | Role `default`. |
| `gemini-*`, `gpt-*`, `grok-*`, or any other non-Claude slug | Role `advisor`, the second vendor. |
| The effort token in a slug (`-low`, `-medium`, `-high`, `-xhigh`) | The `:<level>` suffix. Drop `-fast`. |
| `auto` or `inherit-parent` | Omit `model`. |
| A rule tied to one slug, such as "Opus always runs `-fast`" or a vendor's top slug | Keep the role's model and apply only the level. If the tool rejects a selector, never pass it again. Retry with the role's listed selector unchanged, then without `model`. |
| "Another vendor's model" | A role whose listed model comes from a different provider family than the parent's. |

## setup-pstack

OMP routes subagents by model role, not by Cursor slug, so `setup-pstack` writes roles. Follow its steps with these changes:

- Detect. The detected models are the roles the `task` tool lists with a model, plus `modelRoles` in `~/.omp/agent/config.yml` and the project's `.omp/config.yml`. Show each role with its model. Write a value as `<role>:<level>`, such as `default:xhigh`. The level is the last token, so the budget step works as written.
- Defaults. Map each default slug with the Models rows. `claude-opus-…-xhigh-fast` is `default:xhigh`, `claude-fable-…-high` is `slow:high`, and a `gemini-…-high` slug is `advisor:high`. A role missing from the detected set needs a choice.
- Validate. Every role written must be in the detected set. `inherit-parent` and `auto` always pass.
- Write. Write `~/.omp/agent/rules/pstack-models.md`. Under a profile or `PI_CODING_AGENT_DIR`, use that agent directory's `rules/`. Keep the step 5 frontmatter, comment lines, `# defaults` line, and `# budget` line, then one line per role. Where a comment says "omit Task `model` and spawn `generalPurpose`", write "omit `model`". Overwrite the whole file. Never put role lines in `AGENTS.md`.
- Which model a role runs belongs in `modelRoles` (`/model`, Roles view), not in this rule.

## Paths

| Cursor | OMP |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.omp/skills/`, `~/.omp/agent/skills/`. OMP finds skills one level deep, so flatten a nested path such as `<handle>/<handle>-mode/` to `<handle>-mode/`. The folder name and the frontmatter `name` must match. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `skill://<name>` for a pstack file. Installed plugins live under `~/.omp/plugins/cache/plugins/`, with `.omp-plugin/plugin.json` as the manifest. |
| `.cursor/rules/*.mdc`, always-applied rules | `.omp/rules/*.md` in a project or `~/.omp/agent/rules/*.md` for the user, with `alwaysApply: true`. Standing project instructions go in `AGENTS.md`. |
| `.cursor/worktrees/` | Wherever this session keeps separate checkouts. `git worktree list` shows git worktrees. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when this plugin ships it (`skills/`, `agents/`, `docs/guide/`). Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.omp/agent/sessions/<bucket>/<timestamp>_<session-id>.jsonl`. The bucket is the workspace path relative to home with each `/` changed to `-` and a leading `-`, so `~/code/app` is `-code-app`. Under the temp dir it is `-tmp-<relative>`, and elsewhere `--<absolute path, same encoding>--`. The newest `.jsonl` in the bucket is the current session. Its `<timestamp>_<session-id>/` folder holds subagent transcripts. For a subagent of this session, read `history://<id>`. Read only this workspace's bucket. |

## Cursor-only features

OMP has no Cursor Automations, Bugbot, Cursor cloud agents, Custom Modes, or built-in PR tool. When a step needs one, put one line in your reply, `Skipped in OMP: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | OMP |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| A built-in PR tool | The forge command the step gives, such as `gh pr create`. That is not a skip, so write no line. |
| Custom Mode | Skip with the line. The user starts each task with `/skill:poteto-mode`. |
| `/deslop` from `cursor-team-kit` | Do the pass by hand over the diff: cut narration comments, dead code, defensive checks the types already rule out, and abstractions with one caller. Say you did it by hand. |
| `control-ui` from `cursor-team-kit` | The `browser` tool for web and Electron UIs. Use `computer` for desktop apps when the session has it. |
| `control-cli` from `cursor-team-kit` | Run the real binary with `bash`. Use `pty: true` for TUIs and interactive prompts. |
| Cursor's built-in `create-skill` | Write `SKILL.md` yourself under `.omp/skills/<name>/` or `~/.omp/agent/skills/<name>/`, with a `name` that matches the folder and a one-line `description`. Use `manage_skill` when the session offers it. |
| `/add-plugin pstack` | `omp plugin marketplace add Zukitata03/pstack-omp`, then `omp plugin install pstack-omp@pstack-omp`. |
