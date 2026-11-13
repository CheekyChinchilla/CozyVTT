/**
 * Create Map describes the alternating diagonal rule at the Grid Scale
 * chosen. It read "5/10/5/10 ft diagonals" whatever the scale, so on 10 ft
 * squares it named half of what each diagonal costs.
 */

import { it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/services/api', () => {
  const client = { getAssetUrl: (id: string) => `/api/assets/maps/${id}`, getAssetThumbnailUrl: (id: string) => `/api/assets/maps/${id}/thumbnail`, listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }) };
  return { api: client, default: client };
});
vi.mock('@/services/map.service', () => ({ default: { createMap: vi.fn() } }));
vi.mock('@/utils/detectMapGrid', () => ({ detectMapGrid: vi.fn().mockResolvedValue(null) }));
vi.mock('@/components/assets/AssetUploadModal', () => ({ default: () => null }));

import CreateMapModal from '../CreateMapModal';

beforeAll(() => {
  // The preview draws on a canvas, which the test page does not have.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
});

it('describes the alternating rule at the Grid Scale chosen, a custom one included', () => {
  render(<CreateMapModal isOpen campaignId="campaign-1" onClose={vi.fn()} onCreated={vi.fn()} />);
  expect(screen.getByText('Alternating — 5/10/5/10 ft diagonals')).toBeInTheDocument();

  fireEvent.click(screen.getByText('10 ft'));
  expect(screen.getByText('Alternating — 10/20/10/20 ft diagonals')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Custom'));
  fireEvent.change(screen.getByPlaceholderText('ft'), { target: { value: '3' } });
  expect(screen.getByText('Alternating — 3/6/3/6 ft diagonals')).toBeInTheDocument();
});

it('names the game system whose default the flat rule is by its short name', () => {
  render(<CreateMapModal isOpen campaignId="campaign-1" onClose={vi.fn()} onCreated={vi.fn()} />);
  expect(screen.getByText('5E default')).toBeInTheDocument();
});

it('names the game system whose default the alternating rule is by its short name', () => {
  render(<CreateMapModal isOpen campaignId="campaign-1" onClose={vi.fn()} onCreated={vi.fn()} />);
  expect(screen.getByText('ORC d20 default')).toBeInTheDocument();
});
