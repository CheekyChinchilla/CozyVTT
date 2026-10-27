/**
 * Who a chat message can be whispered to, and the `/w` form of the box.
 *
 * Display names are not unique and may hold spaces, so a member is always
 * chosen by user id. Display names and character names are free text that a
 * member writes, so no two members are ever shown with equal names, compared
 * ignoring case and surrounding space: in the To list, in "Whisper to" and
 * "Whisper from", in the line under the box and in a refusal of `/w`. The
 * rule, applied in order, each step only to names still equal after the last:
 *
 * 1. A display name another member shares gets their role beside it, and a
 *    player's character after the role: "Dana (DM)", "Mara (Player, Vex)",
 *    "Mara (Player)", "Ash (Spectator)". The role comes first, so a character
 *    named "DM" makes "Dana (Player, DM)", never the DM's "Dana (DM)".
 * 2. Names still equal get the day each member joined: "Mara (Player,
 *    joined 3 Oct)", in the browser's own way of writing a date.
 * 3. Names still equal, members who joined on the same day, get their order
 *    of joining among them, the earlier keeping 1: "Mara (Player, joined 3
 *    Oct, 2)". A name written to copy another's can need this more than once.
 *
 * What a member writes cannot mark them as the DM: the To list gives the DM a
 * group of their own, and the line under the box the DM's shield, both by
 * user id.
 */

import { CampaignRole } from '@/types';
import type { CampaignMembership, Character } from '@/types';

/** A member someone may whisper to, with the name the chat shows for them. */
export interface WhisperTarget {
  userId: string;
  /** The display name, with what tells it apart from another member's beside it (the rule above). */
  label: string;
  displayName: string;
}

const ROLE_LABEL: Record<CampaignRole, string> = {
  [CampaignRole.DM]: 'DM',
  [CampaignRole.PLAYER]: 'Player',
  [CampaignRole.SPECTATOR]: 'Spectator',
};

/** The day a member joined, short, as the browser writes dates: "3 Oct" or "Oct 3". */
export function joinedDay(joinedAt: string): string {
  return new Date(joinedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** A name as two are compared: case and surrounding space ignored. */
const sameAs = (name: string) => name.trim().toLowerCase();

interface Labelling {
  membership: CampaignMembership;
  displayName: string;
  /** What is written in brackets after the name, in order. */
  parts: string[];
}

const labelOf = (l: Labelling) => (l.parts.length > 0 ? `${l.displayName} (${l.parts.join(', ')})` : l.displayName);

/** The members whose `key` another member has too, in groups. */
function equalGroups(all: readonly Labelling[], key: (l: Labelling) => string): Labelling[][] {
  const groups = new Map<string, Labelling[]>();
  for (const l of all) {
    const k = sameAs(key(l));
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

const byJoining = (a: Labelling, b: Labelling) =>
  Date.parse(a.membership.joinedAt) - Date.parse(b.membership.joinedAt) || a.membership.userId.localeCompare(b.membership.userId);

/** Every member of the campaign by user id, labelled by the rule above. */
export function whisperTargets(memberships: readonly CampaignMembership[], characters: readonly Character[]): Map<string, WhisperTarget> {
  const all: Labelling[] = memberships.map((membership) => ({ membership, displayName: membership.user?.displayName ?? 'Unknown User', parts: [] }));

  for (const group of equalGroups(all, (l) => l.displayName)) {
    for (const l of group) {
      const m = l.membership;
      l.parts.push(ROLE_LABEL[m.role]);
      if (m.role === CampaignRole.PLAYER) {
        const characterId = m.characterIds.find((id) => characters.some((c) => c.id === id && c.userId === m.userId));
        const character = characters.find((c) => c.id === characterId);
        if (character) l.parts.push(character.name);
      }
    }
  }
  for (const group of equalGroups(all, labelOf)) {
    for (const l of group) l.parts.push(`joined ${joinedDay(l.membership.joinedAt)}`);
  }
  // Each round leaves the members of every equal group unequal to each
  // other; only a name copied from one of the new ones can make another.
  for (let round = 0; round <= all.length; round++) {
    const groups = equalGroups(all, labelOf);
    if (groups.length === 0) break;
    for (const group of groups) [...group].sort(byJoining).forEach((l, i) => l.parts.push(String(i + 1)));
  }

  return new Map(all.map((l) => [l.membership.userId, { userId: l.membership.userId, label: labelOf(l), displayName: l.displayName }]));
}

/** What the box's text says, read as `/w <name> <message>`. */
export type SlashWhisper =
  | { kind: 'none' }
  | { kind: 'to'; userId: string; content: string }
  | { kind: 'nobody'; typed: string }
  | { kind: 'several'; labels: string[] };

const SLASH_WHISPER = /^\/w(?:hisper)?(?:\s+|$)/i;

/** True while the box's text starts with `/w` or `/whisper`. */
export function isSlashWhisper(text: string): boolean {
  return SLASH_WHISPER.test(text);
}

/**
 * Read `/w <name> <message>`, or `/whisper`, its long form: the longest
 * display name the text after it starts with, ignoring case, followed by a
 * space or the end; failing that, one member whose name starts with the
 * first word typed. Two members are named back so the sender can choose;
 * nobody is too. `targets` holds the members the sender may whisper to.
 */
export function readSlashWhisper(text: string, targets: readonly WhisperTarget[]): SlashWhisper {
  const start = SLASH_WHISPER.exec(text);
  if (!start) return { kind: 'none' };
  const rest = text.slice(start[0].length);
  const lower = rest.toLowerCase();

  const fullNames = targets.filter((t) => {
    const name = t.displayName.toLowerCase();
    return name.length > 0 && lower.startsWith(name) && (lower.length === name.length || /\s/.test(lower[name.length]));
  });
  if (fullNames.length > 0) {
    const longest = Math.max(...fullNames.map((t) => t.displayName.length));
    const named = fullNames.filter((t) => t.displayName.length === longest);
    if (named.length > 1) return { kind: 'several', labels: named.map((t) => t.label) };
    return { kind: 'to', userId: named[0].userId, content: rest.slice(longest).trim() };
  }

  const typed = rest.split(/\s/, 1)[0] ?? '';
  const begun = typed ? targets.filter((t) => t.displayName.toLowerCase().startsWith(typed.toLowerCase())) : [];
  if (begun.length === 1) return { kind: 'to', userId: begun[0].userId, content: rest.slice(typed.length).trim() };
  if (begun.length > 1) return { kind: 'several', labels: begun.map((t) => t.label) };
  return { kind: 'nobody', typed };
}

/** Why the panel will not send a `/w` it read as anything but a whisper with a message. */
export function slashWhisperRefusal(read: Exclude<SlashWhisper, { kind: 'none' }>): string {
  switch (read.kind) {
    case 'to':
      return 'Write your message after the name.';
    case 'several':
      return `That name fits more than one person: ${read.labels.join(', ')}. Choose one in the To list.`;
    case 'nobody':
      return read.typed ? `Nobody in this campaign is called "${read.typed}".` : 'Write a name after /w or /whisper, then your message.';
  }
}

/** Members in the order the To list shows them: by name as shown, then by id. */
export function byLabel(a: WhisperTarget, b: WhisperTarget): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }) || a.userId.localeCompare(b.userId);
}
