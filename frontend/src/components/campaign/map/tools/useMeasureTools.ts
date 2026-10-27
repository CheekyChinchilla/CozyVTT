// ============================================
// The measuring tools on the map toolbar: the ruler, and the AoE template.
// Only one is up at a time. Either can stay up beside a DM tool, which takes
// the click first; the template's Escape steps come last for that reason.
//
// A mouse's ruler ends wherever the pointer is. A finger has no hover, so
// a finger or a pen pins the ruler's end instead: for the DM the first tap
// sets the start, the second the end and the third starts again, and a
// press that drags measures from where it lands and ends where it lifts.
// A player's ruler starts at their token, so their tap or drag sets the
// end, except on a token they may move, which the token tool picks up.
// While a token is held, every press is the token's, which a tap puts down:
// a finger's or a pen's hold outlasts a trip to the toolbar.
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AoEAnchor, AoEConfig } from '../layers';
import type { MapLayer } from '../useRenderLoop';
import type { MapTool, PointerAt } from './types';

type Square = { x: number; y: number };

interface UseMeasureToolsArgs {
  isDM: boolean;
  markDirty: (...layers: MapLayer[]) => void;
  /** A player has a token on the map for their ruler to start from; asked at a press. */
  measuresFromToken?: () => boolean;
  /** A token the viewer may move stands on this square, so a tap there picks it up; asked at a press. */
  picksUpAt?: (square: Square) => boolean;
  /** A token is held, so a press puts it down; asked at a press. */
  holdsToken?: () => boolean;
}

const sameSquare = (a: Square, b: Square) => a.x === b.x && a.y === b.y;

