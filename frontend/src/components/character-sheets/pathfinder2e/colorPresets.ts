/**
 * The header colours a Pathfinder 2e sheet offers, shared by its view and editor.
 *
 * A sheet stores the chosen preset's `name` as its `themeColor` (or a custom
 * `#rrggbb`). `from` and `to` are the header gradient's classes; `hex` is the
 * same colour as a value, for inline styles and for picking readable text.
 *
 * TODO(sheets): the editor's active tab text and underline are drawn with
 * `text-${accent}` and `border-${accent}`, built at runtime. Tailwind only
 * generates class names written out in full in the source, so for most
 * presets one or both classes do not exist and the tab is not fully coloured.
 * Right: write the full class names into each preset.
 */
export const COLOR_PRESETS = [
  { name: 'Pathfinder Blue', from: 'from-blue-700', to: 'to-blue-900', accent: 'blue-700', hex: '#1d4ed8' },
  { name: 'Golden', from: 'from-amber-600', to: 'to-amber-800', accent: 'amber-600', hex: '#d97706' },
  { name: 'Emerald', from: 'from-emerald-700', to: 'to-emerald-900', accent: 'emerald-700', hex: '#047857' },
  { name: 'Royal Purple', from: 'from-purple-700', to: 'to-purple-900', accent: 'purple-700', hex: '#7e22ce' },
  { name: 'Crimson', from: 'from-rose-700', to: 'to-rose-900', accent: 'rose-700', hex: '#be123c' },
  { name: 'Teal', from: 'from-teal-700', to: 'to-teal-900', accent: 'teal-700', hex: '#0f766e' },
  { name: 'Indigo', from: 'from-indigo-700', to: 'to-indigo-900', accent: 'indigo-700', hex: '#4338ca' },
  { name: 'Slate', from: 'from-slate-700', to: 'to-slate-900', accent: 'slate-700', hex: '#334155' },
];
