// ============================================
// The identity mask for an obscured token: what a player who does not control
// it is sent. Byte-identical in backend/src/utils and frontend/src/utils
// (visionParity.test.ts checks), so the DM's Player Preview can show exactly
// what the server sends.
//
// The DM marks a token obscured to say "you can see something is there, but
// not what". Where it stands, how big it is, which plane it is on and the flag
// itself stay, so a client can draw a shape and a question mark in the right
// place. Everything that says who or what it is goes: characterId because the
// client's character-sheet cache would otherwise name it and show its hit
// points, disposition because the ring drawn around a token encodes it. Notes,
// the stat block and darkvision are already kept from anyone but the DM and
// the controller before this is applied.
// ============================================

/** The fields the mask reads or blanks; any token shape with them will do. */
export interface MaskableToken {
  name: string;
  imageUrl: string;
  conditions: string[];
  metadata: Record<string, unknown>;
  characterId?: string | null;
  disposition?: unknown;
  hp?: unknown;
  showHpBar?: boolean;
  creatureTemplateId?: string | null;
  obscured?: boolean;
}

/** The token as someone who may not know what it is receives it. */
export function maskObscuredToken<T extends MaskableToken>(token: T): T {
  return {
    ...token,
    name: '',
    imageUrl: '',
    conditions: [],
    metadata: {},
    characterId: null,
    disposition: null,
    hp: null,
    showHpBar: false,
    creatureTemplateId: null,
    obscured: true,
  };
}
