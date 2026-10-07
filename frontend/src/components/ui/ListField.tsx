import { useState } from 'react';

/**
 * A text box that holds a list: "Common, Elven", or one item per line.
 *
 * The sheets used to split, trim and join the list again on every keystroke,
 * which threw away whatever had not yet become an entry: the comma typed after
 * a word, the space before the next one, a new line at the end, the " - "
 * before an item's notes. Only pasting a whole list worked.
 *
 * The text is kept as typed while the box is in use. Each change is still
 * passed up as a list straight away, so the form and the save always hold
 * what the box says. The text is tidied into the list's own spelling once the
 * box is left, and replaced if the list changes from outside while it is open.
 *
 * Styling is the caller's, as with NumberField.
 */
interface ListFieldProps<T> {
  value: readonly T[];
  onChange: (items: T[]) => void;
  /** The list a text says. */
  parse: (text: string) => T[];
  /** How a list is written in the box. */
  format: (items: readonly T[]) => string;
  /** A textarea, for lists of one item per line. */
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
}

/** Whether a text still says exactly this list. */
function says<T>(text: string, items: readonly T[], parse: (text: string) => T[]): boolean {
  return JSON.stringify(parse(text)) === JSON.stringify(items);
}

export default function ListField<T>({
  value,
  onChange,
  parse,
  format,
  multiline = false,
  rows,
  className,
  placeholder,
  id,
  'aria-label': ariaLabel,
}: ListFieldProps<T>) {
  // What was typed, while the box is in use. Null shows the list as written.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null && says(draft, value, parse) ? draft : format(value);

  const handleChange = (text: string) => {
    setDraft(text);
    onChange(parse(text));
  };

  const common = {
    id,
    'aria-label': ariaLabel,
    value: shown,
    placeholder,
    className,
    onBlur: () => setDraft(null),
  };

  return multiline ? (
    <textarea {...common} rows={rows} onChange={(e) => handleChange(e.target.value)} />
  ) : (
    <input {...common} type="text" onChange={(e) => handleChange(e.target.value)} />
  );
}

/** A comma-separated list of names: blanks dropped, each one trimmed. */
export function parseCommaList(text: string): string[] {
  return text.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
}

export function formatCommaList(items: readonly string[]): string {
  return items.join(', ');
}

/** One name per line: blank lines dropped, each one trimmed. */
export function parseLineList(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

export function formatLineList(items: readonly string[]): string {
  return items.join('\n');
}
