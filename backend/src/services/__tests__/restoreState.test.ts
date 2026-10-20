/**
 * The running restore, as a shutdown sees it.
 */
import { startRestore, startReplacingDatabase, endRestore, restoresInProgress } from '../restoreState';

afterEach(() => endRestore());

describe('restoresInProgress', () => {
  it('counts the restore from its claim to its end', () => {
    expect(restoresInProgress.count).toBe(0);
    expect(startRestore()).toBe(true);
    expect(restoresInProgress.count).toBe(1);
    startReplacingDatabase();
    expect(restoresInProgress.count).toBe(1);
    endRestore();
    expect(restoresInProgress.count).toBe(0);
  });

  it('settles at once with no restore running, and when one ends', async () => {
    await expect(restoresInProgress.finished()).resolves.toBeUndefined();

    startRestore();
    let settled = false;
    const finished = restoresInProgress.finished().then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    endRestore();
    await finished;
    expect(settled).toBe(true);
  });
});
