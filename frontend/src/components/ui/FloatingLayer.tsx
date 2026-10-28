// ============================================
// FloatingLayer: where a menu or a picker that floats over the page is drawn
//
// What it holds is drawn on <body>, and it adds no element of its own, so
// the menu keeps its root, its classes, its ref and its placement. A portal
// keeps its place in React's tree, so React's events from inside it still
// reach the components it is rendered in.
//
// Why the body: the campaign page's columns are a react-resizable-panels
// group, and the library takes a press in a divider's strip (44 pixels on a
// touch screen, 10 with a mouse) whenever the pressed element is inside the
// group, whatever is drawn over the divider. It looks at stacking only for an
// element outside the group, and declines when that element is in front. So
// a menu drawn in place inside a column lost the presses on its items where
// it lay over a divider. On the body a menu's `fixed z-50` or `z-60` root is
// in front of the page; a `z-*` on the page's root or its <main>, at or
// above the menus' own, would put the page in front again and bring the bug
// back. The body also keeps a menu clear of an ancestor's transform,
// which would hold a `fixed` element inside it.
// ============================================

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface FloatingLayerProps {
  children: ReactNode;
}

export default function FloatingLayer({ children }: FloatingLayerProps) {
  return createPortal(children, document.body);
}
