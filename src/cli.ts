#!/usr/bin/env node

import { parseArgs } from "util";
import { parseSource } from "./source-parser.ts";
import { cloneRepo } from "./git.ts";
import { addSkill } from "./commands/add.ts";
import { listSkills, type SkillInfo } from "./commands/list.ts";
import { removeSkill } from "./commands/remove.ts";
import { getProjectPaths, getGlobalPaths, getCacheBase } from "./paths.ts";

const HELP_TEXT = `skills-pm - Cursor Skills Package Manager

Usage:
  skills-pm add <repo> -s <skill-name> [--ref <branch|SHA>] [-g]
  skills-pm list [-g]
  skills-pm remove <skill-name> [-g]

Options:
  -s, --skill <name>   Skill name to install (required for add)
  --ref <ref>          Git branch, tag, or commit SHA (default: HEAD)
  -g, --global         Install/list/remove globally (~/.cursor/skills/)
  -h, --help           Show this help message`;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    skill: { type: "string", short: "s" },
    ref: { type: "string" },
    global: { type: "boolean", short: "g", default: false },
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

async function handleAdd() {
  const repoArg = positionals[1];
  if (!repoArg) {
    console.error("Error: repository is required. Usage: skills-pm add <owner/repo> -s <skill-name>");
    process.exit(1);
  }

  const skillName = values.skill;
  if (!skillName) {
    console.error("Error: --skill (-s) is required. Usage: skills-pm add <owner/repo> -s <skill-name>");
    process.exit(1);
  }

  const source = parseSource(repoArg);
  const sourceStr = `${source.owner}/${source.repo}`;
  const ref = values.ref;

  const refLabel = ref ? ` (ref: ${ref})` : "";
  console.log(`Cloning ${sourceStr}${refLabel}...`);

  const repoDir = await cloneRepo(source, {
    cacheBase: getCacheBase(),
    ref,
  });

  const paths = values.global ? getGlobalPaths() : getProjectPaths(process.cwd());

  const result = await addSkill({
    repoDir,
    skillName,
    targetBase: paths.targetBase,
    metaPath: paths.metaPath,
    source: sourceStr,
    ref: ref ?? "HEAD",
  });

  console.log(`Installed "${result.name}" to ${result.installedTo}`);
}

async function handleList() {
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

  const paths = values.global ? getGlobalPaths() : getProjectPaths(process.cwd());

  await removeSkill({
    name: skillName,
    targetBase: paths.targetBase,
    metaPath: paths.metaPath,
  });

  console.log(`Removed "${skillName}"`);
}

const commands: Record<string, () => Promise<void>> = {
  add: handleAdd,
  list: handleList,
  ls: handleList,
  remove: handleRemove,
  rm: handleRemove,
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
