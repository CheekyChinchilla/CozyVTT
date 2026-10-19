/**
 * Save as Template with the character's picture.
 *
 * A character's picture is nearly always the player's own upload, and a
 * template's has to be a global asset, so sending it made every Save as
 * Template of a character with a picture fail. The picture now goes with the
 * template only when it is a global asset, and the user is told otherwise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewCharacterTemplateModal from '../NewCharacterTemplateModal';

const showToast = vi.fn();
const createCharacterTemplate = vi.fn();
const getAsset = vi.fn();

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('@/services/api', () => {
  const api = {
    createCharacterTemplate: (body: unknown) => createCharacterTemplate(body),
    getAsset: (id: string) => getAsset(id),
  };
  return { default: api, api };
});

const PICTURE = '/api/assets/tokens/7d1c2b9e-0000-4000-8000-000000000001';

function publishWithPicture() {
  const onCreated = vi.fn();
  render(
    <NewCharacterTemplateModal
      initial={{ name: 'Aldra', gameSystem: 'DND_5E', data: { characterName: 'Aldra' }, tokenImageUrl: PICTURE }}
      onClose={vi.fn()}
      onCreated={onCreated}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Publish Template' }));
  return onCreated;
}

beforeEach(() => {
  showToast.mockReset();
  createCharacterTemplate.mockReset().mockResolvedValue({ id: 'tpl-1' });
  getAsset.mockReset();
});

describe('Save as Template with a picture', () => {
  it('publishes without a picture of the player\'s own, and says so', async () => {
    getAsset.mockResolvedValue({ asset: { id: 'a', scope: 'USER' } });
    const onCreated = publishWithPicture();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(getAsset).toHaveBeenCalledWith('7d1c2b9e-0000-4000-8000-000000000001');
    expect(createCharacterTemplate.mock.calls[0][0]).toMatchObject({ tokenImageUrl: null });
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/without the character's picture.*global/), 'warning');
  });

  it('keeps a global picture', async () => {
    getAsset.mockResolvedValue({ asset: { id: 'a', scope: 'GLOBAL' } });
    const onCreated = publishWithPicture();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createCharacterTemplate.mock.calls[0][0]).toMatchObject({ tokenImageUrl: PICTURE });
    expect(showToast).toHaveBeenCalledWith('Template published', 'success');
  });

  it('leaves out a picture it cannot look up', async () => {
    getAsset.mockRejectedValue({ response: { status: 404, data: { message: 'Asset not found' } } });
    const onCreated = publishWithPicture();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createCharacterTemplate.mock.calls[0][0]).toMatchObject({ tokenImageUrl: null });
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/without the character's picture/), 'warning');
  });
});
