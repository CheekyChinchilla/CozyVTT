/**
 * What the map area shows for the current map's picture. A map can arrive
 * with no picture at all (an archive whose export left it out), and that is
 * its own state: it never loads, so it must not show as loading.
 */
export type MapImageState = 'none' | 'missing' | 'loading' | 'error' | 'ready';

export function mapImageState(
  map: { imageUrl?: string | null } | null | undefined,
  imageLoaded: boolean,
  imageError: string | null
): MapImageState {
  if (!map) return 'none';
  if (!map.imageUrl) return 'missing';
  if (imageError) return 'error';
  return imageLoaded ? 'ready' : 'loading';
}
