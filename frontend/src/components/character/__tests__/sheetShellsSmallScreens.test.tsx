/**
 * The character sheet and its editor on a phone.
 *
 * Both dialogs kept a desktop window's frame at every width: a 16 px margin
 * round the window, a 2 px border, rounded corners and 95 percent of the
 * screen's height, with the viewer's header, content and footer padded for a
 * desk. On a 390 px phone that left about 258 px of sheet. Below the `sm`
 * breakpoint, and on a screen less than 500 px tall such as a phone turned
 * sideways, they now take the whole screen with a compact header and footer;
 * from `sm` up they are as before. jsdom evaluates no media query, so the
 * classes are asserted; the matrix shows the layout.
 *
 * They were drawn where they were opened, inside the roster, the initiative
 * tracker or the map, where an ancestor with a transform or a backdrop filter
 * would hold a `fixed` overlay inside itself. They are portaled to the body,
 * as every other dialog is.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Character, CampaignMembership } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';
import indexCss from '@/index.css?raw';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => null,
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/services/api', () => ({
  api: { getUser: vi.fn(), getCharacter: vi.fn(), updateCharacter: vi.fn() },
}));

const sheet = pf2eCharacter();
const membership = { userId: 'owner', campaignId: sheet.campaignId, role: 'PLAYER', characterIds: [] } as unknown as CampaignMembership;
const ownSheet = { ...sheet, userId: 'owner' } as Character;

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/** The full-screen frame below sm and on a short screen, and today's window from sm up. */
const FRAME = {
  overlay: ['p-0', 'sm:p-4', 'short:p-0'],
  dialog: [
    'h-dvh', 'max-h-dvh', 'rounded-none', 'border-0',
    'sm:h-auto', 'sm:max-h-[95vh]', 'sm:rounded-xl', 'sm:border-2',
    'short:h-dvh', 'short:max-h-dvh', 'short:rounded-none', 'short:border-0',
  ],
};

describe('the character sheet', () => {
  const open = () => {
    const view = render(
      <div data-testid="opener">
        <CharacterSheetViewerModal character={ownSheet} campaignId={sheet.campaignId ?? undefined} membership={membership} onClose={() => {}} />
      </div>
    );
    return { view, dialog: screen.getByRole('dialog', { name: sheet.name }) };
  };

  it('is drawn in the body, outside whatever opened it', () => {
    const { dialog } = open();
    expect(screen.getByTestId('opener')).not.toContainElement(dialog);
    expect(dialog.closest('body')).toBe(document.body);
  });

  it('takes the whole screen on a phone and keeps its window from sm up', () => {
    const { dialog } = open();
    expect(classes(dialog.parentElement)).toEqual(expect.arrayContaining(FRAME.overlay));
    expect(classes(dialog)).toEqual(expect.arrayContaining(FRAME.dialog));
  });

  it('has a compact header, content and footer on a phone and on a short screen', () => {
    const { dialog } = open();
    const header = dialog.querySelector('[data-sheet-shell="header"]');
    const content = dialog.querySelector('[data-sheet-shell="content"]');
    const footer = dialog.querySelector('[data-sheet-shell="footer"]');
    expect(classes(header)).toEqual(expect.arrayContaining(['p-3', 'sm:p-6', 'short:p-3']));
    expect(classes(content)).toEqual(expect.arrayContaining(['p-3', 'sm:p-6', 'short:p-3']));
    expect(classes(footer)).toEqual(expect.arrayContaining(['p-2', 'sm:p-4', 'short:p-2']));
  });

  it('wraps the player and system line under a long name', () => {
    const { dialog } = open();
    const line = within(dialog).getByText(/^Player:/).parentElement;
    expect(classes(line)).toContain('flex-wrap');
  });

  it('sizes both ways out for a finger', () => {
    const { dialog } = open();
    expect(classes(within(dialog).getByRole('button', { name: 'Close dialog' }))).toContain('touch-target');
    expect(classes(within(dialog).getByRole('button', { name: 'Close' }))).toContain('touch-target');
  });

  it('opens its editor over itself, later in the body', async () => {
    const { dialog } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: /Edit/ }));
    const editor = screen.getByRole('dialog', { name: `Edit Character Sheet: ${sheet.name}` });
    expect(dialog.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dialog).not.toContainElement(editor);
  });
});

describe('the character editor', () => {
  const open = () => {
    render(
      <div data-testid="opener">
        <CharacterSheetEditorModal character={sheet} onClose={() => {}} />
      </div>
    );
    return screen.getByRole('dialog', { name: `Edit Character Sheet: ${sheet.name}` });
  };

  it('is drawn in the body, outside whatever opened it', () => {
    const dialog = open();
    expect(screen.getByTestId('opener')).not.toContainElement(dialog);
  });

  it('takes the whole screen on a phone and keeps its window from sm up', () => {
    const dialog = open();
    expect(classes(dialog.parentElement)).toEqual(expect.arrayContaining(FRAME.overlay));
    expect(classes(dialog)).toEqual(expect.arrayContaining(FRAME.dialog));
  });

  it('sizes its close button for a finger', () => {
    const dialog = open();
    expect(classes(within(dialog).getByRole('button', { name: 'Close dialog' }))).toContain('touch-target');
  });

  it('puts the discard question over itself', async () => {
    const dialog = open();
    await userEvent.type(within(dialog).getByLabelText('Character name'), ' the Bold');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    const question = screen.getByRole('dialog', { name: 'Discard Changes?' });
    expect(dialog.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the short: variant the frames use', () => {
  // Tailwind generates nothing for a variant it does not know, and says nothing.
  it('is defined in index.css as a screen under 500 px tall', () => {
    expect(indexCss).toMatch(/@custom-variant short \(@media \(max-height: 499\.98px\)\);/);
  });
});
