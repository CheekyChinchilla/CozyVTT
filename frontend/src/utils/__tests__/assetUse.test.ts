import { describe, it, expect } from 'vitest';
import type { AssetUse } from '@/types';
import { describeAssetUse } from '../assetUse';
import { apiAssetInUse } from '../errors';

const use = (over: Partial<AssetUse>): AssetUse => ({
  kind: 'map', name: 'Goblin Cave', campaignId: 'c1', campaignName: 'Lost Mine', count: 1, ...over,
});

describe('describeAssetUse', () => {
  it.each([
    [use({}), 'Map "Goblin Cave" (Lost Mine)'],
    [use({ kind: 'token', name: 'Ambush Road', count: 1 }), '1 token on the map "Ambush Road" (Lost Mine)'],
    [use({ kind: 'token', name: 'Ambush Road', count: 3 }), '3 tokens on the map "Ambush Road" (Lost Mine)'],
    [use({ kind: 'character', name: 'Hannah' }), 'Character "Hannah" (Lost Mine)'],
    [use({ kind: 'character', name: 'Hannah', campaignId: null, campaignName: null }), 'Character "Hannah"'],
    [use({ kind: 'characterTemplate', name: 'Starter Fighter', campaignId: null, campaignName: null }), 'Character template "Starter Fighter"'],
    [use({ kind: 'creature', name: 'Boss Bat' }), 'Creature "Boss Bat" (Lost Mine)'],
    [use({ kind: 'tokenTemplate', name: 'Torch' }), 'Token template "Torch" (Lost Mine)'],
    [use({ kind: 'campaignSetting', name: 'Lost Mine' }), 'Ambient sound of the campaign "Lost Mine"'],
  ])('describes %j', (entry, text) => {
    expect(describeAssetUse(entry)).toBe(text);
  });

  it('counts what the viewer may not see without naming it', () => {
    const hidden = { name: null, campaignId: null, campaignName: null };
    expect(describeAssetUse(use({ ...hidden, count: 1 }))).toBe('1 map you cannot see');
    expect(describeAssetUse(use({ ...hidden, kind: 'tokenTemplate', count: 4 }))).toBe('4 token templates you cannot see');
  });
});

describe('apiAssetInUse', () => {
  const refusal = (data: object, status = 409) => ({ response: { status, data } });

  it('reads the list of uses from the refusal', () => {
    const parsed = apiAssetInUse(refusal({
      code: 'ASSET_IN_USE',
      usage: [
        { kind: 'map', name: 'Cave', campaignId: 'c1', campaignName: 'Mine', count: 1 },
        { kind: 'bogus', name: 'x' },
        'not an entry',
        { kind: 'token', name: null, campaignId: null, campaignName: null, count: 2 },
      ],
      omitted: 5,
    }));
    expect(parsed).toEqual({
      usage: [
        { kind: 'map', name: 'Cave', campaignId: 'c1', campaignName: 'Mine', count: 1 },
        { kind: 'token', name: null, campaignId: null, campaignName: null, count: 2 },
      ],
      omitted: 5,
    });
  });

  it('is undefined for every other failure', () => {
    expect(apiAssetInUse(refusal({ code: 'SOMETHING_ELSE' }))).toBeUndefined();
    expect(apiAssetInUse(refusal({ message: 'Forbidden' }, 403))).toBeUndefined();
    expect(apiAssetInUse(new Error('network'))).toBeUndefined();
  });
});
