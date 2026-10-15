/**
 * The first `max` UTF-16 units of `text`, as JavaScript and the length limits
 * count them, never splitting a character that takes two (an emoji, or a
 * letter outside the Basic Multilingual Plane): half of one cannot be stored,
 * and the database refuses it. Such a character at the cut is left out whole.
 */
export function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = Math.max(0, max);
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}
