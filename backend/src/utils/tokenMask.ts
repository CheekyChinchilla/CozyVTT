// ============================================
// What a player is sent of a token: the field rule every token goes through,
// and the identity mask for an obscured token they do not control.
// Byte-identical in backend/src/utils and frontend/src/utils
// (visionParity.test.ts checks), so the DM's Player Preview can show exactly
// what the server sends.
//
// The DM marks a token obscured to say "you can see something is there, but
// not what". The masked token is built from a list of what a recipient may
// know, never by copying the token and blanking fields: a field added to
// tokens later is then left out of the mask by default, where a blanked copy
// would forward it. Kept: the id, where it stands, how big it is, which plane
// it is on, whether it is visible, and the flag itself, so a client can draw
// a shape and a question mark in the right place. Everything else is a
// neutral default. No name or picture. No conditions or metadata. No
// character or template link, because the client's character-sheet cache
// would otherwise name it and show its hit points. No disposition, because
// the ring drawn around a token encodes it. No hit points. No controller,
// because the campaign roster maps a user id to a name. The plain creature
// kind, because a player-type token is somebody's character. No facing, no
// initiative, the plain display mode.
// ============================================

/** The fields the rule and the mask read; any token shape with them will do. */
export interface MaskableToken {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  layer: string;
  visible: boolean;
  name: string;
  imageUrl: string;
  rotation: number;
  conditions: string[];
  metadata: Record<string, unknown>;
  characterId?: string | null;
  controlledBy?: string | null;
  type?: string;
  disposition?: unknown;
  hp?: unknown;
  showHpBar?: boolean;
  initiative?: number | null;
  displayMode?: string;
  creatureTemplateId?: string | null;
  obscured?: boolean;
  notes?: unknown;
  statBlock?: unknown;
  sightRadius?: unknown;
}

/** Every field a masked token has, so a test can pin the exact set. */
export const MASKED_TOKEN_FIELDS = [
  'id',
  'position',
  'size',
  'layer',
  'visible',
  'obscured',
  'name',
  'imageUrl',
  'rotation',
  'conditions',
  'metadata',
  'characterId',
  'controlledBy',
  'type',
  'disposition',
  'hp',
  'showHpBar',
  'initiative',
  'displayMode',
  'creatureTemplateId',
] as const;

export type MaskedField = (typeof MASKED_TOKEN_FIELDS)[number];

/** The token as someone who may not know what it is receives it. */
export function maskObscuredToken<T extends MaskableToken>(token: T): T {
  const masked: MaskableToken = {
    id: token.id,
    position: token.position,
    size: token.size,
    layer: token.layer,
    visible: token.visible,
    obscured: true,
    name: '',
    imageUrl: '',
    rotation: 0,
    conditions: [],
    metadata: {},
    characterId: null,
    controlledBy: null,
    type: 'npc',
    disposition: null,
    hp: null,
    showHpBar: false,
    initiative: null,
    displayMode: 'pog',
    creatureTemplateId: null,
  };
  // Whatever fields T has beyond these are exactly what the mask leaves out.
  return masked as T;
}

/**
 * The token as a recipient who does or does not control it is sent it: never
 * the DM's notes or the stat block, hit points only for their own token or
 * one whose bar is on, darkvision and the creature template link only for
 * their own, and an obscured token they do not control through the mask
 * above. The server applies this before
 * sending; the DM's Player Preview applies it to show the same thing.
 */
export function tokenSentTo<T extends MaskableToken>(token: T, own: boolean): T {
  const sent: T = { ...token };
  delete sent.notes;
  delete sent.statBlock;
  if (!(own || token.showHpBar === true)) delete sent.hp;
  if (!own) {
    delete sent.sightRadius;
    // The link resolves to a library entry, whose stat block and true name
    // the DM may have renamed the token to hide.
    delete sent.creatureTemplateId;
  }
  return !own && token.obscured === true ? maskObscuredToken(sent) : sent;
}
