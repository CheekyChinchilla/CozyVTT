/**
 * What the map area shows for the current map's picture. A map can arrive
 * with no picture at all (an archive whose export left it out), and that is
 * its own state: it never loads, so it must not show as loading. A new
 * picture for the map on screen that fails to load leaves the one before it
 * drawn, and that is `'kept'`: the error shows, and the map stays.
 */
export type MapImageState = 'none' | 'missing' | 'loading' | 'error' | 'kept' | 'ready';

/**
 * @param pictureShown whether a picture is drawn for the map (pictureFor)
 * @param imageError why the map's own picture did not load, if it did not
 */
export function mapImageState(
  map: { imageUrl?: string | null } | null | undefined,
  pictureShown: boolean,
  imageError: string | null
): MapImageState {
  if (!map) return 'none';
  if (!map.imageUrl) return 'missing';
  if (imageError) return pictureShown ? 'kept' : 'error';
  return pictureShown ? 'ready' : 'loading';
}

/**
 * How long a new picture for the map on screen waits to be decoded ahead
 * before it is shown anyway, decoded on its first draw.
 */
export const PICTURE_DECODE_WAIT_MS = 4000;

/** A picture that has loaded, with the map it was loaded for and its address. */
export interface LoadedPicture<T> {
  mapId: string;
  url: string;
  image: T;
}

/**
 * The picture to draw a map on, given the last one loaded: the map's own,
 * at its address, or the map's previous picture while a new one for it
 * loads, so a change of picture never blanks the map. A picture loaded for
 * another map is drawn only when it is at this map's address: it is then
 * this map's picture too.
 */
export function pictureFor<T>(
  loaded: LoadedPicture<T> | null,
  map: { id: string; imageUrl?: string | null } | null | undefined
): T | null {
  if (!loaded || !map?.imageUrl) return null;
  return loaded.url === map.imageUrl || loaded.mapId === map.id ? loaded.image : null;
}
