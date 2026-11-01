import type { DiceMacro, PersonalNote } from '@/types';
import { savedRollDetail } from './savedRolls';

/** Everything a person kept in a campaign they have left, note text included. */
export interface LeftCampaignContents {
  campaign: { name: string };
  notes: PersonalNote[];
  macros: DiceMacro[];
}

/**
 * One Markdown file holding everything a person kept in a campaign they have
 * left: each note under its title, then their saved rolls.
 */
export function leftCampaignMarkdown({ campaign, notes, macros }: LeftCampaignContents): string {
  const lines = [`# ${campaign.name}`, ''];
  for (const note of notes) {
    lines.push(`## ${note.title}`, '', note.content, '');
  }
  if (macros.length > 0) {
    const line = (m: DiceMacro) => [`- ${m.name}: \`${m.expression}\``, savedRollDetail(m)].filter(Boolean).join(', ');
    lines.push('## Saved rolls', '', ...macros.map(line), '');
  }
  return lines.join('\n');
}

/** A file name for that file, from the campaign's name, with characters no file system takes removed. */
export function leftCampaignFilename(campaignName: string): string {
  const safe = [...campaignName].filter((ch) => ch >= ' ' && !'\\/:*?"<>|'.includes(ch)).join('').trim();
  return `${safe || 'Campaign'} notes.md`;
}
