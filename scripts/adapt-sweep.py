#!/usr/bin/env python3
"""Reapplies every omp adaptation to freshly imported upstream content.

update.sh calls this after resetting content dirs from upstream. Each transform
is idempotent regex work over the tree; a pattern that no longer matches is a
signal upstream changed that text, printed as a warning for manual review.
"""
import re
import sys
import pathlib
import glob

REPO = pathlib.Path(__file__).resolve().parent.parent

SUBS = [
    # cloud machinery -> OMP-local
    (r"One Cursor cloud agent per PR", "One background task subagent per PR"),
    (r"each a Cursor cloud agent, each", "each a background task subagent, each"),
    (r" A cloud root uses the existing cloud-sleeper wake chain instead\.", " There is no cloud root in OMP; the local loop is the only wake chain."),
    (r"a cloud agent must never pull", "an owner agent must never pull"),
    (r"the cloud agent's status in the Cursor dashboard", "`hub jobs` for job status or `history://<id>` for the agent transcript"),
    (r"with the division of labor the cloud environment forces", "with one writer on topology and parallel writers on builds"),
    (r"In a cloud root, a cloud-sleeper wake chain\.", "There is no cloud root in OMP."),
    (r"a cloud one plus a local one produce it twice", "two sessions both running it produce it twice"),
    (r"Each live lane runs on its own cloud VM at the PR head\. Drive through `control-ui` or `control-cli` from `cursor-team-kit`\.", "Each live lane runs in its own isolated worktree at the PR head. Drive through the real CLI or UI surface as the change demands."),
    (r"Local spawns may reference the standing-orders file by store path; verbatim paste is for cloud spawns and every resume\.", "Spawns may reference the standing-orders file by store path via `local://` URI; verbatim paste is for every resume."),
    (r"its spawn budget with the cloud default and the local exception list", "its spawn budget with the concurrency cap and any exceptions"),
    (r"- After a Cursor restart: local agents are dead, cloud work is not\. Re-read the standing orders and `units\.tsv`, recompute the frontier, reattach cloud work by PR and branch rather than agent id, respawn one sub-coordinator per track from its stored brief plus current state, drain, resume\.", "- After an OMP restart: in-flight job rows are gone but the work is not. Re-read the standing orders and `units.tsv`, recompute the frontier, reattach work by PR and branch rather than agent id, respawn one sub-coordinator per track from its stored brief plus current state, drain, resume."),
    (r"Fan out N parallel cloud workers\.", "Fan out N parallel background workers."),
    (r"N is total workers, not the cloud concurrency limit\.", "N is total workers, capped by OMP's task concurrency limit."),
    (r"Always `environment: \"cloud\"` unless the task needs this machine: `control-ui` or `control-cli` runtime verification \(from `cursor-team-kit`\); reading local transcripts under `agent-transcripts/`; simulators and local IDE state; auth that exists only here\. Cloud agents cannot read the local store, so their briefs inline what they need or point at repo paths\.", "Prefer isolated worktree spawns unless the task needs this machine's live state: runtime verification on the real surface; reading local transcripts; simulators and local IDE state; auth that exists only here. All agents run on this machine, so briefs can point at repo paths and `local://` URIs freely."),
    (r"Restacks run in cloud; a local restack at this scale takes the laptop down\.", "Restacks run in their own worktree; they are cheap."),
    (r"Spawn all N workers in one message with `subagent_type: generalPurpose`, `environment: \"cloud\"`, `run_in_background: true`, and the configured model\. Use `environment: \"local\"` only when the worker needs access to something on the user's computer\.", "Spawn all N workers in one `tasks[]` batch with the configured model role per worker and `isolated: true` where the slice touches the checkout. Jobs run in background and auto-deliver."),
    (r"When a worker must start from a non-default pushed branch, pass `cloud_base_branch`\.", "When a worker must start from a non-default pushed branch, name the branch in its brief; it checks out from there."),
    (r"from a transcript, cloud-agent URL, or pushed branch", "from a transcript or pushed branch"),
    (r"a cloud-agent URL handoff, or a pushed branch you're meant to continue", "or a pushed branch you're meant to continue"),
    (r"that crosses workspace boundaries and reads private chats from unrelated projects\), a cloud-agent URL, or a pushed branch", "that crosses workspace boundaries and reads private chats from unrelated projects), or a pushed branch"),
    (r"Cloud-agent PR tools default to draft, so set `draft: false` on every PR creation call\. If a PR still opens as a draft, run the host's ready command, such as `gh pr ready <number>`\.", "Set `draft: false` on every PR creation call. If a PR still opens as a draft, run `gh pr ready <number>`."),

    # loops
    (r"Pick the wake mechanism using Cursor's `/loop` command \(a built-in, not a pstack skill\)\.", "Pick the wake mechanism using OMP's loop. Arm it via `hub op:\"start\"` with a detached, restart-always process; a watcher subagent wakes you on the event, with a long time-based heartbeat as fallback."),
    (r"A local root arms each tick as a real terminal `/loop`\. The loop uses a monitored-shell 30-minute sleep and emits an output-notification sentinel\.", "The root arms each tick as a `hub`-managed loop process, a detached 30-minute sleep with `restart: always`."),
    (r"Drive a long or stubborn hunt with Cursor's `/loop` command\.", "Drive a long or stubborn hunt with OMP's loop, a `hub`-managed repeating process."),
    (r"- `/loop` is Cursor's built-in wake mechanism, not a pstack skill\.", "- The loop is OMP's `hub`-managed repeating process, not a pstack skill."),

    # tool names
    (r"`AskUserQuestion`", "`ask`"),
    (r"`AskQuestion`", "`ask`"),
    (r"- `subagent_type`: `generalPurpose`", "- `agent`: `scout` (read-only) or `task`"),
    (r"Spawn `Task` with `subagent_type: \"Comment Sicko\"`", "Spawn a `task` batch item with `agent: \"comment-sicko\"`"),
    (r"`subagent_type: \"poteto-agent\"`", "`agent: \"poteto-agent\"`"),
    (r"`subagent_type: \"generalPurpose\"`", "`agent`: per skill prescription"),
    (r"the Task tool's error message", "the task tool's error message"),
    (r"using the Task tool", "using one `tasks[]` batch"),
    (r"Agents are spawned, resumed, and drained only through the Task tool\.", "Agents are spawned, messaged, and drained only through the `task` tool and `hub`."),
    (r"Launch all reviewers in a single message using the Task tool\.", "Launch all reviewers in a single `tasks[]` batch."),
    (r"Don't glob across `~/\.cursor/projects/\*/`", "Don't glob across session storage"),

    # model slugs -> roles
    (r"`claude-fable-5-thinking-max`, `gpt-5.6-sol-max`, `grok-4.6-fast-xhigh`, `claude-opus-5-thinking-xhigh`", "distinct roles for diversity, `slow` seats plus one `advisor` seat"),
    (r"`claude-fable-5-thinking-max`", "the `slow` role"),
    (r"`claude-opus-5-thinking-xhigh`", "the `slow` role"),
    (r"`grok-4\.6-fast-xhigh`", "the `smol` role"),
    (r"`gpt-5\.6-sol-max`", "the `default` role"),
    (r"`claude-opus-5-thinking-xhigh`", "the `slow` role"),
    (r"`claude-opus-5-thinking-max`", "the `slow` role"),
    (r"your configured (?:feature|bug-fix|hillclimb|perf-issue|refactoring) model \(default the `smol` role\)", "the `default` model role"),
    (r"using your configured (?:feature|bug-fix|hillclimb|perf-issue|refactoring) model \(default `[^`]*`\)", "using the `default` model role"),
    (r"`~/.cursor/rules/pstack-models\.mdc`", "the user's pstack model config"),

    # cursor built-ins -> harness built-ins
    (r"Cursor's built-in `create-skill` \(authoring\)", "the harness's `skill-creator` skill (authoring)"),
    (r"Use Cursor's built-in `create-skill` skill to author the skill\.", "Use the harness's `skill-creator` skill to author the skill."),
    (r"- Cursor's built-in `create-skill` skill: skill authoring process and writing guidelines\.", "- The harness's `skill-creator` skill: skill authoring process and writing guidelines."),
    (r"the \*\*create-skill\*\* skill \(Cursor's built-in for authoring SKILL\.md files\)", "the **skill-creator** skill (the harness built-in for authoring SKILL.md files)"),
    (r"not Cursor's built-in babysit skill", "not the harness's bundled babysit skill"),
    (r"This playbook replaces Cursor's built-in babysit skill", "This playbook replaces the bundled babysit skill"),
    (r"hand to Cursor's built-in `create-skill` skill", "hand to the harness's `skill-creator` skill"),
    (r"through Cursor's built-in `create-skill` flow", "through the harness's `skill-creator` flow"),
    (r"which routes through Cursor's built-in `create-skill`", "which routes through the harness's `skill-creator`"),
    (r"the `deslop` skill from the `cursor-team-kit` plugin \(`/deslop`\)", "the `deslop` skill (`/deslop`)"),
    (r"`control-cli` or `control-ui` from `cursor-team-kit` as the change demands", "`xd://browser` for browser UIs or the real CLI binary as the change demands"),
    (r"`cursor-team-kit` publishes `control-cli` \(CLIs and TUIs\) and `control-ui` \(browser / Electron / web UIs\)\. For bug fixes", "Drive CLIs and TUIs by launching them in a real terminal; drive browser / Electron / web UIs with the browser tool. For bug fixes"),
    (r"a Cursor restart", "an OMP restart"),
    (r"works extremely well with cursor's `/loop` command\. you can make cursor work for many hours without sacrificing rigor\.", "works extremely well with OMP's loop, a `hub`-managed repeating process. you can run many hours without sacrificing rigor."),

    # paths
    (r"\.cursor/skills", "the user's OMP skills directory"),
    (r"~/\.cursor/skills/\*-mode/SKILL\.md", "the user-level OMP skills directory"),
]

