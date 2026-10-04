import { describe, it, expect } from 'vitest';
import mapCanvas from '../MapCanvas.tsx?raw';
import initiativeTracker from '../InitiativeTracker.tsx?raw';
import diceRoller from '../DiceRoller.tsx?raw';
import chatPanel from '../ChatPanel.tsx?raw';

/**
 * Components subscribe to campaign broadcasts through the socket client, not
 * the socket.io instance behind it.
 *
 * The client throws its socket away and builds a new one on every manual
 * reconnect (the browser coming back online, Retry, a server-side
 * disconnect), and only listeners registered through the client's table are
 * put back on the new one. A listener bound with `getSocket().on(...)` from
 * an effect keyed on the client, a singleton that never changes identity,
 * died with the old socket and was never rebound: after any such reconnect a
 * player stopped receiving map changes, so the DM's Hide and Obscure never
 * reached them, and spirit-plane and vibe changes went the same way. The
 * events below all have typed subscriptions on the client; binding them to
 * the raw instance from a component is the bug this pins.
 */
const REGISTRY_EVENTS = [
  'map.changed',
  'spirit_layer.toggled',
  'spirit_layer.token.toggled',
  'spirit_layer.style_changed',
  'vibe.updated',
  'initiative.state',
  'token.moved',
  'dice.rolled',
  'map.pinged',
];

const COMPONENTS: Array<[string, string]> = [
  ['MapCanvas.tsx', mapCanvas],
  ['InitiativeTracker.tsx', initiativeTracker],
  ['DiceRoller.tsx', diceRoller],
  ['ChatPanel.tsx', chatPanel],
];

describe('campaign broadcasts are subscribed through the socket client', () => {
  it.each(COMPONENTS)('%s binds none of them to the raw socket', (file, source) => {
    for (const event of REGISTRY_EVENTS) {
      // Any `<instance>.on('<event>'`; the client's own methods are `on<Event>(handler)`.
      const raw = new RegExp(`\\.on\\(\\s*'${event.replace(/\./g, '\\.')}'`);
      expect(source, `${file} binds ${event} to the raw socket`).not.toMatch(raw);
    }
  });
});
