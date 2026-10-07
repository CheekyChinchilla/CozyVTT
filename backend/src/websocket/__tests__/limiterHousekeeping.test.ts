/**
 * The socket limiters' five-minute housekeeping forgets an event only once no
 * check can still count it.
 *
 * It pruned every limiter with a window of its own choosing. The chat
 * limiter was pruned at one minute, while a campaign's chat cooldown can be
 * up to five, so a clean-up landing inside a long cooldown let the player
 * post early. The state-request limiter was left out of the housekeeping
 * altogether, so its entries were never removed.
 *
 * The module is loaded afresh under fake timers in each case, so its
 * housekeeping interval runs on the fake clock.
 */

type Shared = typeof import('../shared');

async function loadShared(): Promise<Shared> {
  jest.resetModules();
  return import('../shared');
}

/** The keys a limiter is holding, read from its private store. */
function heldKeys(limiter: object): number {
  return (limiter as unknown as { events: Map<string, number[]> }).events.size;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the limiter housekeeping', () => {
  it('keeps a five-minute chat cooldown in force through a clean-up', async () => {
    const { chatMessageLimiter } = await loadShared();
    const cooldown = 5 * MINUTE;

    // Posted 200 seconds in. The housekeeping runs at the five-minute mark,
    // 100 seconds into this cooldown.
    jest.advanceTimersByTime(200 * SECOND);
    expect(chatMessageLimiter.check('player:campaign', 1, cooldown)).toBe(true);
    jest.advanceTimersByTime(101 * SECOND);

    expect(chatMessageLimiter.check('player:campaign', 1, cooldown)).toBe(false);
  });

  it('removes state-request entries once their window has passed', async () => {
    const { stateRequestAllowed, stateRequestLimiter } = await loadShared();

    expect(stateRequestAllowed({ userId: 'player', id: 'socket' }, 'walls:request')).toBe(true);
    expect(heldKeys(stateRequestLimiter)).toBe(1);
    jest.advanceTimersByTime(5 * MINUTE);

    expect(heldKeys(stateRequestLimiter)).toBe(0);
  });
});