export function useMeasureTools({ isDM, markDirty, measuresFromToken = () => false, picksUpAt = () => false, holdsToken = () => false }: UseMeasureToolsArgs) {
  const [measureTool, setMeasureTool] = useState<'ruler' | 'aoe' | null>(null);
  const showRuler = measureTool === 'ruler';
  const showAoE = measureTool === 'aoe';

  // Ruler tool
  const [rulerOrigin, setRulerOrigin] = useState<{ x: number; y: number } | null>(null);
  // Where a finger or a pen ended the ruler; a mouse's end is the hover.
  const [rulerEnd, setRulerEnd] = useState<Square | null>(null);
  // A finger or a pen set the DM's start and no end yet: with no hover to
  // measure to, the start is shown alone, so the first tap is seen.
  const [rulerStartByTouch, setRulerStartByTouch] = useState(false);
  // The press a finger or a pen gave the ruler, until it lifts: a drag's
  // lift, or a pen's on another square, ends the ruler there.
  const rulerPressRef = useRef<{ from: Square; via: PointerAt['via'] } | null>(null);
  const [rulerColor, setRulerColor] = useState<'amber' | 'purple' | 'black'>('amber');

  // AoE tool
  const [aoeConfig, setAoEConfig] = useState<AoEConfig>({ shape: 'sphere', sizeFt: 20 });
  // Held in map pixels, not grid coords, so an Alt-placed anchor can sit
  // part-way into a square. Once set it is a fixed pivot — aiming a cone or
  // line must never move it.
  const [aoeAnchor, setAoEAnchor] = useState<AoEAnchor | null>(null);
  // The panel's Snap to grid. Off, a placement is free, as Alt makes it: a
  // finger or a pen has no Alt.
  const [aoeSnap, setAoESnap] = useState(true);
  // Whether Alt is down, read off each mousemove so the un-pinned preview shows
  // what a click would actually place. Taking it from the event rather than
  // keydown/keyup means it self-corrects if the window loses focus mid-press.
  const aoeAltHeldRef = useRef(false);
  // What a pinned template aims at. Unlike hoverMapPxRef this is *not* cleared
  // when the cursor leaves the canvas: the AoE panel sits over the map, so
  // aiming towards it would otherwise swing the template back to pointing right
  // the moment the cursor crossed onto the panel.
  const aoeAimRef = useRef<{ x: number; y: number } | null>(null);

  // Ruler and AoE are mutually exclusive — turning either on closes the other
  // and drops its placement, so two templates can never share the map.
  const handleToggleRuler = useCallback(() => {
    setMeasureTool((prev) => {
      setRulerEnd(null);
      setRulerStartByTouch(false);
      if (prev === 'ruler') {
        setRulerOrigin(null);
        return null;
      }
      setAoEAnchor(null);
      return 'ruler';
    });
  }, []);

  const handleToggleAoE = useCallback(() => {
    setMeasureTool((prev) => {
      if (prev === 'aoe') {
        setAoEAnchor(null);
        return null;
      }
      setRulerOrigin(null);
      setRulerEnd(null);
      setRulerStartByTouch(false);
      return 'aoe';
    });
  }, []);

  /** Put the ruler away, as picking up a token does. */
  const putRulerAway = useCallback(() => {
    setMeasureTool(null);
    setRulerOrigin(null);
    setRulerEnd(null);
    setRulerStartByTouch(false);
  }, []);

  // Alt switches the AoE tool to free placement, so the preview has to follow
  // the key, not just the mouse. Reading it off mousemove alone left a
  // stationary cursor showing the opposite of what a click would place.
  // Mousemove still refreshes it as a backstop, which is what recovers the flag
  // if a keyup is missed — Alt focuses the menu bar in some browsers, and the
  // window can lose focus mid-press.
  useEffect(() => {
    if (!showAoE) return;
    const sync = (e: KeyboardEvent) => {
      if (aoeAltHeldRef.current === e.altKey) return;
      aoeAltHeldRef.current = e.altKey;
      markDirty('overlay');
    };
    const clear = () => {
      if (!aoeAltHeldRef.current) return;
      aoeAltHeldRef.current = false;
      markDirty('overlay');
    };
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', clear);
    };
  }, [showAoE, markDirty]);

  /** Every mouse move, before any tool is asked: what the template aims at. */
  const track = ({ e, mapPx }: PointerAt) => {
    // AoE aim and Alt state, refreshed on every move for the reasons given
    // where they are declared.
    aoeAimRef.current = mapPx;
    aoeAltHeldRef.current = e.altKey;
    // A mouse over the map takes the ruler's end back from a finger.
    if (e.kind === 'mouse' && rulerEnd) setRulerEnd(null);
    if (e.kind === 'mouse' && rulerStartByTouch) setRulerStartByTouch(false);

    // Aiming a pinned template turns it about a fixed point, so the angle
    // changes with every pixel of cursor movement. The general hover repaint
    // only fires when the cursor crosses into a new *square*, which would
    // make the sweep step round in jumps — the very thing this tool is meant to
    // have stopped doing. The overlay layer alone is cheap to redraw.
    if (showAoE) markDirty('overlay');
  };

  const tool: MapTool = {
    down({ e, via, mapPx, gridCoords }: PointerAt) {
      if (showRuler && !holdsToken()) {
        const pins = e.kind !== 'mouse';
        if (isDM) {
          // A mouse's click sets the start, as it always has.
          if (!pins) {
            setRulerOrigin(gridCoords);
            setRulerEnd(null);
            setRulerStartByTouch(false);
            return true;
          }
          // A finger's or a pen's: start, end, start again; a drag starts.
          const starts = via === 'drag' || !rulerOrigin || rulerEnd !== null;
          if (starts) {
            setRulerOrigin(gridCoords);
            setRulerEnd(null);
          } else {
            setRulerEnd(gridCoords);
          }
          setRulerStartByTouch(starts);
          rulerPressRef.current = { from: gridCoords, via };
          return true;
        }
        // A player's ruler starts at their token, so a press sets its end.
        if (pins && measuresFromToken() && !picksUpAt(gridCoords)) {
          setRulerEnd(via === 'drag' ? null : gridCoords);
          rulerPressRef.current = { from: gridCoords, via };
          return true;
        }
      }
      // AoE tool: click to set/move the anchor the template pivots about.
      // Held in map pixels so Alt, or Snap to grid off, can place it
      // anywhere, not just on a square.
      if (showAoE) {
        setAoEAnchor({ point: mapPx, exact: e.altKey || !aoeSnap });
        return true;
      }
      return false;
    },
    up(at?: PointerAt) {
      const press = rulerPressRef.current;
      rulerPressRef.current = null;
      if (!press || !at || !showRuler) return;
      // A drag, or a pen's press that moved off its square, ends where it lifted.
      if (press.via === 'drag' || (press.via === 'mouse' && !sameSquare(press.from, at.gridCoords))) {
        setRulerEnd(at.gridCoords);
        setRulerStartByTouch(false);
      }
    },
    cancel() {
      rulerPressRef.current = null;
    },
    escape() {
      if (!showAoE) return false;
      // Drop the placement first, then close the tool — the same two-stage
      // escape as the wall tools. The DM guide has always promised Esc
      // dismisses this, but nothing ever handled it.
      if (aoeAnchor) setAoEAnchor(null);
      else setMeasureTool((prev) => (prev === 'aoe' ? null : prev));
      return true;
    },
  };

  return {
    tool, track,
    showRuler, showAoE, handleToggleRuler, handleToggleAoE, putRulerAway,
    rulerOrigin, rulerEnd, rulerStartByTouch, rulerColor, setRulerColor,
    aoeConfig, setAoEConfig, aoeAnchor, setAoEAnchor, aoeAltHeldRef, aoeAimRef, aoeSnap, setAoESnap,
  };
}
