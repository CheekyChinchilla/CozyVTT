/**
 * Saving a template's sheet from Edit Template.
 *
 * The template editor caught every failed sheet save itself, so the sheet took
 * the save as done, went back to its read-only view and lost every edit, with
 * only an error toast to show for it. Closing the dialog, or pressing Save
 * Details, which closed it too, dropped unsaved sheet edits without asking. A
 * token picture chosen in the sheet was uploaded and then silently ignored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterTemplateEditorModal from '../CharacterTemplateEditorModal';
import CharacterTemplatesPage from '@/pages/CharacterTemplatesPage';
import { PF2E_BLANK_SHEET } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';
import { DND5E_SHEET } from '@/components/character-sheets/dnd5e/__tests__/dnd5eFixture';
import type { CharacterTemplate } from '@/types';

const showToast = vi.fn();
const updateCharacterTemplate = vi.fn();
const uploadAsset = vi.fn();
const listCharacterTemplates = vi.fn();

vi.mock('@/hooks/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/queries')>()),
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', platformRole: 'USER' } }),
}));
vi.mock('@/services/api', () => {
  const api = {
    updateCharacterTemplate: (id: string, body: unknown) => updateCharacterTemplate(id, body),
    uploadAsset: (form: FormData) => uploadAsset(form),
    listCharacterTemplates: (params: unknown) => listCharacterTemplates(params),
  };
  return { default: api, api };
});

function template(gameSystem: 'PATHFINDER_2E' | 'DND_5E'): CharacterTemplate {
  return {
    id: 'tpl-1',
    name: 'Level 1 Fighter',
    description: null,
    gameSystem,
    data: JSON.parse(JSON.stringify(gameSystem === 'DND_5E' ? DND5E_SHEET : PF2E_BLANK_SHEET)),
    tokenImageUrl: null,
    createdById: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as CharacterTemplate;
}

const refused = {
  response: { status: 400, data: { error: 'Validation Error', message: 'Character data does not match game system schema' } },
};

beforeEach(() => {
  showToast.mockReset();
  updateCharacterTemplate.mockReset();
  uploadAsset.mockReset();
});

describe('Edit Template', () => {
  it('keeps the sheet editor and its edits when the save is refused', async () => {
    updateCharacterTemplate.mockRejectedValue(refused);
    render(<CharacterTemplateEditorModal template={template('PATHFINDER_2E')} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText('Deity'), { target: { value: 'Torag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/schema/), 'error'));

    expect(screen.getByPlaceholderText('Deity')).toHaveValue('Torag');
  });

  it('shows the saved sheet once the save has gone through', async () => {
    const saved = template('PATHFINDER_2E');
    (saved.data as Record<string, unknown>).deity = 'Torag';
    updateCharacterTemplate.mockResolvedValue(saved);
    const onSaved = vi.fn();
    render(<CharacterTemplateEditorModal template={template('PATHFINDER_2E')} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(await screen.findByPlaceholderText('Deity'), { target: { value: 'Torag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByPlaceholderText('Deity')).toBeNull());
    expect(screen.getByText(/Torag/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Template sheet saved', 'success');
  });

  it('asks before closing over unsaved sheet edits', async () => {
    const onClose = vi.fn();
    render(<CharacterTemplateEditorModal template={template('PATHFINDER_2E')} onClose={onClose} onSaved={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText('Deity'), { target: { value: 'Torag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(await screen.findByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open with unsaved sheet edits after Save Details', async () => {
    updateCharacterTemplate.mockResolvedValue(template('PATHFINDER_2E'));
    listCharacterTemplates.mockResolvedValue({ templates: [template('PATHFINDER_2E')] });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <CharacterTemplatesPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Level 1 Fighter' }));
    fireEvent.change(await screen.findByPlaceholderText('Deity'), { target: { value: 'Torag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Details' }));

    await waitFor(() => expect(updateCharacterTemplate).toHaveBeenCalled());
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Template updated', 'success'));
    expect(screen.getByRole('dialog', { name: 'Edit Template' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Deity')).toHaveValue('Torag');
  });

  it('closes after Save Details when the sheet has nothing unsaved', async () => {
    updateCharacterTemplate.mockResolvedValue(template('PATHFINDER_2E'));
    const onClose = vi.fn();
    render(<CharacterTemplateEditorModal template={template('PATHFINDER_2E')} onClose={onClose} onSaved={vi.fn()} />);

    await screen.findByPlaceholderText('Deity');
    fireEvent.click(screen.getByRole('button', { name: 'Save Details' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says a token picture chosen in the sheet was not used, since a template needs a global one', async () => {
    updateCharacterTemplate.mockResolvedValue(template('DND_5E'));
    uploadAsset.mockResolvedValue({ asset: { id: 'asset-1' } });
    const { container } = render(
      <CharacterTemplateEditorModal template={template('DND_5E')} onClose={vi.fn()} onSaved={vi.fn()} />
    );

    await screen.findByPlaceholderText('Character Name');
    const picker = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(['x'], 'token.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateCharacterTemplate).toHaveBeenCalled());
    expect(updateCharacterTemplate.mock.calls[0][1]).not.toHaveProperty('tokenImageUrl');
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/picture.*global/i), expect.any(String))
    );
  });
});
