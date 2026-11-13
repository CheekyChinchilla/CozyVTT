/**
 * StoryNotes Component
 *
 * A Horror d100 character's story, as a list of titled notes the player
 * adds, titles, orders and removes.
 */

import React from 'react';
import { BookText, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import ListLimitNote, { listIsFull } from '../../ListLimitNote';
import { LIMIT_NOTE_CLASS } from '../limitNoteClass';
import { SHEET_LONG_TEXT_MAX, SHEET_NAME_MAX } from '@/constants/sheetLimits';
import type { HorrorD100SheetStoryNote } from '@/types/game-systems/horrorD100Sheet';

interface StoryNotesProps {
  /** The character's notes, in the order they are shown. */
  notes: readonly HorrorD100SheetStoryNote[];

  /** Edit mode */
  editable?: boolean;

  /** Edit mode: replaces the list. */
  onChange?: (notes: HorrorD100SheetStoryNote[]) => void;
}

/** What a note is called by its controls and where it has no title. */
const called = (note: HorrorD100SheetStoryNote, index: number) => (note.title.trim() === '' ? `note ${index + 1}` : note.title);

/**
 * StoryNotes - the titled notes of a character's story
 */
export const StoryNotes: React.FC<StoryNotesProps> = ({ notes, editable = false, onChange }) => {
  const set = (index: number, field: keyof HorrorD100SheetStoryNote, value: string) =>
    onChange?.(notes.map((note, i) => (i === index ? { ...note, [field]: value } : note)));

  const move = (index: number, to: number) => {
    if (to < 0 || to >= notes.length) return;
    const next = [...notes];
    [next[index], next[to]] = [next[to], next[index]];
    onChange?.(next);
  };

  if (!editable) {
    if (notes.length === 0) return null;
    return (
      <div className="space-y-4">
        {notes.map((note, index) => (
          <div key={index} className="bg-paper border border-ink/20 rounded-md p-4">
            <h4 className="flex items-center space-x-2 text-sm font-semibold text-ink mb-2">
              <BookText className="w-4 h-4 text-ink-secondary" />
              <span>{note.title.trim() === '' ? 'Untitled note' : note.title}</span>
            </h4>
            <p className="text-sm text-ink whitespace-pre-wrap">{note.text}</p>
          </div>
        ))}
      </div>
    );
  }

  const full = listIsFull(notes);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <BookText className="w-5 h-5 text-ink-secondary" />
          <h3 className="text-lg font-bold text-ink">Story</h3>
        </div>
        <Button
          onClick={() => onChange?.([...notes, { title: 'New note', text: '' }])}
          disabled={full}
          variant="secondary" className="text-sm py-1 px-3 flex items-center space-x-1"
        >
          <Plus className="w-4 h-4" />
          <span>Add Note</span>
        </Button>
      </div>
      <ListLimitNote full={full} className={LIMIT_NOTE_CLASS} />
      {notes.length === 0 && (
        <p className="text-sm text-ink-secondary italic">
          No notes yet. Add one for each part of the character&apos;s story you want to keep, such as a background, people who matter or old injuries.
        </p>
      )}
      {notes.map((note, index) => (
        <div key={index} className="bg-paper border border-ink/20 rounded-md p-3 space-y-2">
          {/* On a phone the title takes the row and its buttons go under it:
              beside three buttons a finger wide it had no room for a title. */}
          <div className="flex flex-wrap justify-end sm:flex-nowrap items-center gap-2">
            <input
              type="text"
              value={note.title}
              onChange={(e) => set(index, 'title', e.target.value)}
              aria-label={`Title of note ${index + 1}`}
              placeholder="Title"
              maxLength={SHEET_NAME_MAX}
              className="min-w-0 flex-1 basis-full sm:basis-0 px-2 py-1 border border-ink/20 rounded-sm text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
            <button
              type="button"
              onClick={() => move(index, index - 1)}
              disabled={index === 0}
              aria-label={`Move ${called(note, index)} up`}
              title="Move up"
              className="touch-target inline-flex items-center justify-center p-1 rounded-sm text-ink-secondary hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => move(index, index + 1)}
              disabled={index === notes.length - 1}
              aria-label={`Move ${called(note, index)} down`}
              title="Move down"
              className="touch-target inline-flex items-center justify-center p-1 rounded-sm text-ink-secondary hover:bg-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onChange?.(notes.filter((_, i) => i !== index))}
              aria-label={`Remove ${called(note, index)}`}
              title="Remove"
              className="touch-target inline-flex items-center justify-center p-1 rounded-sm text-danger-ink hover:bg-danger/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            value={note.text}
            onChange={(e) => set(index, 'text', e.target.value)}
            aria-label={`Text of note ${index + 1}`}
            rows={3}
            maxLength={SHEET_LONG_TEXT_MAX}
            className="w-full px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
          />
        </div>
      ))}
    </div>
  );
};

export default StoryNotes;
