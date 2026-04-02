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
}

export interface PublishResult {
  branch: string;
  skills: string[];
  commitSha: string;
}

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
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

export async function publishSkills(
  options: PublishOptions
): Promise<PublishResult> {
  const { projectDir, branch, skillName, message } = options;

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

  const skillEntries: string[] = [];
  for (const skill of selected) {
    const sha = await buildTreeSha(projectDir, skill.dir);
    skillEntries.push(`040000 tree ${sha}\t${skill.name}`);
  }

  const skillsDirSha = await execGitWithStdin(
    ["mktree"],
    projectDir,
    skillEntries.join("\n") + "\n"
  );

  const rootSha = await execGitWithStdin(
    ["mktree"],
    projectDir,
    `040000 tree ${skillsDirSha}\tskills\n`
  );

  let parentSha: string | null = null;
  try {
    parentSha = await execGit(
      ["rev-parse", "--verify", `refs/heads/${branch}`],
      projectDir
    );
  } catch {
    // branch doesn't exist yet — orphan commit
  }

  const commitMsg =
    message ?? `Publish skills: ${selected.map((s) => s.name).join(", ")}`;
  const commitArgs = ["commit-tree", rootSha, "-m", commitMsg];
  if (parentSha) {
    commitArgs.splice(2, 0, "-p", parentSha);
  }
  const commitSha = await execGit(commitArgs, projectDir);

  await execGit(
    ["update-ref", `refs/heads/${branch}`, commitSha],
    projectDir
  );

  await execGit(
    ["push", "origin", branch, "--force", "--no-verify"],
    projectDir
  );

  return {
    branch,
    skills: selected.map((s) => s.name),
    commitSha,
  };
}
