import { existsSync, readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../config/release-workflow.json", import.meta.url), "utf8"));

export const releaseWorkflowPath = config.path;
export const releaseWorkflowName = config.name;

export function readReleaseWorkflow() {
  if (!existsSync(releaseWorkflowPath)) {
    throw new Error(`Configured release workflow is missing: ${releaseWorkflowPath}`);
  }
  return readFileSync(releaseWorkflowPath, "utf8");
}
