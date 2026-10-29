// ============================================
// Table hosts: the map, the session panels and the Party column, drawn once
// for the campaign page and moved into the places an arrangement gives them
//
// The page draws one arrangement of its parts at a time (LayoutContext). Were
// the parts drawn inside it, a change of arrangement, such as a tablet turned
// across the compact width, would unmount and mount them again: the whisper
// recipient and unsent chat messages, the dice and draw panels, wall undo,
// Player Preview and a held token would be lost, and every request for the
// map's state sent again, which the server answers at most five times a second.
//
// So TableHosts renders each part once, through a portal into an element of
// its own, the part's host, which is `display: contents` and so adds no box
// between the slot and the part. An arrangement says where each part goes
// with useTableSlot, on an element of its own, the slot. As the slot mounts
// the host is moved into it; as it unmounts the host is moved into TableHosts'
// parking box, where it waits for the next arrangement's slot. The portal's
// container never changes, so React never remounts the part.
//
// - A part mounts once its host is first in a slot, so it is measured in its
//   place from its first render.
// - A move keeps the keyboard focus where it was: the browser's moveBefore
//   keeps it outright, and where there is none the focus is given back after
//   the move. A move without moveBefore takes the part out of the page and
//   puts it back, which scrolls everything in it to the top, so each list
//   that scrolls is put back where it was, and one read to its end, such as
//   the chat's, at its end in its new box. A blur handler in a part may run
//   on such a move, before the focus is given back.
// - A ResizeObserver belongs to the element it observes, so it goes on
//   observing through a move and reports the new size.
// - React events from a part bubble through TableHosts, not through the slot:
//   give a slot no React handlers meant for the part. DOM listeners on the
//   slot or above it, such as the panel library's, see the part where it is
//   drawn.
// ============================================

import {
  createContext,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefCallback,
} from 'react';
import { createPortal } from 'react-dom';

/** The parts of the table that are drawn once for the page, in the order they are portaled. */
const TABLE_PARTS = ['map', 'session', 'party'] as const;

export type TablePart = (typeof TABLE_PARTS)[number];

interface Placement {
  /** Move `part` into `slot`. The function it returns moves it out again. */
  place(part: TablePart, slot: HTMLElement): () => void;
}

const PlacementContext = createContext<Placement | null>(null);

/**
 * The parking box: laid out, so a control inside it that has the keyboard
 * keeps it, and clipped to nothing, with anything fixed inside it held in.
 */
const PARKING_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  overflow: 'hidden',
  contain: 'strict',
};

/** Move `node` to the end of `parent`, keeping the keyboard focus inside it. */
function moveInto(parent: Element, node: Element): void {
  if (node.parentNode === parent) return;
  // Not every browser has moveBefore yet, whatever the DOM types say.
  if (node.isConnected && parent.isConnected && typeof parent.moveBefore === 'function') {
    try {
      parent.moveBefore(node, null);
      return;
    } catch {
      // A move the browser refuses is made as an append, below.
    }
  }
  const focused = document.activeElement;
  const keepFocus = (focused instanceof HTMLElement || focused instanceof SVGElement) && node.contains(focused);
  parent.appendChild(node);
  if (keepFocus && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
}

/** Where a list that scrolls stood, and whether it was at its end. */
interface ScrollPlace {
  element: Element;
  top: number;
  left: number;
  atEnd: boolean;
}

/** Where every list that scrolls inside `root` stands. */
function scrollPlaces(root: Element): ScrollPlace[] {
  const places: ScrollPlace[] = [];
  for (const element of root.querySelectorAll('*')) {
    if (element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth) continue;
    const atEnd = element.scrollHeight > element.clientHeight && element.scrollHeight - element.scrollTop - element.clientHeight <= 1;
    places.push({ element, top: element.scrollTop, left: element.scrollLeft, atEnd });
  }
  return places;
}

function putBack(places: readonly ScrollPlace[]): void {
  for (const { element, top, left, atEnd } of places) {
    if (!element.isConnected) continue;
    const scrollTop = atEnd ? element.scrollHeight : top;
    if (element.scrollTop !== scrollTop) element.scrollTop = scrollTop;
    if (element.scrollLeft !== left) element.scrollLeft = left;
  }
}

function makeHost(part: TablePart): HTMLDivElement {
  const host = document.createElement('div');
  host.style.display = 'contents';
  host.dataset.tablePart = part;
  return host;
}

/**
 * Draws each of `parts` once, for as long as it is mounted, in the slot the
 * arrangement among `children` gives it (useTableSlot).
 */
export function TableHosts({ parts, children }: { parts: Record<TablePart, ReactNode>; children: ReactNode }) {
  const [hosts] = useState<Record<TablePart, HTMLDivElement>>(() => ({
    map: makeHost('map'),
    session: makeHost('session'),
    party: makeHost('party'),
  }));
  const parkingRef = useRef<HTMLDivElement>(null);
  // Where a parked part's lists stood in the slot it left: parked, it is
  // laid out at no size, where its lists have nothing to scroll.
  const [parkedScrolls] = useState(() => new WeakMap<HTMLDivElement, ScrollPlace[]>());
  // The parts that have had a slot. Each is drawn from its first, slot or not.
  const [placed, setPlaced] = useState<ReadonlySet<TablePart>>(() => new Set());

  // Made once, as the hosts are: every slot's ref is made from it, and a new
  // one would detach and attach every slot, moving each part out and back.
  const [placement] = useState<Placement>(() => ({
    place(part, slot) {
      const host = hosts[part];
      const parked = host.parentNode === parkingRef.current;
      const scrolls = parked ? parkedScrolls.get(host) : host.isConnected ? scrollPlaces(host) : undefined;
      moveInto(slot, host);
      if (scrolls) putBack(scrolls);
      setPlaced((was) => (was.has(part) ? was : new Set([...was, part])));
      return () => {
        // Taken by another slot since: of two slots for one part, the one
        // that mounted last holds it.
        if (host.parentNode !== slot) return;
        if (parkingRef.current) {
          parkedScrolls.set(host, scrollPlaces(host));
          moveInto(parkingRef.current, host);
        } else host.remove();
      };
    },
  }));

  return (
    <PlacementContext.Provider value={placement}>
      {children}
      <div ref={parkingRef} style={PARKING_STYLE} />
      {TABLE_PARTS.map((part) => (placed.has(part) ? createPortal(parts[part], hosts[part], part) : null))}
    </PlacementContext.Provider>
  );
}

/**
 * Where an arrangement draws `part`: `ref` goes on the element the part fills.
 * Under TableHosts that element takes no children of its own, since the part
 * is moved into it. `hosted` is false with no TableHosts above, as for a
 * component drawn on its own in a test; the caller then draws the part in the
 * element itself.
 */
export function useTableSlot(part: TablePart): { ref: RefCallback<HTMLElement>; hosted: boolean } {
  const placement = useContext(PlacementContext);
  // The ref is kept in state, so it is the same function for as long as the
  // part and the hosts are: a new one would move the part out and back.
  const [slot, setSlot] = useState(() => slotRef(placement, part));
  if (slot.placement !== placement || slot.part !== part) setSlot(slotRef(placement, part));
  return { ref: slot.ref, hosted: placement !== null };
}

function slotRef(placement: Placement | null, part: TablePart) {
  const ref: RefCallback<HTMLElement> = (element) => (element && placement ? placement.place(part, element) : undefined);
  return { placement, part, ref };
}
