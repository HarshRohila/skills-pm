#!/usr/bin/env node

import { parseArgs } from "util";
import { parseSource } from "./source-parser.ts";
import { cloneRepo, getOriginSource } from "./git.ts";
import { addSkill, addAllSkills } from "./commands/add.ts";
import { listSkills, type SkillInfo } from "./commands/list.ts";
import { removeSkill } from "./commands/remove.ts";
import { publishSkills } from "./commands/publish.ts";
import { editSkill } from "./commands/edit.ts";
import {
  getProjectPaths,
  getGlobalPaths,
  getCacheBase,
  getGlobalInstallBases,
  getProjectInstallBases,
} from "./paths.ts";
import { reconcileFromMetadata } from "./reconcile.ts";
import { join } from "path";

const HELP_TEXT = `skills-pm - Skills Package Manager (Cursor + Claude Code)

Usage:
  skills-pm add [repo] -s <skill-name> [-b <branch|SHA>] [-g]
  skills-pm add [repo] -a [-b <branch|SHA>] [-g]
  skills-pm list [-g]
  skills-pm remove <skill-name> [-g]
  skills-pm edit <skill-name> [-g]
  skills-pm sync [-g]
  skills-pm publish -b <branch> [-s <skill-name>] [-m <message>]

Options:
  -s, --skill <name>   Skill name to install/publish
  -a, --all            Install all skills from the repo
  -b, --branch <name>  Git ref for add / target branch for publish
  -m, --message <msg>  Commit message for publish
  --ref <ref>          Alias for -b (default: HEAD)
  -g, --global         Install/list/remove globally (~/.cursor/skills + ~/.claude/skills)
  -v, --verbose        Log reconcile actions
  -h, --help           Show this help message

Installs are symlinked into both Cursor and Claude Code paths so the same skill
works in either agent. Project: .agents/skills + .claude/skills. Global:
~/.cursor/skills + ~/.claude/skills.`;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    skill: { type: "string", short: "s" },
    all: { type: "boolean", short: "a", default: false },
    branch: { type: "string", short: "b" },
    message: { type: "string", short: "m" },
    ref: { type: "string" },
    global: { type: "boolean", short: "g", default: false },
    verbose: { type: "boolean", short: "v", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
  strict: true,
});

const command = positionals[0];

if (!command || values.help) {
  console.log(HELP_TEXT);
  process.exit(0);
}

function formatSkillLine(s: SkillInfo): string {
  const refSuffix = s.ref !== "HEAD" ? ` @ ${s.ref}` : "";
  return `  ${s.name} (${s.source}${refSuffix})`;
}

async function reconcileQuiet(
  metaPath: string,
  bases: string[],
  verbose: boolean
): Promise<void> {
  try {
    const result = await reconcileFromMetadata(metaPath, bases);
    if (verbose || result.created.length > 0) {
      for (const c of result.created) {
        console.log(`reconcile: linked ${c.name} → ${c.base}`);
      }
    }
    if (verbose) {
      for (const s of result.skipped) {
        console.log(`reconcile: skipped ${s.name} (${s.reason})`);
      }
    }
  } catch (err) {
    if (verbose) {
      console.error(`reconcile: ${(err as Error).message}`);
    }
  }
}

async function reconcileScope(global: boolean): Promise<void> {
  if (global) {
    await reconcileQuiet(
      getGlobalPaths().metaPath,
      getGlobalInstallBases(),
      values.verbose ?? false
    );
  } else {
    await reconcileQuiet(
      getProjectPaths(process.cwd()).metaPath,
      getProjectInstallBases(process.cwd()),
      values.verbose ?? false
    );
  }
}

async function handleAdd() {
  const repoArg = positionals[1];

  if (!values.skill && !values.all) {
    console.error("Error: --skill (-s) or --all (-a) is required. Usage: skills-pm add [owner/repo] -s <skill-name>");
    process.exit(1);
  }
  if (values.skill && values.all) {
    console.error("Error: --skill (-s) and --all (-a) cannot be used together.");
    process.exit(1);
  }

  await reconcileScope(values.global);

  const source = repoArg
    ? parseSource(repoArg)
    : await getOriginSource(process.cwd());
  const sourceStr = `${source.owner}/${source.repo}`;
  const ref = values.ref ?? values.branch;

  const refLabel = ref ? ` (ref: ${ref})` : "";
  console.log(`Cloning ${sourceStr}${refLabel}...`);

  const repoDir = await cloneRepo(source, {
    cacheBase: getCacheBase(),
    ref,
  });

  const paths = values.global ? getGlobalPaths() : getProjectPaths(process.cwd());

  if (values.all) {
    const results = await addAllSkills({
      repoDir,
      targetBases: paths.targetBases,
      metaPath: paths.metaPath,
      source: sourceStr,
      ref: ref ?? "HEAD",
    });
    console.log(
      `Installed ${results.length} skill(s) into:\n  ${paths.targetBases.join("\n  ")}`
    );
    for (const r of results) {
      console.log(`  ${r.name}`);
    }
  } else {
    const result = await addSkill({
      repoDir,
      skillName: values.skill!,
      targetBases: paths.targetBases,
      metaPath: paths.metaPath,
      source: sourceStr,
      ref: ref ?? "HEAD",
    });
    console.log(
      `Installed "${result.name}" into:\n  ${result.installedTo.join("\n  ")}`
    );
  }
}

