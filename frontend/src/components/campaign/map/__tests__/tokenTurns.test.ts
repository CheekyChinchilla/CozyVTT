/**
 * A token's turns sent one at a time, the newest waiting, and a refusal
 * putting back the facing the server last stored.
 */
import { describe, it, expect, vi } from 'vitest';
import { createTokenTurns, type TurnTarget } from '../tokenTurns';

const goblin: TurnTarget = { campaignId: 'c', mapId: 'map-a', tokenId: 'tok-goblin' };
const wolf: TurnTarget = { campaignId: 'c', mapId: 'map-a', tokenId: 'tok-wolf' };

/** A send whose answers the test gives, in order. */
function server() {
  const calls: Array<{ target: TurnTarget; rotation: number; resolve: () => void; reject: (e: Error) => void }> = [];
  const send = vi.fn((target: TurnTarget, rotation: number) =>
    new Promise<void>((resolve, reject) => { calls.push({ target, rotation, resolve, reject }); }));
  return { send, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createTokenTurns', () => {
  it('sends a token\'s turns one at a time, only the newest waiting', async () => {
    const { send, calls } = server();
    const show = vi.fn();
    const turns = createTokenTurns({ send, show, refused: vi.fn() });

    turns.turn(goblin, 45, 0);
    turns.turn(goblin, 90, 45);
    turns.turn(goblin, 135, 90);
    expect(calls.map((c) => c.rotation)).toEqual([45]);
    expect(show).toHaveBeenLastCalledWith(goblin, 135);

    calls[0].resolve();
    await flush();
    expect(calls.map((c) => c.rotation)).toEqual([45, 135]);
  });

  it('sends two tokens\' turns side by side', () => {
    const { calls, send } = server();
    const turns = createTokenTurns({ send, show: vi.fn(), refused: vi.fn() });
    turns.turn(goblin, 45, 0);
    turns.turn(wolf, 315, 0);
    expect(calls.map((c) => [c.target.tokenId, c.rotation])).toEqual([['tok-goblin', 45], ['tok-wolf', 315]]);
  });

  it('puts back the facing last stored when the last turn waiting is refused, and says so once', async () => {
    const { send, calls } = server();
    const show = vi.fn();
    const refused = vi.fn();
    const turns = createTokenTurns({ send, show, refused });

    turns.turn(goblin, 45, 0);
    calls[0].resolve();
    await flush();
    turns.turn(goblin, 90, 45);
    turns.turn(goblin, 135, 90);
    calls[1].reject(new Error('paused'));
    await flush();
    expect(refused).not.toHaveBeenCalled();
    calls[2].reject(new Error('paused'));
    await flush();

    expect(show).toHaveBeenLastCalledWith(goblin, 45);
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('takes the facing on screen as stored for a token with no turn waiting', async () => {
    const { send, calls } = server();
    const show = vi.fn();
    const turns = createTokenTurns({ send, show, refused: vi.fn() });

    turns.turn(goblin, 225, 180);
    calls[0].reject(new Error('paused'));
    await flush();

    expect(show).toHaveBeenLastCalledWith(goblin, 180);
  });
});
