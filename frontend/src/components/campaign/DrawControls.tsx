/**
 * DrawControls
 * The drawing tools' panel: the tool, its colour, width, fill and snap,
 * whether the DM's drawing is for the DM alone, a polygon's Done and Cancel,
 * and clearing. It sets no place of its own, so whatever holds it places it:
 * the DM's tool stack, or the corner a player's panel opens in. On the
 * compact layout the same controls are DrawStrip's, a strip across the
 * map's foot; the two share the tools, the colours, the hints and the
 * questions before a clear, written once here.
 */

import { useState, type ComponentType } from 'react';
import { ArrowUpRight, Circle, Crosshair, Eraser, Minus, Pencil, Pentagon, Square, Type, X } from 'lucide-react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import { DRAW_TOOL_KINDS, type DrawSettings, type DrawToolKind } from './map/tools/useDrawTool';

/** Each tool's name, as its button is called, and its icon. */
export const TOOLS: Record<DrawToolKind, { label: string; icon: ComponentType<{ className?: string }> }> = {
  pen: { label: 'Pen', icon: Pencil },
  line: { label: 'Line', icon: Minus },
  arrow: { label: 'Arrow', icon: ArrowUpRight },
  rect: { label: 'Rectangle', icon: Square },
  ellipse: { label: 'Ellipse', icon: Circle },
  polygon: { label: 'Polygon', icon: Pentagon },
  text: { label: 'Text label', icon: Type },
  eraser: { label: 'Eraser', icon: Eraser },
  laser: { label: 'Laser pointer', icon: Crosshair },
};

/** The named colours, by DRAWING_LIMITS.namedColors' order. */
export const COLOUR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'White', 'Black'] as const;

/** What each tool does, in a line under the tools. */
export const HINTS: Record<DrawToolKind, string> = {
  pen: 'Drag to draw.',
  line: 'Drag from one end to the other.',
  arrow: 'Drag from the tail to the point.',
  rect: 'Drag from one corner to the other.',
  ellipse: 'Drag across the box it fills.',
  polygon: 'Tap or click each corner, then the first again or Done to close it.',
  text: 'Tap or click where the label goes, type it, then press Enter.',
  eraser: 'Tap or click a drawing to erase it.',
  laser: 'Drag to point. Everyone sees it fade; nothing is kept.',
};

/** The tools Snap to grid applies to, and of those the ones Fill shapes does. */
export const SHAPES = new Set<DrawToolKind>(['line', 'arrow', 'rect', 'ellipse', 'polygon']);
export const FILLABLE = new Set<DrawToolKind>(['rect', 'ellipse', 'polygon']);

/** A member with drawings on the map the DM may clear, and how many. */
export interface MemberDrawings {
  authorId: string;
  /** Null for someone no longer in the campaign. */
  name: string | null;
  count: number;
}

export interface DrawControlsProps {
  kind: DrawToolKind;
  onKindChange: (kind: DrawToolKind) => void;
  settings: DrawSettings;
  onSettingsChange: (patch: Partial<DrawSettings>) => void;
  /** The DM's panel offers Only I can see this and Clear drawings; a player's, Clear mine. */
  isDM: boolean;
  /**
   * A player who may not draw now (a pause, or Players may draw off) is
   * offered only the eraser and Clear mine, for their own drawings.
   */
  onlyErase?: boolean;
  /** The corners of the polygon being drawn, for Done and Cancel. */
  polygonCorners: number;
  onPolygonDone: () => void;
  onPolygonCancel: () => void;
  /** How many drawings on the map this member may clear: their own, or for the DM every one. */
  clearable: number;
  onClear: () => void;
  /** For the DM: the other members with drawings on the map, each to clear alone. */
  members: MemberDrawings[];
  onClearMember: (authorId: string) => void;
  onClose: () => void;
}

/** "Mara's drawings", or for someone who has left, saying so. */
export const drawingsOf = (member: MemberDrawings) => (member.name === null ? 'the drawings of someone who has left' : `${member.name}'s drawings`);
const howMany = (count: number) => (count === 1 ? '1 drawing' : `${count} drawings`);

/** Whether the colour is one of the named eight, or another one picked. */
export const isNamedColour = (colour: string) => (DRAWING_LIMITS.namedColors as readonly string[]).includes(colour);

