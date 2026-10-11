// The Playwright runner is Node, whose types the frontend does not install;
// the environment is all these files read of it.
declare const process: { env: Record<string, string | undefined> };
