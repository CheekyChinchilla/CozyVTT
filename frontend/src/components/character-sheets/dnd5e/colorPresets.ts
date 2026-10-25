/**
 * The header colours a D&D 5e sheet offers, shared by its view and editor.
 *
 * A sheet stores the chosen preset's `name` as its `themeColor` (or a custom
 * `#rrggbb`). `from` and `to` are the header gradient's classes; `hex` is the
 * same colour as a value, for inline styles and for picking readable text.
 */
export const COLOR_PRESETS = [
  { name: 'Classic Red', from: 'from-red-700', to: 'to-red-900', hex: '#b91c1c' },
  { name: 'Royal Blue', from: 'from-blue-700', to: 'to-blue-900', hex: '#1d4ed8' },
  { name: 'Forest Green', from: 'from-green-700', to: 'to-green-900', hex: '#15803d' },
  { name: 'Deep Purple', from: 'from-purple-700', to: 'to-purple-900', hex: '#7e22ce' },
  { name: 'Amber Gold', from: 'from-amber-600', to: 'to-amber-800', hex: '#d97706' },
  { name: 'Slate Gray', from: 'from-slate-700', to: 'to-slate-900', hex: '#334155' },
  { name: 'Crimson', from: 'from-rose-700', to: 'to-rose-900', hex: '#be123c' },
  { name: 'Teal', from: 'from-teal-700', to: 'to-teal-900', hex: '#0f766e' },
  { name: 'Indigo', from: 'from-indigo-700', to: 'to-indigo-900', hex: '#4338ca' },
  { name: 'Emerald', from: 'from-emerald-700', to: 'to-emerald-900', hex: '#047857' },
  { name: 'Orange', from: 'from-orange-700', to: 'to-orange-900', hex: '#c2410c' },
  { name: 'Pink', from: 'from-pink-700', to: 'to-pink-900', hex: '#be185d' },
];
