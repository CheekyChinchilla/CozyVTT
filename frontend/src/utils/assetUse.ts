// ============================================
// Where an asset is used, in words
//
// The server refuses to delete an asset something still names, and lists what
// does (`ASSET_IN_USE`). One line per entry, shown in the confirmation that
// asks whether to delete it anyway.
// ============================================

import type { AssetUse, AssetUseKind } from '@/types';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** How an entry the viewer may not see is counted: "2 maps you cannot see". */
const UNSEEN: Record<AssetUseKind, [one: string, many: string]> = {
  map: ['map', 'maps'],
  token: ['token', 'tokens'],
  character: ['character', 'characters'],
  characterTemplate: ['character template', 'character templates'],
  creature: ['creature', 'creatures'],
  tokenTemplate: ['token template', 'token templates'],
  campaignSetting: ['campaign ambient sound', 'campaign ambient sounds'],
};

/** One use as a line of text, e.g. `3 tokens on the map "Ambush Road" (Lost Mine)`. */
export function describeAssetUse(use: AssetUse): string {
  if (use.name === null) {
    const [one, many] = UNSEEN[use.kind];
    return `${use.count} ${plural(use.count, one, many)} you cannot see`;
  }

  const name = `"${use.name}"`;
  const where = use.campaignName && use.kind !== 'campaignSetting' ? ` (${use.campaignName})` : '';
  switch (use.kind) {
    case 'map':
      return `Map ${name}${where}`;
    case 'token':
      return `${use.count} ${plural(use.count, 'token', 'tokens')} on the map ${name}${where}`;
    case 'character':
      return `Character ${name}${where}`;
    case 'characterTemplate':
      return `Character template ${name}`;
    case 'creature':
      return `Creature ${name}${where}`;
    case 'tokenTemplate':
      return `Token template ${name}${where}`;
    case 'campaignSetting':
      return `Ambient sound of the campaign ${name}`;
  }
}
