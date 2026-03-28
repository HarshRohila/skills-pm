import { join } from "path";
import { homedir } from "os";

export function getProjectPaths(cwd: string) {
  return {
    targetBase: join(cwd, ".agents", "skills"),
    metaPath: join(cwd, ".skills-pm.json"),
  };
}

export function getGlobalPaths() {
  return {
    targetBase: join(homedir(), ".cursor", "skills"),
    metaPath: join(homedir(), ".cache", "skills-pm", "global.json"),
  };
}

export function getCacheBase() {
  return join(homedir(), ".cache", "skills-pm");
}
