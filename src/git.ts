import type { ParsedSource } from "./source-parser.ts";
import { join } from "path";
import { stat } from "fs/promises";
import { execFile } from "child_process";

export interface CloneOptions {
  cacheBase: string;
  ref?: string;
}

function execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args[0]} failed (exit ${error.code}): ${stderr.trim()}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export async function cloneRepo(
  source: ParsedSource,
  options: CloneOptions
): Promise<string> {
  const refLabel = options.ref ?? "HEAD";
  const destDir = join(options.cacheBase, source.owner, source.repo, refLabel);

  if (await dirExists(destDir)) {
    return destDir;
  }

  const url = `https://github.com/${source.owner}/${source.repo}.git`;

  const cloneArgs = ["clone", "--depth", "1"];
  if (options.ref) {
    cloneArgs.push("--branch", options.ref);
  }
  cloneArgs.push(url, destDir);

  await execGit(cloneArgs);

  return destDir;
}

export async function getOriginSource(cwd: string): Promise<ParsedSource> {
  let url: string;
  try {
    const { stdout } = await execGit(["remote", "get-url", "origin"], cwd);
    url = stdout.trim();
  } catch {
    throw new Error(
      "No git remote 'origin' found. Specify a repo explicitly: skills-pm add <owner/repo> -s <skill-name>"
    );
  }

  // git@github.com:owner/repo.git
  const sshMatch = /^git@github\.com:(.+?)\/(.+?)(?:\.git)?$/.exec(url);
  if (sshMatch) {
    return { owner: sshMatch[1]!, repo: sshMatch[2]! };
  }

  // https://github.com/owner/repo[.git]
  const httpsMatch = /^https:\/\/github\.com\/(.+?)\/(.+?)(?:\.git)?\/?$/.exec(
    url
  );
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  }

  throw new Error(
    `Could not parse GitHub owner/repo from remote URL: ${url}. Specify a repo explicitly: skills-pm add <owner/repo> -s <skill-name>`
  );
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
