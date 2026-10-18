// ============================================
// The measuring tools on the map toolbar: the ruler, and the AoE template.
// Only one is up at a time. Either can stay up beside a DM tool, which takes
// the click first; the template's Escape steps come last for that reason.
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AoEAnchor, AoEConfig } from '../layers';
import type { MapLayer } from '../useRenderLoop';
import type { MapTool, PointerAt } from './types';

interface UseMeasureToolsArgs {
  isDM: boolean;
  markDirty: (...layers: MapLayer[]) => void;
}

export function useMeasureTools({ isDM, markDirty }: UseMeasureToolsArgs) {
  const [measureTool, setMeasureTool] = useState<'ruler' | 'aoe' | null>(null);
  const showRuler = measureTool === 'ruler';
  const showAoE = measureTool === 'aoe';

  // Ruler tool
  const [rulerOrigin, setRulerOrigin] = useState<{ x: number; y: number } | null>(null);
  const [rulerColor, setRulerColor] = useState<'amber' | 'purple' | 'black'>('amber');

  // AoE tool
  const [aoeConfig, setAoEConfig] = useState<AoEConfig>({ shape: 'sphere', sizeFt: 20 });
  // Held in map pixels, not grid coords, so an Alt-placed anchor can sit
  // part-way into a square. Once set it is a fixed pivot — aiming a cone or
  // line must never move it.
  const [aoeAnchor, setAoEAnchor] = useState<AoEAnchor | null>(null);
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
      return 'aoe';
    });
  }, []);

  /** Put the ruler away, as picking up a token does. */
  const putRulerAway = useCallback(() => {
    setMeasureTool(null);
    setRulerOrigin(null);
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

    // Aiming a pinned template turns it about a fixed point, so the angle
    // changes with every pixel of cursor movement. The general hover repaint
    // only fires when the cursor crosses into a new *square*, which would
    // make the sweep step round in jumps — the very thing this tool is meant to
    // have stopped doing. The overlay layer alone is cheap to redraw.
    if (showAoE) markDirty('overlay');
  };

  const tool: MapTool = {
    down({ e, mapPx, gridCoords }: PointerAt) {
      // If ruler is active and user is DM, set ruler origin on click
      if (showRuler && isDM) {
        setRulerOrigin(gridCoords);
        return true;
      }
      // AoE tool: click to set/move the anchor the template pivots about.
      // Held in map pixels so Alt can place it anywhere, not just on a square.
      if (showAoE) {
        setAoEAnchor({ point: mapPx, exact: e.altKey });
        return true;
      }
      return false;
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
    rulerOrigin, rulerColor, setRulerColor,
    aoeConfig, setAoEConfig, aoeAnchor, setAoEAnchor, aoeAltHeldRef, aoeAimRef,
  };
}
