// ============================================
// The keyboard shortcuts window: every key the map takes, from MAP_SHORTCUTS,
// for whoever is looking. Opened by ? on the map and by the header's
// Keyboard shortcuts button; the campaign page holds whether it is open.
// ============================================

import { Keyboard } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { shortcutsFor, type MapShortcut } from './map/keyboard';

interface ShortcutsPanelProps {
  open: boolean;
  onClose: () => void;
  /** The viewer's role in the campaign: a player is shown no wall keys, a spectator no token keys. */
  role: string | null | undefined;
}

function ShortcutTable({ caption, shortcuts }: { caption: string; shortcuts: MapShortcut[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Keys</th>
          <th scope="col">What they do</th>
        </tr>
      </thead>
      <tbody>
        {shortcuts.map((s) => (
          <tr key={`${s.who}:${s.does}`} className="border-t border-brand/10">
            <td className="py-1.5 pr-4 align-top whitespace-nowrap">
              {s.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 && ' '}
                  <kbd className="rounded-sm border border-brand/30 bg-surface-light px-1.5 py-0.5 font-mono text-xs text-ink">{k}</kbd>
                </span>
              ))}
            </td>
            <td className="py-1.5 text-ink">{s.does}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ShortcutsPanel({ open, onClose, role }: ShortcutsPanelProps) {
  const shown = shortcutsFor(role);
  const map = shown.filter((s) => s.who !== 'dm');
  const walls = shown.filter((s) => s.who === 'dm');

  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" icon={Keyboard} size="md">
      <div className="space-y-5">
        <p className="text-sm text-ink-muted">
          Click the map first, so the keys go to it; Shift+Tab leaves it. None of them act while you type. On a Mac, use Cmd where it says Ctrl.
        </p>
        <ShortcutTable caption="On the map" shortcuts={map} />
        {walls.length > 0 && <ShortcutTable caption="Walls and undo, yours alone" shortcuts={walls} />}
      </div>
    </Modal>
  );
}
