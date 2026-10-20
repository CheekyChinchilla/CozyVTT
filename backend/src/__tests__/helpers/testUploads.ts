/**
 * The temporary uploads folders the test files upload into (jest.setup.ts).
 *
 * Each is named `cozyvtt-test-uploads-<run>-<random>`, where the run is the
 * process id of the jest run that made it (jest.globalSetup.ts).
 */

const PREFIX = 'cozyvtt-test-uploads-';

/** The start of the name of every uploads folder of run `run`. */
export function uploadsFolderPrefix(run: string): string {
  return `${PREFIX}${run}-`;
}

/**
 * Which of `names`, the entries of the temporary folder, to remove when run
 * `run` ends: its own uploads folders, and those of a run whose process has
 * gone. A run that is killed (Ctrl-C, out of memory) never ends, so never
 * removes its own. A folder of a run still going is in use and is kept, and
 * so is one whose run cannot be told from its name.
 */
export function uploadsFoldersToRemove(names: string[], run: string, isAlive: (pid: number) => boolean): string[] {
  const own = uploadsFolderPrefix(run);
  return names.filter((name) => {
    if (name.startsWith(own)) return true;
    const match = /^cozyvtt-test-uploads-(\d+)-./.exec(name);
    return match !== null && !isAlive(Number(match[1]));
  });
}

/**
 * Whether a process with this id is running. Signal 0 checks without
 * sending anything; ESRCH means there is none. EPERM means there is one,
 * of another user.
 */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
