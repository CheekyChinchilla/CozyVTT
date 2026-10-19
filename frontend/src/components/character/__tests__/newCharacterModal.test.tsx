/**
 * Create New Character.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewCharacterModal from '../NewCharacterModal';
import { SHEET_NAME_MAX } from '@/constants/sheetLimits';

const listCampaigns = vi.fn();
const getStarterSheet = vi.fn();
const createCharacter = vi.fn();
const createCharacterTemplate = vi.fn();

vi.mock('@/services/api', () => {
  const api = {
    listCampaigns: () => listCampaigns(),
    getStarterSheet: (system: string, template: string) => getStarterSheet(system, template),
    createCharacter: (body: unknown) => createCharacter(body),
    createCharacterTemplate: (body: unknown) => createCharacterTemplate(body),
  };
  return { default: api, api };
});

beforeEach(() => {
  listCampaigns.mockReset().mockResolvedValue({ campaigns: [] });
  getStarterSheet.mockReset().mockResolvedValue({ name: 'Blank', description: '', gameSystem: null, data: { sections: [] } });
  createCharacter.mockReset().mockImplementation((body: { name: string; gameSystem?: string }) =>
    Promise.resolve({ message: 'ok', character: { id: 'char-1', userId: 'user-1', campaignId: null, gameSystem: body.gameSystem ?? null, name: body.name, data: { sections: [] } } })
  );
  createCharacterTemplate.mockReset().mockResolvedValue({ id: 'tpl-1' });
});

const show = () => render(<NewCharacterModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
const typeName = (name: string) => fireEvent.change(screen.getByLabelText(/Character Name/), { target: { value: name } });

describe('the character name', () => {
  it('takes as many characters as the server does', async () => {
    show();
    const name = 'A'.repeat(SHEET_NAME_MAX);
    typeName(name);
    fireEvent.click(screen.getByRole('button', { name: /Create Character/ }));
    await waitFor(() => expect(createCharacter).toHaveBeenCalledWith(expect.objectContaining({ name })));
  });

  it('stops at that many', () => {
    show();
    expect(screen.getByLabelText(/Character Name/)).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
  });
});

describe('the game system', () => {
  it('goes back to Flexible when a campaign without one is chosen after one with one', async () => {
    listCampaigns.mockResolvedValue({
      campaigns: [
        { id: 'camp-dnd', name: 'Dragons', gameSystem: 'DND_5E' },
        { id: 'camp-flex', name: 'Freeform', gameSystem: null },
      ],
    });
    show();
    const campaignBox = screen.getByLabelText(/^Campaign/);
    await screen.findByRole('option', { name: /Freeform/ });
    const systemBox = screen.getByLabelText(/^Game System/);

    fireEvent.change(campaignBox, { target: { value: 'camp-dnd' } });
    await waitFor(() => expect(systemBox).toHaveValue('DND_5E'));
    fireEvent.click(screen.getByRole('radio', { name: /Level 1 Fighter/ }));

    fireEvent.change(campaignBox, { target: { value: 'camp-flex' } });
    await waitFor(() => expect(systemBox).toHaveValue(''));

    typeName('Aldra');
    fireEvent.click(screen.getByRole('button', { name: /Create Character/ }));
    await waitFor(() => expect(createCharacter).toHaveBeenCalled());
    expect(getStarterSheet).toHaveBeenCalledWith('null', 'blank');
    expect(createCharacter.mock.calls[0][0]).toMatchObject({ campaignId: 'camp-flex', gameSystem: undefined });
  });
});

describe('the note under the form', () => {
  it('says what happens after Create, which opens no editor', () => {
    show();
    expect(screen.queryByText(/redirected/)).toBeNull();
    expect(screen.getByText(/appears in your list/)).toHaveTextContent(/Choose Edit Character from its card's menu/);
  });
});

describe('Create & Publish as Template', () => {
  it('publishes nothing on a later Create Character after a failed create', async () => {
    createCharacter.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Database unavailable' } } });
    show();
    typeName('Aldra');
    fireEvent.click(screen.getByRole('button', { name: /Create & Publish as Template/ }));
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create Character/ }));
    await waitFor(() => expect(createCharacter).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Database unavailable')).toBeNull());
    expect(createCharacterTemplate).not.toHaveBeenCalled();
  });

  it('publishes the sheet as the character was stored', async () => {
    const stored = { sections: [{ id: 'sec-1', title: 'Notes', type: 'text', content: '' }], characterName: 'Aldra' };
    createCharacter.mockImplementationOnce((body: { name: string }) =>
      Promise.resolve({ message: 'ok', character: { id: 'char-1', userId: 'user-1', campaignId: null, gameSystem: null, name: body.name, data: stored } })
    );
    show();
    typeName('Aldra');
    fireEvent.click(screen.getByRole('button', { name: /Create & Publish as Template/ }));

    await waitFor(() => expect(createCharacterTemplate).toHaveBeenCalled());
    expect(createCharacterTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aldra', gameSystem: null, data: stored }));
  });
});
