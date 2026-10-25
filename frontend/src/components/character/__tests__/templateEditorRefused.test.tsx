/**
 * What Edit Template says when a sheet save is refused.
 *
 * It showed only "Template data does not match game system schema", with no
 * box named, so whoever was over a limit could not tell what to shorten. It
 * now names each box the server refused, as the character editors do.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CharacterTemplateEditorModal from '../CharacterTemplateEditorModal';
import { PF2E_BLANK_SHEET } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';
import type { CharacterTemplate } from '@/types';

const showToast = vi.fn();
const updateCharacterTemplate = vi.fn();

vi.mock('@/hooks/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/queries')>()),
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', platformRole: 'USER' } }),
}));
vi.mock('@/services/api', () => {
  const api = { updateCharacterTemplate: (id: string, body: unknown) => updateCharacterTemplate(id, body) };
  return { default: api, api };
});

const template = {
  id: 'tpl-1',
  name: 'Level 1 Fighter',
  description: null,
  gameSystem: 'PATHFINDER_2E',
  data: JSON.parse(JSON.stringify(PF2E_BLANK_SHEET)),
  tokenImageUrl: null,
  createdById: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as CharacterTemplate;

beforeAll(async () => {
  await import('@/components/character-sheets/pathfinder2e/Pathfinder2eCharacterSheet');
}, 30_000);

beforeEach(() => {
  showToast.mockReset();
  updateCharacterTemplate.mockReset();
});

async function saveRefused() {
  render(<CharacterTemplateEditorModal template={template} onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(await screen.findByPlaceholderText('Deity'), { target: { value: 'Torag' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(showToast).toHaveBeenCalled());
  return showToast.mock.calls[0];
}

describe('a refused template sheet save', () => {
  it('names each box the server refused, with the reason', async () => {
    updateCharacterTemplate.mockRejectedValue({
      response: {
        status: 400,
        data: {
          error: 'Validation Error',
          message: 'Template data does not match game system schema',
          validationErrors: [
            { path: 'inventory', message: 'Can hold at most 500 entries' },
            { path: 'backstory', message: 'Can be at most 100,000 characters' },
          ],
        },
      },
    });

    const [text, kind] = await saveRefused();
    expect(kind).toBe('error');
    expect(text).toBe('Not saved. inventory: Can hold at most 500 entries; backstory: Can be at most 100,000 characters');
  });

  it("gives the server's message when it names no box", async () => {
    updateCharacterTemplate.mockRejectedValue({
      response: { status: 400, data: { message: 'Template data does not match game system schema' } },
    });

    const [text] = await saveRefused();
    expect(text).toBe('Template data does not match game system schema');
  });
});