/** What the DM is asked before a clear: about every drawing on the map, or one member's. */
export type ClearAsking = 'all' | MemberDrawings | null;

interface ClearDrawingsDialogsProps {
  asking: ClearAsking;
  /** The question is answered either way, or put aside. */
  onAnswered: () => void;
  clearable: number;
  onClear: () => void;
  onClearMember: (authorId: string) => void;
}

/** The DM's questions before a clear, which cannot be undone: how many, and whose. */
export function ClearDrawingsDialogs({ asking, onAnswered, clearable, onClear, onClearMember }: ClearDrawingsDialogsProps) {
  const member = asking !== null && asking !== 'all' ? asking : null;
  return (
    <>
      <ConfirmDialog
        isOpen={asking === 'all'}
        title="Clear every drawing on this map?"
        message={`This erases all ${clearable === 1 ? '1 drawing' : `${clearable} drawings`} on this map, yours and the players', for everyone. It cannot be undone.`}
        confirmLabel="Clear drawings"
        onConfirm={() => {
          onAnswered();
          onClear();
        }}
        onCancel={onAnswered}
      />
      <ConfirmDialog
        isOpen={member !== null}
        title={member ? `Clear ${drawingsOf(member)}?` : ''}
        message={member
          ? `This erases ${member.name === null ? 'the' : `${member.name}'s`} ${howMany(member.count)}${member.name === null ? ' of someone who has left' : ''} on this map, for everyone. Nobody else's are touched. It cannot be undone.`
          : ''}
        confirmLabel={member ? `Clear ${member.name === null ? 'their drawings' : drawingsOf(member)}` : ''}
        onConfirm={() => {
          if (member) onClearMember(member.authorId);
          onAnswered();
        }}
        onCancel={onAnswered}
      />
    </>
  );
}

const toolButton = (on: boolean) =>
  `touch-target inline-flex items-center justify-center w-8 h-8 rounded border transition-colors ${
    on ? 'bg-amber-400/30 text-amber-200 border-amber-400/60' : 'bg-stone-700/60 text-stone-300 border-stone-600/50 hover:bg-stone-700'
  }`;

export default function DrawControls({
  kind, onKindChange, settings, onSettingsChange, isDM, onlyErase = false, polygonCorners, onPolygonDone, onPolygonCancel, clearable, onClear, members, onClearMember, onClose,
}: DrawControlsProps) {
  const [asking, setAsking] = useState<ClearAsking>(null);
  const custom = !isNamedColour(settings.color);

  return (
    <section
      aria-label="Drawing tools"
      className="flex flex-col gap-2 p-2 bg-stone-800/90 rounded-lg border border-amber-400/20 w-full text-stone-300"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs text-amber-400/70 font-medium uppercase tracking-wide">Draw</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Put the drawing tools away"
          title="Put the drawing tools away"
          className="touch-target inline-flex items-center justify-center w-6 h-6 rounded-sm text-stone-400 hover:text-white hover:bg-stone-700"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {DRAW_TOOL_KINDS.filter((tool) => !onlyErase || tool === 'eraser').map((tool) => {
          const { label, icon: Icon } = TOOLS[tool];
          return (
            <button
              key={tool}
              type="button"
              aria-label={label}
              aria-pressed={kind === tool}
              title={label}
              onClick={() => onKindChange(tool)}
              className={toolButton(kind === tool)}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-stone-400">
        {onlyErase && 'Drawing is off for now. '}
        {HINTS[kind]}
        {kind === 'eraser' && !isDM && ' You can erase only your own.'}
      </p>

      {kind === 'polygon' && polygonCorners > 0 && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onPolygonDone}
            disabled={polygonCorners < 3}
            className="touch-target flex-1 text-[11px] py-1 rounded border bg-amber-400/20 text-amber-200 border-amber-400/50 disabled:opacity-40"
          >
            Done
          </button>
          <button
            type="button"
            onClick={onPolygonCancel}
            className="touch-target flex-1 text-[11px] py-1 rounded border bg-stone-700/60 text-stone-300 border-stone-600/50"
          >
            Cancel
          </button>
        </div>
      )}

      {kind !== 'eraser' && (
        <>
          <div>
            <span className="text-[10px] text-stone-400 block mb-1">Colour</span>
            <div className="flex flex-wrap gap-1">
              {DRAWING_LIMITS.namedColors.map((colour, i) => (
                <button
                  key={colour}
                  type="button"
                  aria-label={COLOUR_NAMES[i]}
                  aria-pressed={settings.color === colour}
                  title={COLOUR_NAMES[i]}
                  onClick={() => onSettingsChange({ color: colour })}
                  className="touch-target inline-flex items-center justify-center w-6 h-6"
                >
                  <span
                    className={`block w-5 h-5 rounded-full border-2 ${settings.color === colour ? 'border-amber-300 scale-110' : 'border-stone-500'}`}
                    style={{ backgroundColor: colour }}
                  />
                </button>
              ))}
              <label className={`touch-target inline-flex items-center justify-center w-6 h-6 rounded-full ${custom ? 'ring-2 ring-amber-300' : ''}`} title="Another colour">
                <input
                  type="color"
                  aria-label="Another colour"
                  value={settings.color}
                  onChange={(e) => {
                    const colour = e.target.value.toLowerCase();
                    if (/^#[0-9a-f]{6}$/.test(colour)) onSettingsChange({ color: colour });
                  }}
                  className="w-5 h-5 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
            </div>
          </div>

          {kind !== 'laser' && (
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between text-[10px] text-stone-400">
                <span>Width</span>
                <span>{settings.width}{kind === 'text' ? ` (letters ${settings.width * 4} px tall)` : ''}</span>
              </span>
              <input
                type="range"
                aria-label="Width"
                min={DRAWING_LIMITS.minWidth}
                max={DRAWING_LIMITS.maxWidth}
                step={1}
                value={settings.width}
                onChange={(e) => onSettingsChange({ width: Number(e.target.value) })}
                className="w-full accent-amber-400 touch-target"
              />
            </label>
          )}
        </>
      )}

      {SHAPES.has(kind) && (
        <div className="flex flex-col gap-1">
          {FILLABLE.has(kind) && (
            <label className="touch-target flex items-center gap-2 text-[11px] cursor-pointer select-none">
              <input type="checkbox" checked={settings.fill} onChange={(e) => onSettingsChange({ fill: e.target.checked })} className="accent-amber-400" />
              Fill shapes
            </label>
          )}
          <label className="touch-target flex items-center gap-2 text-[11px] cursor-pointer select-none">
            <input type="checkbox" checked={settings.snap} onChange={(e) => onSettingsChange({ snap: e.target.checked })} className="accent-amber-400" />
            Snap to grid
          </label>
        </div>
      )}

      {/* The laser pointer goes to everyone, so the box is not offered with it. */}
      {isDM && kind !== 'eraser' && kind !== 'laser' && (
        <label className="touch-target flex items-center gap-2 text-[11px] cursor-pointer select-none">
          <input type="checkbox" checked={settings.dmOnly} onChange={(e) => onSettingsChange({ dmOnly: e.target.checked })} className="accent-amber-400" />
          Only I can see this
        </label>
      )}
      {isDM && kind === 'laser' && <p className="text-[11px] text-stone-400">Everyone sees the laser pointer.</p>}

      <button
        type="button"
        onClick={() => (isDM ? setAsking('all') : onClear())}
        disabled={clearable === 0}
        className="touch-target text-[11px] py-1 rounded border bg-red-900/30 text-red-300 border-red-700/40 hover:bg-red-900/50 disabled:opacity-40"
      >
        {isDM ? 'Clear drawings' : 'Clear mine'}
      </button>
      {isDM && members.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-stone-400">Or one member's:</p>
          {members.map((member) => (
            <button
              key={member.authorId}
              type="button"
              onClick={() => setAsking(member)}
              className="touch-target text-[11px] text-left px-2 py-1 rounded border bg-red-900/20 text-red-300 border-red-700/30 hover:bg-red-900/40"
            >
              {`Clear ${drawingsOf(member)} (${member.count})`}
            </button>
          ))}
        </div>
      )}

      <ClearDrawingsDialogs asking={asking} onAnswered={() => setAsking(null)} clearable={clearable} onClear={onClear} onClearMember={onClearMember} />
    </section>
  );
}
