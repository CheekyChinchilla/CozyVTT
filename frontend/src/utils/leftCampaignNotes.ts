import type { LeftCampaignDetail } from '@/types';

/**
 * One Markdown file holding everything a person kept in a campaign they have
 * left: each note under its title, then their saved rolls.
 */
export function leftCampaignMarkdown(detail: LeftCampaignDetail): string {
  const lines = [`# ${detail.campaign.name}`, ''];
  for (const note of detail.notes) {
    lines.push(`## ${note.title}`, '', note.content, '');
  }
  if (detail.macros.length > 0) {
    lines.push('## Saved rolls', '', ...detail.macros.map((m) => `- ${m.name}: \`${m.expression}\``), '');
  }
  return lines.join('\n');
}

/** A file name for that file, from the campaign's name, with characters no file system takes removed. */
export function leftCampaignFilename(campaignName: string): string {
  const safe = [...campaignName].filter((ch) => ch >= ' ' && !'\\/:*?"<>|'.includes(ch)).join('').trim();
  return `${safe || 'Campaign'} notes.md`;
}
