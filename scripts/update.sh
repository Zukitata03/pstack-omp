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

def git(*a, cwd=repo):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout

# 1. Snapshot upstream pstack/ into tmp/new
git("archive", ref, "pstack", cwd=repo)  # validates path exists
subprocess.run(f"git archive {ref} pstack | tar -x -C {tmp}", cwd=repo, shell=True, check=True)
src = pathlib.Path(tmp, "pstack")

# 2. Reset the working tree's content dirs to upstream, preserving our extras
work = pathlib.Path(repo)
for d in ["skills", "agents", "docs"]:
    shutil.rmtree(work / d, ignore_errors=True)
    shutil.copytree(src / d, work / d)
# automations/ is deliberately dropped: no benny in this fork

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
print("manifest:", man["version"])
PYEOF

# 4. Reapply the adaptation sweep (same transforms, kept in one place)
python3 "$repo/scripts/adapt-sweep.py"

# 5. Validate the preset chain before anything ships
"$repo/scripts/validate-preset.sh"

git add -A
if git diff --cached --quiet; then
  echo "no changes; fork already up to date with upstream/$ref"
else
  git commit -qm "regenerate from upstream cursor/plugins $ref"
  echo "updated from upstream/$ref; review with: git show --stat HEAD"
fi
