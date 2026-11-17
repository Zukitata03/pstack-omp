#!/usr/bin/env node
// Builds pstack-omp from a pinned cursor/plugins pstack commit plus overlay/.
//
//   node scripts/upstream.mjs build        regenerate the tree from upstream.lock.json
//   node scripts/upstream.mjs check        fail when the committed tree differs from a fresh build
//   node scripts/upstream.mjs sync         pin upstream main if pstack changed, build, report drift
//   node scripts/upstream.mjs drift        report adapter drift for the pinned commit
//   node scripts/upstream.mjs ack-adapter  mark upstream's Claude Code adapter as reviewed at the pinned commit
//
// Upstream text ships verbatim. Each file that uses a Cursor name gets one line after its title that sends the
// agent to skill://pstack-omp, the OMP adapter. Upstream does the same for Claude Code with
// pstack/docs/harness/claude-code.md and scripts/generate-pstack-harness-trees.mjs.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(ROOT, "upstream.lock.json");
const CACHE = join(ROOT, ".cache", "cursor-plugins");
const DRIFT = join(ROOT, ".cache", "drift.md");
const OVERLAY = join(ROOT, "overlay");
const UPSTREAM = "https://github.com/cursor/plugins";
const REPO = "https://github.com/Zukitata03/pstack-omp";
const SUBTREE = "pstack";
const UPSTREAM_GENERATOR = "scripts/generate-pstack-harness-trees.mjs";
const CLAUDE_ADAPTER = `${SUBTREE}/docs/harness/claude-code.md`;
const ADAPTER = "pstack-omp";
const ADAPTER_PATH = `skills/${ADAPTER}/SKILL.md`;
// Upstream paths that ship. automations/ (benny), assets/, and docs/harness/ stay upstream.
const SHIP = ["skills", "agents", "docs/guide", "LICENSE"];
// Cursor Automations only: every step would be a skip in OMP.
const OMIT = ["skills/make-bot-ui"];
// Paths this script owns. build replaces them; check compares them.
const MANAGED_DIRS = ["skills", "agents", "docs"];
const MANAGED_FILES = ["LICENSE", ".omp-plugin/plugin.json", ".omp-plugin/marketplace.json"];
const LINK = /\]\(([^)\s]+)\)/g;
const ROUTE_KEY = "Run another pstack skill";
const ADAPTER_LINE =
  `In OMP, read \`skill://${ADAPTER}\` once per session before you follow this file. ` +
  "It maps the Cursor names in pstack to OMP.";

// Cursor names that send a file to the adapter. Each key must appear in the adapter text.
// Upstream's own TERMS list is merged in at build time, so a new upstream term classifies files without an edit here.
const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: '`environment: "cloud"`', re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "grok-", re: /\bgrok-\d/ },
  { key: "gpt-", re: /\bgpt-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "pstack-models.mdc", re: /pstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "Cursor-only features", re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent|built-in PR tool/ },
  { key: "`/loop`", re: /\/loop\b/ },
  { key: "cursor-team-kit", re: /cursor-team-kit|control-(ui|cli)\b|\/deslop\b/ },
  { key: "create-skill", re: /create-skill/ },
  { key: "Custom Mode", re: /[Cc]ustom [Mm]odes?\b/ },
  { key: "Project worker", re: /Project workers?\b/ },
  { key: ".cursor/worktrees/", re: /\.cursor\/worktrees/ },
  { key: "/add-plugin", re: /\/add-plugin\b/ },
];

const posixPath = (path) => path.split(sep).join("/");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const text = (entry) => entry.bytes.toString("utf8");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

