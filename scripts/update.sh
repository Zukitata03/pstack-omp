#!/usr/bin/env bash
# Regenerates this fork from upstream cursor/plugins pstack and reapplies every
# omp adaptation. Idempotent: a second run with no upstream change is a no-op diff.
# Usage: ./update.sh [upstream_ref]   (default: origin/main)
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"
ref="${1:-main}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git fetch --quiet upstream || { echo "fetch upstream failed"; exit 1; }

python3 - "$repo" "$tmp" "upstream/$ref" <<'PYEOF'
import subprocess, sys, pathlib, re, shutil, json

repo, tmp, ref = sys.argv[1], sys.argv[2], sys.argv[3]

# 1. Validate ref has the pstack subtree, then snapshot it (binary-safe: no text capture)
subprocess.run(["git", "cat-file", "-e", f"{ref}:pstack"], cwd=repo, check=True)
subprocess.run(f"git archive {ref} pstack | tar -x -C {tmp}", cwd=repo, shell=True, check=True)
src = pathlib.Path(tmp, "pstack")

# 2. Reset the working tree's content dirs to upstream, then restore fork-owned
# files whose rewrites cannot survive a wholesale re-import.
work = pathlib.Path(repo)

FORK_OWNED = ["skills/setup-pstack/SKILL.md"]
for rel in FORK_OWNED:
    cur = work / rel
    if cur.exists():
        (work / (rel + ".fork-owned")).write_bytes(cur.read_bytes())

for d in ["skills", "agents", "docs"]:
    shutil.rmtree(work / d, ignore_errors=True)
    shutil.copytree(src / d, work / d)
# automations/ is deliberately dropped: no benny in this fork

for rel in FORK_OWNED:
    saved = work / (rel + ".fork-owned")
    if saved.exists():
        (work / rel).write_bytes(saved.read_bytes())
        saved.unlink()

# 3. Base manifest from upstream, identity fields rewritten
man = json.loads((src / ".cursor-plugin" / "plugin.json").read_text())
man["name"] = "pstack-omp"
man["displayName"] = "pstack-omp"
man["version"] = man["version"] + "-omp1"
man["homepage"] = "https://github.com/zukitata03/pstack-omp"
man["repository"] = "https://github.com/zukitata03/pstack-omp"
omp_dir = work / ".omp-plugin"
omp_dir.mkdir(exist_ok=True)
(omp_dir / "plugin.json").write_text(json.dumps(man, indent=2) + "\n")

# Keep the catalog's pinned version in lockstep with the plugin manifest.
cat_path = omp_dir / "marketplace.json"
if cat_path.exists():
    cat = json.loads(cat_path.read_text())
    for entry in cat.get("plugins", []):
        if entry.get("name") == man["name"]:
            entry["version"] = man["version"]
    cat_path.write_text(json.dumps(cat, indent=2) + "\n")
print("manifest:", man["version"])
PYEOF

# 4. Reapply the adaptation sweep (same transforms, kept in one place)
python3 "$repo/scripts/adapt-sweep.py"

# 4b. Notice (not failure) when a fork-owned skill changed upstream.
python3 - "$repo" "upstream/$ref" <<'NOTICE_EOF'
import subprocess, sys, pathlib

repo, ref = sys.argv[1], sys.argv[2]
FORK_OWNED = {
    "setup-pstack/SKILL.md": "rewritten for OMP modelRoles; port budget-ask changes manually",
}
changed = []
for rel, note in FORK_OWNED.items():
    up = subprocess.run(
        ["git", "show", f"{ref}:pstack/{rel}"], cwd=repo, capture_output=True
    ).stdout
    ours = (pathlib.Path(repo) / "skills" / rel).read_bytes()
    if up != ours:
        changed.append((rel, note))
for rel, note in changed:
    print(f"NOTICE: upstream changed fork-owned {rel} ({note})")
NOTICE_EOF

# 5. Validate the preset chain before anything ships
"$repo/scripts/validate-preset.sh"

git add -A
if git diff --cached --quiet; then
  echo "no changes; fork already up to date with upstream/$ref"
else
  git commit -qm "regenerate from upstream cursor/plugins $ref"
  echo "updated from upstream/$ref; review with: git show --stat HEAD"
fi
