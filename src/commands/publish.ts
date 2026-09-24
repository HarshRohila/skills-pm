import { discoverSkillPaths } from "../discover.ts";
import { parseSkill, type Skill } from "../parse-skill.ts";
import { join } from "path";
import { readdir } from "fs/promises";
import { execFile, spawn } from "child_process";

export interface PublishOptions {
  projectDir: string;
  branch: string;
  skillName?: string;
  message?: string;
  onProgress?: (message: string) => void;
  /** Test seam: run after fetch, before parent tree is used. */
  onAfterFetch?: () => void | Promise<void>;
}

export interface PublishResult {
  branch: string;
  skills: string[];
  commitSha: string;
}

const MISSING_REMOTE_REF_RE =
  /couldn't find remote ref|unknown revision or path not in the working tree/i;

function execGit(
  args: string[],
  cwd: string,
  opts?: { env?: NodeJS.ProcessEnv }
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, env: opts?.env, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `git ${args[0]} failed (exit ${error.code}): ${stderr.trim()}`
            )
          );
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

function execGitWithStdin(
  args: string[],
  cwd: string,
  input: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data: Buffer) => {
      stdout += data;
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data;
    });
    proc.on("close", (code: number) => {
      if (code !== 0) {
        reject(
          new Error(
            `git ${args[0]} failed (exit ${code}): ${stderr.trim()}`
          )
        );
      } else {
        resolve(stdout.trim());
      }
    });
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

async function buildTreeSha(cwd: string, dirPath: string): Promise<string> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const lines: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isFile()) {
      const sha = await execGit(["hash-object", "-w", fullPath], cwd);
      lines.push(`100644 blob ${sha}\t${entry.name}`);
    } else if (entry.isDirectory()) {
      const sha = await buildTreeSha(cwd, fullPath);
      lines.push(`040000 tree ${sha}\t${entry.name}`);
    }
  }

  return execGitWithStdin(["mktree"], cwd, lines.join("\n") + "\n");
}

function isMissingRemoteRef(error: unknown): boolean {
  return error instanceof Error && MISSING_REMOTE_REF_RE.test(error.message);
}

/** Fetch origin/<branch>. Returns tip SHA, or null if the remote branch does not exist. */
export async function fetchRemoteBranchTip(
  projectDir: string,
  branch: string
): Promise<string | null> {
  try {
    await execGit(["fetch", "origin", branch], projectDir);
  } catch (error) {
    if (isMissingRemoteRef(error)) {
      return null;
    }
    throw error;
  }
  return execGit(["rev-parse", "--verify", "FETCH_HEAD"], projectDir);
}

async function loadParentSkillEntries(
  projectDir: string,
  parentSha: string
): Promise<Map<string, string>> {
  const existingEntries = new Map<string, string>();
  try {
    const treeOutput = await execGit(
      ["ls-tree", `${parentSha}:skills`],
      projectDir
    );
    for (const line of treeOutput.split("\n")) {
      if (!line) continue;
      const tabIdx = line.indexOf("\t");
      const name = line.slice(tabIdx + 1);
      const meta = line.slice(0, tabIdx);
      existingEntries.set(name, `${meta}\t${name}`);
    }
  } catch {
    // no skills/ tree on the branch yet
  }
  return existingEntries;
}

export async function pushPublishedBranch(
  projectDir: string,
  branch: string,
  parentSha: string | null
): Promise<void> {
  // Skip host repo pre-push hooks: the pushed tree only contains skills/,
  // so repo test/lint/typecheck hooks are irrelevant and can hang publish.
  const env = { ...process.env, HUSKY: "0" };
  try {
    if (parentSha) {
      await execGit(
        [
          "push",
          "origin",
          branch,
          `--force-with-lease=refs/heads/${branch}:${parentSha}`,
          "--no-verify",
        ],
        projectDir,
        { env }
      );
    } else {
      await execGit(
        ["push", "origin", branch, "--no-verify"],
        projectDir,
        { env }
      );
    }
  } catch (error) {
    if (
      parentSha &&
      error instanceof Error &&
      /stale info|non-fast-forward/i.test(error.message)
    ) {
      throw new Error(
        `Remote branch ${branch} moved since fetch. Refusing to overwrite. Re-run publish.`
      );
    }
    throw error;
  }
}

export async function publishSkills(
  options: PublishOptions
): Promise<PublishResult> {
  const { projectDir, branch, skillName, message, onProgress, onAfterFetch } =
    options;
  const report = (msg: string) => onProgress?.(msg);

  const skillPaths = await discoverSkillPaths(projectDir);
  if (skillPaths.length === 0) {
    throw new Error(`No skills found in ${projectDir}`);
  }

  const skills: Skill[] = [];
  for (const path of skillPaths) {
    try {
      skills.push(await parseSkill(path));
    } catch {
      // skip invalid SKILL.md files
    }
  }

  let selected = skills;
  if (skillName) {
    selected = skills.filter(
      (s) => s.name.toLowerCase() === skillName.toLowerCase()
    );
    if (selected.length === 0) {
      const available = skills.map((s) => s.name).join(", ");
      throw new Error(
        `Skill "${skillName}" not found. Available: ${available}`
      );
    }
  }

  report(`Fetching origin/${branch}...`);
  const parentSha = await fetchRemoteBranchTip(projectDir, branch);
  if (onAfterFetch) {
    await onAfterFetch();
  }

  const existingEntries = parentSha
    ? await loadParentSkillEntries(projectDir, parentSha)
    : new Map<string, string>();

  for (const skill of selected) {
    const sha = await buildTreeSha(projectDir, skill.dir);
    existingEntries.set(skill.name, `040000 tree ${sha}\t${skill.name}`);
  }

  const skillsDirSha = await execGitWithStdin(
    ["mktree"],
    projectDir,
    [...existingEntries.values()].join("\n") + "\n"
  );

  const rootSha = await execGitWithStdin(
    ["mktree"],
    projectDir,
    `040000 tree ${skillsDirSha}\tskills\n`
  );

  const commitMsg =
    message ?? `Publish skills: ${selected.map((s) => s.name).join(", ")}`;
  const commitArgs = ["commit-tree", rootSha, "-m", commitMsg];
  if (parentSha) {
    commitArgs.splice(2, 0, "-p", parentSha);
  }
  const commitSha = await execGit(commitArgs, projectDir);
  report(`Created commit ${commitSha}`);

  await execGit(
    ["update-ref", `refs/heads/${branch}`, commitSha],
    projectDir
  );

  report(`Pushing ${branch} to origin...`);
  await pushPublishedBranch(projectDir, branch, parentSha);

  return {
    branch,
    skills: selected.map((s) => s.name),
    commitSha,
  };
}