function git(...args) {
  return execFileSync("git", ["-C", CACHE, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function hasObject(spec) {
  try {
    git("cat-file", "-e", spec);
    return true;
  } catch {
    return false;
  }
}

// A partial, sparse clone of cursor/plugins that holds only pstack/ and scripts/ at the commits we ask for.
function ensureCache() {
  if (existsSync(join(CACHE, ".git"))) return;
  mkdirSync(CACHE, { recursive: true });
  git("init", "-q");
  git("config", "core.autocrlf", "false");
  git("remote", "add", "origin", `${UPSTREAM}.git`);
  git("sparse-checkout", "set", "--cone", SUBTREE, "scripts");
}

function fetchRef(ref) {
  git("fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", ref);
  return git("rev-parse", "FETCH_HEAD");
}

function checkout(commit) {
  ensureCache();
  if (!hasObject(`${commit}^{commit}`)) fetchRef(commit);
  git("checkout", "-q", "--detach", commit);
  return join(CACHE, SUBTREE);
}

// Upstream's TERMS array, read as data. Returns [] when its shape changes; drift() reports that.
function upstreamTerms() {
  const path = join(CACHE, UPSTREAM_GENERATOR);
  if (!existsSync(path)) return [];
  const block = readFileSync(path, "utf8").match(/const TERMS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  const entry = /\{\s*key:\s*("(?:[^"\\]|\\.)*"),\s*re:\s*\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\[\n])+)\/([a-z]*)\s*\}/g;
  return [...block.matchAll(entry)].flatMap(([, key, source, flags]) => {
    try {
      return [{ key: JSON.parse(key), re: new RegExp(source, flags) }];
    } catch {
      return [];
    }
  });
}

function terms() {
  const known = new Set(TERMS.map(({ key }) => key));
  return [...TERMS, ...upstreamTerms().filter(({ key }) => !known.has(key))];
}

function cursorNamesIn(texts, otherSkills, termList) {
  const names = otherSkills.join("|");
  const route = names ? new RegExp(`the \\*\\*(${names})\\*\\* skill|\`/(${names})\``) : null;
  const used = new Set();
  for (const body of texts) {
    for (const term of termList) if (term.re.test(body)) used.add(term.key);
    if (route?.test(body)) used.add(ROUTE_KEY);
  }
  return used;
}

function addAdapterLine(body) {
  if (/^# .*$/m.test(body)) return body.replace(/^(# .*)\n+/m, `$1\n\n${ADAPTER_LINE}\n\n`);
  const frontmatter = body.match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? "";
  return `${frontmatter}\n${ADAPTER_LINE}\n\n${body.slice(frontmatter.length).replace(/^\n+/, "")}`;
}

// Agent frontmatter `model:` holds a Cursor slug. OMP resolves `@role` aliases through modelRoles.
function ompModel(value) {
  const slug = value.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (slug.startsWith("@") || slug.includes("/")) return value.trim();
  if (slug === "auto" || slug === "inherit-parent") return null;
  if (/^claude-fable-/.test(slug)) return '"@slow"';
  if (/^claude-/.test(slug)) return '"@default"';
  return '"@advisor"';
}

function adaptAgent(body) {
  return body.replace(/^---\n([\s\S]*?)\n---\n/, (block, fields) => {
    const lines = fields.split("\n").flatMap((line) => {
      const model = line.match(/^model:(.*)$/);
      if (!model) return [line];
      const role = ompModel(model[1]);
      return role === null ? [] : [`model: ${role}`];
    });
    return `---\n${lines.join("\n")}\n---\n`;
  });
}

function manifests(src, lock) {
  const upstream = readJson(join(src, ".cursor-plugin", "plugin.json"));
  const version = `${upstream.version}-omp.${lock.forkRevision}`;
  const description = `${upstream.description} OMP build of Lauren Tan's pstack from cursor/plugins.`;
  const plugin = {
    name: "pstack-omp",
    displayName: "pstack-omp",
    version,
    description,
    author: upstream.author,
    homepage: REPO,
    repository: REPO,
    license: upstream.license,
    keywords: upstream.keywords,
    category: upstream.category,
    tags: upstream.tags,
    skills: "./skills/",
    agents: "./agents/",
  };
  const marketplace = {
    name: "pstack-omp",
    owner: { name: "zukitata03" },
    metadata: {
      description: "pstack by Lauren Tan (poteto), open-sourced by Cursor in cursor/plugins, built to run natively in oh-my-pi (OMP).",
    },
    plugins: [{ name: "pstack-omp", description, source: "./", version, author: upstream.author, homepage: REPO, license: upstream.license }],
  };
  return [
    [".omp-plugin/plugin.json", plugin],
    [".omp-plugin/marketplace.json", marketplace],
  ].map(([path, value]) => [path, { bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\n`), executable: false }]);
}

function render(src, lock) {
  const problems = [];
  const files = new Map();
  const omitted = (path) => OMIT.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  for (const entry of SHIP) {
    const abs = join(src, entry);
    for (const path of statSync(abs).isDirectory() ? walk(abs) : [abs]) {
      const rel = posixPath(relative(src, path));
      if (!omitted(rel)) files.set(rel, file(path));
    }
  }
  for (const path of walk(OVERLAY)) {
    const rel = posixPath(relative(OVERLAY, path));
    // An overlay copy of an upstream file would stop tracking upstream. Map the difference in the adapter instead.
    if (existsSync(join(src, rel))) problems.push(`overlay/${rel} shadows upstream pstack/${rel}`);
    files.set(rel, file(path));
  }

  const adapter = files.get(ADAPTER_PATH);
  if (!adapter) throw new Error(`missing overlay/${ADAPTER_PATH}`);
  for (const { key } of TERMS) if (!text(adapter).includes(key)) problems.push(`overlay/${ADAPTER_PATH} has no row for ${key}`);

  const skills = [...files.keys()].flatMap((path) => path.match(/^skills\/([^/]+)\/SKILL\.md$/)?.slice(1) ?? []);
  const termList = terms();
  for (const skill of skills) {
    const path = `skills/${skill}/SKILL.md`;
    const body = text(files.get(path));
    const name = body.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^name:(.*)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
    // OMP runs a skill by its frontmatter name and resolves skill://<name> by it, so it must match the folder.
    if (name !== skill) problems.push(`${path} has name ${JSON.stringify(name ?? "")}, not ${skill}`);
    if (skill === ADAPTER) continue;
    const docs = [...files.keys()].filter((p) => p.startsWith(`skills/${skill}/`) && p.endsWith(".md")).map((p) => text(files.get(p)));
    if (cursorNamesIn(docs, skills.filter((s) => s !== skill), termList).size > 0) files.get(path).bytes = Buffer.from(addAdapterLine(body));
  }
  for (const path of [...files.keys()].filter((p) => /^agents\/[^/]+\.md$/.test(p))) {
    let body = adaptAgent(text(files.get(path)));
    if (cursorNamesIn([body.replace(/^---\n[\s\S]*?\n---\n/, "")], skills, termList).size > 0) body = addAdapterLine(body);
    files.get(path).bytes = Buffer.from(body);
  }

  // A relative link to an upstream file this build leaves out points at that file on GitHub, as upstream's generator does.
  const has = (path) => files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`));
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    entry.bytes = Buffer.from(
      text(entry).replace(LINK, (link, href) => {
        const target = href.replace(/[#?].*/, "");
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) return link;
        const resolved = posix.join(posix.dirname(path), target).replace(/\/$/, "");
        if (has(resolved)) return link;
        if (resolved.startsWith("..") || !existsSync(join(src, resolved))) {
          problems.push(`${path} links to ${href}, which neither this build nor upstream pstack has`);
          return link;
        }
        const kind = statSync(join(src, resolved)).isDirectory() ? "tree" : "blob";
        return `](${UPSTREAM}/${kind}/main/${SUBTREE}/${resolved}${href.slice(href.search(/[#?]|$/))})`;
      }),
    );
  }

  for (const [path, entry] of manifests(src, lock)) files.set(path, entry);
  return { files, problems };
}

function onDisk() {
  const paths = [
    ...MANAGED_DIRS.flatMap((dir) => (existsSync(join(ROOT, dir)) ? walk(join(ROOT, dir)) : [])),
    ...MANAGED_FILES.map((rel) => join(ROOT, rel)).filter(existsSync),
  ];
  return new Map(paths.map((path) => [posixPath(relative(ROOT, path)), file(path)]));
}

function rendered() {
  const lock = readJson(LOCK);
  const { files, problems } = render(checkout(lock.commit), lock);
  for (const problem of problems) console.log(`FAIL ${problem}`);
  if (problems.length > 0) process.exit(1);
  return { files, lock };
}

function build() {
  const { files, lock } = rendered();
  for (const dir of MANAGED_DIRS) rmSync(join(ROOT, dir), { recursive: true, force: true });
  for (const [path, { bytes, executable }] of files) {
    const abs = join(ROOT, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    chmodSync(abs, executable ? 0o755 : 0o644);
  }
  const skills = [...files.keys()].filter((p) => /^skills\/[^/]+\/SKILL\.md$/.test(p));
  const adapted = skills.filter((p) => text(files.get(p)).includes(ADAPTER_LINE));
  console.log(`built pstack ${lock.version} @ ${lock.commit.slice(0, 7)}: ${skills.length} skills, ${adapted.length} point at skill://${ADAPTER}`);
}

function check() {
  const { files } = rendered();
  const disk = onDisk();
  const drifted = [...new Set([...files.keys(), ...disk.keys()])].sort().filter((path) => {
    const [want, have] = [files.get(path), disk.get(path)];
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  for (const path of drifted.slice(0, 20)) console.log(`stale ${path}`);
  if (drifted.length > 0) {
    console.log(`${drifted.length} generated files differ from a fresh build. Edit overlay/ or scripts/, then run: node scripts/upstream.mjs build`);
    process.exit(1);
  }
  console.log("generated tree is up to date");
}

function sync() {
  const lock = readJson(LOCK);
  ensureCache();
  const head = fetchRef("main");
  const tree = git("rev-parse", `${head}:${SUBTREE}`);
  if (tree === lock.tree) {
    console.log(`upstream pstack unchanged since ${lock.commit.slice(0, 7)} (${lock.version})`);
  } else {
    const version = readJson(join(checkout(head), ".cursor-plugin", "plugin.json")).version;
    // OMP upgrades only to a newer version, so a content change under the same upstream version still bumps ours.
    const forkRevision = version === lock.version ? lock.forkRevision + 1 : lock.forkRevision;
    console.log(`upstream pstack ${lock.version} -> ${version} @ ${head.slice(0, 7)}`);
    writeJson(LOCK, { ...lock, commit: head, tree, version, forkRevision });
  }
  build();
  drift();
}

// Gaps that need a human edit to the adapter. They never fail the build: the skills still work, and the adapter's
// "no row: drop it and say so" rule covers a new name until a row lands.
function drift() {
  const lock = readJson(LOCK);
  checkout(lock.commit);
  const adapter = readFileSync(join(OVERLAY, ADAPTER_PATH), "utf8");
  const items = [];
  const upstream = upstreamTerms();
  if (upstream.length === 0) {
    items.push(`Could not read the TERMS list in upstream \`${UPSTREAM_GENERATOR}\`. Check by hand whether upstream added Cursor names that \`overlay/${ADAPTER_PATH}\` does not map.`);
  }
  for (const key of [...upstream.map(({ key }) => key), ROUTE_KEY]) {
    if (!adapter.includes(key)) items.push(`Upstream maps a new Cursor name, ${key}, and \`overlay/${ADAPTER_PATH}\` has no row for it.`);
  }
  const blob = git("rev-parse", `${lock.commit}:${CLAUDE_ADAPTER}`);
  const reviewed = lock.claudeAdapterReviewed;
  if (blob !== reviewed.blob) {
    if (!hasObject(`${reviewed.commit}^{commit}`)) fetchRef(reviewed.commit);
    const lines = git("diff", reviewed.commit, lock.commit, "--", CLAUDE_ADAPTER).split("\n");
    const shown = lines.slice(0, 300).join("\n");
    const cut = lines.length > 300 ? `\n\n(${lines.length - 300} more lines: ${UPSTREAM}/compare/${reviewed.commit}...${lock.commit})` : "";
    items.push(
      `Upstream changed its Claude Code adapter (\`${CLAUDE_ADAPTER}\`) since ${reviewed.commit.slice(0, 7)}. ` +
        `Port what applies to \`overlay/${ADAPTER_PATH}\`, run \`node scripts/upstream.mjs build\`, then \`node scripts/upstream.mjs ack-adapter\`.\n\n\`\`\`diff\n${shown}\n\`\`\`${cut}`,
    );
  }
  if (items.length === 0) {
    rmSync(DRIFT, { force: true });
    console.log("adapter covers upstream");
    return;
  }
  const report = `Upstream pstack ${lock.version} @ [${lock.commit.slice(0, 7)}](${UPSTREAM}/commit/${lock.commit}) shipped, but the OMP adapter needs a look:\n\n${items.map((item) => `- ${item}`).join("\n")}\n`;
  mkdirSync(dirname(DRIFT), { recursive: true });
  writeFileSync(DRIFT, report);
  console.log(`DRIFT (shipped anyway; written to ${posixPath(relative(ROOT, DRIFT))})\n${report}`);
}

function ackAdapter() {
  const lock = readJson(LOCK);
  checkout(lock.commit);
  writeJson(LOCK, { ...lock, claudeAdapterReviewed: { commit: lock.commit, blob: git("rev-parse", `${lock.commit}:${CLAUDE_ADAPTER}`) } });
  console.log(`Claude Code adapter marked reviewed at ${lock.commit.slice(0, 7)}`);
}

const verbs = { build, check, sync, drift, "ack-adapter": ackAdapter };
const verb = process.argv[2];
if (!verbs[verb]) {
  console.log(`usage: node scripts/upstream.mjs <${Object.keys(verbs).join("|")}>`);
  process.exit(2);
}
verbs[verb]();
