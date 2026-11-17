# pstack-omp

[pstack](https://github.com/cursor/plugins/tree/main/pstack), built to run natively in [oh-my-pi (OMP)](https://omp.sh).

## Credits

pstack is the work of **Lauren Tan** ([poteto](https://github.com/poteto)), open-sourced by **Cursor** in [cursor/plugins](https://github.com/cursor/plugins) under the MIT license. Every skill, playbook, principle, agent, and guide page in this repo is hers. Her text ships unchanged; this build only adds a one-line OMP pointer and the appended [amendments](#how-the-omp-build-works). Read her [README](https://github.com/cursor/plugins/blob/main/pstack/README.md) and [guide](./docs/guide/README.md) for what pstack is and how to use it.

This repo only adds the OMP adapter, community fixes upstream doesn't have yet (credited where they're applied), the build script, and packaging. It is a personal build, not affiliated with Cursor or the author.

## Install

```bash
omp plugin marketplace add Zukitata03/pstack-omp
omp plugin install pstack-omp@pstack-omp
```

To update later:

```bash
omp plugin marketplace update pstack-omp
omp plugin upgrade pstack-omp@pstack-omp
```

## Use

1. Run `/skill:setup-pstack` once. It writes `~/.omp/agent/rules/pstack-models.md`, which maps each pstack role to an OMP model role (`default`, `slow`, `advisor`, ...). Which model a role runs stays in your `modelRoles`.
2. Start rigorous work with `/skill:poteto-mode <task>`.

Upstream docs write commands as `/name`. In OMP, type `/skill:name`. To keep poteto-mode on for every task in a project, add `.omp/rules/poteto-mode.md` with `alwaysApply: true` in its frontmatter and the line `Follow skill://poteto-mode for every task.`

## How the OMP build works

The skills use Cursor names: `Task`, `AskQuestion`, model slugs, `~/.cursor` paths, `/loop`, cloud agents. Upstream already solves this for Claude Code with an adapter table ([`docs/harness/claude-code.md`](https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md)) and one line in each skill that points at it. This build does the same for OMP:

- `skills/`, `agents/`, `docs/guide/`, and `LICENSE` are generated from the upstream commit pinned in `upstream.lock.json`. Don't edit them.
- [`overlay/skills/pstack-omp/SKILL.md`](./overlay/skills/pstack-omp/SKILL.md) is the OMP adapter. It maps every Cursor name to OMP: the `task` batch, `ask`, `todo`, `skill://`, model roles, transcripts, `/loop`, and which Cursor-only steps to skip.
- Each skill or agent that uses a Cursor name gets one line after its title: read `skill://pstack-omp` once per session.
- Agent frontmatter `model:` slugs become OMP role aliases (`claude-opus-*` → `@default`, `claude-fable-*` → `@slow`, other vendors → `@advisor`).
- Relative links to upstream files this build leaves out point at GitHub instead.
- Left out: `automations/` (benny) and `make-bot-ui`, which need Cursor Automations.
- [`amendments/`](./amendments) holds fixes upstream doesn't have yet. `amendments/<path>` is appended to the upstream file at `<path>` as its own section that says it wins where it differs. Today that is the `no-comments` fix by Michael Ramos from [backnotprop/pstack#14](https://github.com/backnotprop/pstack/issues/14). Outside-rule comments it can't check go to `REVIEW` instead of being deleted, `MUST KILL` covers only problems the code has today, and a rejected rerun no longer fails the whole run.

Upstream prose is never rewritten, and amendments never match upstream sentences, so an upstream edit can't break the build or drop a fix. Upstream quirks don't fail it either: a frontmatter `name` that differs from its folder is set to the folder name, and a placeholder link is left alone, each with a `WARN` line. The older regex sweep failed on every reworded sentence and stalled this fork at 0.15.2 from late September.

## Updates

`.github/workflows/sync.yml` runs daily and on demand:

1. `node scripts/upstream.mjs sync` pins upstream `main` when `pstack/` changed, rebuilds, and reports drift.
2. The job commits and pushes any change as `sync: cursor/plugins pstack <version> @ <commit>`.
3. If something needs a look, the job opens or updates one issue, **pstack-omp drift**, and closes it once drift clears. The run stays green, and the update ships anyway.

Drift means one of these:

- Upstream's harness generator added a Cursor name that the OMP adapter has no row for.
- Upstream changed its Claude Code adapter since you last reviewed it. The issue includes the diff.
- Upstream changed a file that an amendment is appended to. The issue includes the diff. If upstream now ships the same fix, delete the amendment.
- Upstream deleted a file that an amendment targets. That amendment is skipped until you move or delete it.

To clear it, edit the adapter or `amendments/`, then run:

```bash
node scripts/upstream.mjs build  # regenerate the tree
node scripts/upstream.mjs ack    # mark the watched upstream files reviewed at the pinned commit
```

A new amendment needs `ack` once, so drift has a baseline to diff against.

On push, CI runs `node scripts/upstream.mjs check`, which fails when the committed tree differs from a fresh build. That catches hand edits to generated files.

When you change `overlay/`, `amendments/`, or the build script, bump `forkRevision` in `upstream.lock.json` so `omp plugin upgrade` sees a new version (`<upstream>-omp.<forkRevision>`). The sync bumps it for you when upstream content changes without a version bump.

## License

MIT. See [`LICENSE`](./LICENSE), Lauren Tan's license from cursor/plugins, which covers the pstack content. The adapter and scripts are offered under the same terms.