async function handleList() {
  await reconcileQuiet(
    getGlobalPaths().metaPath,
    getGlobalInstallBases(),
    values.verbose ?? false
  );
  if (!values.global) {
    await reconcileQuiet(
      getProjectPaths(process.cwd()).metaPath,
      getProjectInstallBases(process.cwd()),
      values.verbose ?? false
    );
  }

  const result = await listSkills({
    projectMetaPath: getProjectPaths(process.cwd()).metaPath,
    globalMetaPath: getGlobalPaths().metaPath,
    globalOnly: values.global,
  });

  if (result.project.length === 0 && result.global.length === 0) {
    console.log("No skills installed.");
    return;
  }

  if (result.project.length > 0) {
    console.log("Project skills:");
    result.project.forEach((s) => console.log(formatSkillLine(s)));
  }

  if (result.global.length > 0) {
    console.log("Global skills:");
    result.global.forEach((s) => console.log(formatSkillLine(s)));
  }
}

async function handleRemove() {
  const skillName = positionals[1];
  if (!skillName) {
    console.error("Error: skill name is required. Usage: skills-pm remove <skill-name>");
    process.exit(1);
  }

  await reconcileScope(values.global);

  const paths = values.global ? getGlobalPaths() : getProjectPaths(process.cwd());

  await removeSkill({
    name: skillName,
    targetBases: paths.targetBases,
    metaPath: paths.metaPath,
  });

  console.log(`Removed "${skillName}"`);
}

async function handlePublish() {
  const branch = values.branch;
  if (!branch) {
    console.error(
      "Error: --branch (-b) is required. Usage: skills-pm publish -b <branch> [-s <skill-name>]"
    );
    process.exit(1);
  }

  const skillFilter = values.skill;
  const filterLabel = skillFilter ? ` (skill: ${skillFilter})` : "";
  console.log(`Publishing skills to branch "${branch}"${filterLabel}...`);

  const result = await publishSkills({
    projectDir: process.cwd(),
    branch,
    skillName: skillFilter,
    message: values.message,
  });

  console.log(
    `Published ${result.skills.length} skill(s) to branch "${result.branch}": ${result.skills.join(", ")}`
  );
  console.log(`Commit: ${result.commitSha}`);
}

async function handleEdit() {
  const skillName = positionals[1];
  if (!skillName) {
    console.error("Error: skill name is required. Usage: skills-pm edit <skill-name>");
    process.exit(1);
  }

  await reconcileScope(values.global);

  const paths = values.global ? getGlobalPaths() : getProjectPaths(process.cwd());

  const result = await editSkill({
    skillName,
    metaPath: paths.metaPath,
    destBase: join(process.cwd(), "skills"),
  });

  console.log(`Copied "${result.name}" to ${result.copiedTo}`);
  console.log(`Edit the skill, then publish with: skills-pm publish -b <branch>`);
}

async function handleSync() {
  if (values.global) {
    const r = await reconcileFromMetadata(
      getGlobalPaths().metaPath,
      getGlobalInstallBases()
    );
    reportSync("global", r);
  } else {
    const proj = await reconcileFromMetadata(
      getProjectPaths(process.cwd()).metaPath,
      getProjectInstallBases(process.cwd())
    );
    reportSync("project", proj);
    const glob = await reconcileFromMetadata(
      getGlobalPaths().metaPath,
      getGlobalInstallBases()
    );
    reportSync("global", glob);
  }
}

function reportSync(
  scope: string,
  r: { created: { name: string; base: string }[]; skipped: { name: string; reason: string }[] }
): void {
  if (r.created.length === 0 && r.skipped.length === 0) {
    console.log(`${scope}: already in sync`);
    return;
  }
  for (const c of r.created) {
    console.log(`${scope}: linked ${c.name} → ${c.base}`);
  }
  for (const s of r.skipped) {
    console.log(`${scope}: skipped ${s.name} (${s.reason})`);
  }
}

const commands: Record<string, () => Promise<void>> = {
  add: handleAdd,
  list: handleList,
  ls: handleList,
  remove: handleRemove,
  rm: handleRemove,
  edit: handleEdit,
  publish: handlePublish,
  sync: handleSync,
};

const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

handler().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
