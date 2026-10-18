/**
 * The header colours a Call of Cthulhu sheet offers, shared by its view and editor.
 *
 * A sheet stores the chosen preset's `name` as its `themeColor` (or a custom
 * `#rrggbb`). `from` and `to` are the header gradient's classes; `hex` is the
 * same colour as a value, for inline styles and for picking readable text.
 *
 * TODO(sheets): the header's middle gradient stop and bottom border are drawn
 * with `via-${accent}` and `border-${border}`, built at runtime. Tailwind only
 * generates class names written out in full in the source, so no preset gets
 * its middle stop and three lose their amber border. Right: write the full
 * class names into each preset.
 */
export const COLOR_PRESETS = [
  { name: 'Dark Forest', from: 'from-green-900', to: 'to-green-800', accent: 'green-800', border: 'amber-600', hex: '#14532d' },
  { name: 'Noir Shadow', from: 'from-slate-900', to: 'to-slate-800', accent: 'slate-800', border: 'amber-500', hex: '#0f172a' },
  { name: 'Deep Sepia', from: 'from-sepia-900', to: 'to-sepia-800', accent: 'sepia-800', border: 'sepia-400', hex: '#2E2419' },
  { name: 'Midnight Blue', from: 'from-blue-950', to: 'to-blue-900', accent: 'blue-900', border: 'amber-600', hex: '#172554' },
  { name: 'Burgundy Wine', from: 'from-red-950', to: 'to-red-900', accent: 'red-900', border: 'amber-500', hex: '#450a0a' },
  { name: 'Victorian Purple', from: 'from-purple-950', to: 'to-purple-900', accent: 'purple-900', border: 'amber-600', hex: '#3b0764' },
  { name: 'Emerald Mist', from: 'from-emerald-900', to: 'to-emerald-800', accent: 'emerald-800', border: 'amber-600', hex: '#064e3b' },
  { name: 'Charcoal Gray', from: 'from-gray-900', to: 'to-gray-800', accent: 'gray-800', border: 'amber-500', hex: '#111827' },
  { name: 'Teal Shadow', from: 'from-teal-950', to: 'to-teal-900', accent: 'teal-900', border: 'amber-600', hex: '#042f2e' },
  { name: 'Amber Dusk', from: 'from-amber-900', to: 'to-amber-800', accent: 'amber-800', border: 'amber-400', hex: '#78350f' },
];
