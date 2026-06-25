import { join } from "path";
import { homedir } from "os";

export function getProjectPaths(cwd: string) {
  return {
    targetBases: getProjectInstallBases(cwd),
    metaPath: join(cwd, ".skills-pm.json"),
  };
}

export function getGlobalPaths() {
  return {
    targetBases: getGlobalInstallBases(),
    metaPath: join(homedir(), ".cache", "skills-pm", "global.json"),
  };
}

export function getGlobalInstallBases(): string[] {
  return [
    join(homedir(), ".cursor", "skills"),
    join(homedir(), ".claude", "skills"),
  ];
}

export function getProjectInstallBases(cwd: string): string[] {
  return [
    join(cwd, ".agents", "skills"),
    join(cwd, ".claude", "skills"),
  ];
}

export function getCacheBase() {
  return join(homedir(), ".cache", "skills-pm");
}
