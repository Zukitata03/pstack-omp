#!/usr/bin/env bash
# Validates that every seat in presets/omp-native.json names a role that exists
# in ~/.omp/agent/config.yml modelRoles. Exits 1 naming the offender.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
config="${OMP_CONFIG:-$HOME/.omp/agent/config.yml}"

command -v python3 >/dev/null || { echo "python3 required"; exit 1; }

# CI runners have no OMP install; there is nothing to validate against.
if [ ! -f "$config" ]; then
  echo "skip: no config at $config (CI or fresh machine); preset not validated"
  exit 0
fi

python3 - "$repo/presets/omp-native.json" "$config" <<'EOF'
import json, re, sys

preset_path, config_path = sys.argv[1], sys.argv[2]
seats = json.load(open(preset_path))["seats"]

text = open(config_path).read()
m = re.search(r"^modelRoles:\n((?:\s+\w+:.*\n)+)", text, re.M)
if not m:
    sys.exit(f"no modelRoles block in {config_path}")
roles = set(re.findall(r"^\s+(\w+):", m.group(1), re.M))

bad = []
for seat, v in seats.items():
    for role in (v if isinstance(v, list) else [v]):
        if role not in roles:
            bad.append(f"{seat}: {role}")

if bad:
    sys.exit("unknown roles:\n  " + "\n  ".join(bad))
print(f"ok: {len(seats)} seats resolve against {len(roles)} roles {sorted(roles)}")
EOF