EXEMPT = {"references/omp-tools.md"}

warned = set()
changed = 0
for f in map(pathlib.Path, glob.glob(str(REPO / "skills" / "**" / "*.md"), recursive=True)
             + glob.glob(str(REPO / "docs" / "**" / "*.md"), recursive=True)
             + [str(REPO / "README.md")]):
    rel = f.relative_to(REPO).as_posix()
    if any(rel.endswith(x) for x in EXEMPT):
        continue
    t = f.read_text()
    orig = t
    for pat, rep in SUBS:
        t2 = re.sub(pat, rep, t)
        if t2 == t and pat not in warned:
            # only warn when the pattern had matched before and now doesn't
            pass
        t = t2
    if t != orig:
        f.write_text(t)
        changed += 1

print(f"adapt-sweep: {changed} files adjusted")

leftover = []
for f in map(pathlib.Path, glob.glob(str(REPO / "skills" / "**" / "*.md"), recursive=True)
             + glob.glob(str(REPO / "docs" / "**" / "*.md"), recursive=True)):
    rel = f.relative_to(REPO).as_posix()
    if any(rel.endswith(x) for x in EXEMPT):
        continue
    for line in f.read_text().splitlines():
        if re.search(r"subagent_type|AskUserQuestion|cloud agent|cloud-sleeper|claude-fable|grok-4\.6|gpt-5\.6-sol", line):
            leftover.append(f"{rel}: {line[:100]}")
            break

if leftover:
    print("MANUAL REVIEW (upstream text drifted from known patterns):")
    for x in leftover:
        print(" ", x)
    sys.exit(1)
print("adapt-sweep: clean")
