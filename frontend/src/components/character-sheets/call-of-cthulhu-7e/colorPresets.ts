/**
 * The header colours a Call of Cthulhu sheet offers, shared by its view and editor.
 *
 * A sheet stores the chosen preset's `name` as its `themeColor` (or a custom
 * `#rrggbb`). `from` and `to` are the header gradient's classes; `hex` is the
 * same colour as a value, for inline styles and for picking readable text.
 * `via` and `border` are the gradient's middle stop and the header's bottom
 * border, written out in full: Tailwind generates only class names it finds
 * whole in the source.
 */
export const COLOR_PRESETS = [
  { name: 'Dark Forest', from: 'from-green-900', to: 'to-green-800', via: 'via-green-800', border: 'border-amber-600', hex: '#14532d' },
  { name: 'Noir Shadow', from: 'from-slate-900', to: 'to-slate-800', via: 'via-slate-800', border: 'border-amber-500', hex: '#0f172a' },
  { name: 'Deep Sepia', from: 'from-sepia-900', to: 'to-sepia-800', via: 'via-sepia-800', border: 'border-sepia-400', hex: '#2E2419' },
  { name: 'Midnight Blue', from: 'from-blue-950', to: 'to-blue-900', via: 'via-blue-900', border: 'border-amber-600', hex: '#172554' },
  { name: 'Burgundy Wine', from: 'from-red-950', to: 'to-red-900', via: 'via-red-900', border: 'border-amber-500', hex: '#450a0a' },
  { name: 'Victorian Purple', from: 'from-purple-950', to: 'to-purple-900', via: 'via-purple-900', border: 'border-amber-600', hex: '#3b0764' },
  { name: 'Emerald Mist', from: 'from-emerald-900', to: 'to-emerald-800', via: 'via-emerald-800', border: 'border-amber-600', hex: '#064e3b' },
  { name: 'Charcoal Gray', from: 'from-gray-900', to: 'to-gray-800', via: 'via-gray-800', border: 'border-amber-500', hex: '#111827' },
  { name: 'Teal Shadow', from: 'from-teal-950', to: 'to-teal-900', via: 'via-teal-900', border: 'border-amber-600', hex: '#042f2e' },
  { name: 'Amber Dusk', from: 'from-amber-900', to: 'to-amber-800', via: 'via-amber-800', border: 'border-amber-400', hex: '#78350f' },
];
