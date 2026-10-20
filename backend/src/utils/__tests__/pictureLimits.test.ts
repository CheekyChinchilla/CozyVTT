/**
 * The size limits for a map, token or avatar picture, read from its header.
 *
 * Every frame of an animation is unpacked in each player's browser, so a GIF
 * or WebP of a few megabytes could take gigabytes there. The pictures here
 * are crafted with one-pixel frames, so each states a large size while
 * staying a few kilobytes.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { pictureLimitProblem, PICTURE_LIMITS } from '../pictureLimits';
import { craftedGif, craftedAnimatedWebp, plainPng } from '../../__tests__/helpers/animatedPictures';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-picture-limits-'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the limits', () => {
  it('are the ones decided for every picture and for animations', () => {
    expect(PICTURE_LIMITS).toEqual({
      maxSide: 16_384,
      maxFrames: 1_000,
      maxAnimatedPixels: { MAP: 200_000_000, TOKEN: 50_000_000, AVATAR: 50_000_000 },
    });
  });
});

describe('a still picture', () => {
  it('is accepted at 16,384 pixels on a side', async () => {
    expect(await pictureLimitProblem(await plainPng(16_384, 1), 'MAP')).toBeNull();
    expect(await pictureLimitProblem(await plainPng(1, 16_384), 'AVATAR')).toBeNull();
  });

  it('is refused one pixel wider or taller, in words', async () => {
    expect(await pictureLimitProblem(await plainPng(16_385, 1), 'MAP')).toBe(
      'This picture is 16,385 pixels wide. A picture can be at most 16,384 pixels on each side.'
    );
    expect(await pictureLimitProblem(await plainPng(1, 20_000), 'TOKEN')).toBe(
      'This picture is 20,000 pixels tall. A picture can be at most 16,384 pixels on each side.'
    );
  });

  it('is read from a file as well as from bytes', async () => {
    const file = path.join(dir, 'wide.png');
    fs.writeFileSync(file, await plainPng(16_385, 1));
    expect(await pictureLimitProblem(file, 'MAP')).toMatch(/16,385 pixels wide/);
  });
});

describe('a GIF', () => {
  // The image library reads a logical screen over 2,048 pixels as a mistake
  // and reports the size of the frames instead; a browser draws the screen.
  it('is measured by its logical screen, however small its frames', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 20_000, height: 10, frames: 1 }), 'TOKEN')).toBe(
      'This picture is 20,000 pixels wide. A picture can be at most 16,384 pixels on each side.'
    );
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 16_385, frames: 2 }), 'TOKEN')).toMatch(/16,385 pixels tall/);
  });

  it('is measured by its frames when they reach past the screen', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 10, frames: 1, frameWidth: 16_385 }), 'TOKEN')).toMatch(/16,385 pixels wide/);
  });

  it('is accepted with 1,000 frames and refused with 1,001', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 10, frames: 1_000 }), 'TOKEN')).toBeNull();
    expect(await pictureLimitProblem(craftedGif({ width: 10, height: 10, frames: 1_001 }), 'TOKEN')).toBe(
      'This animation has 1,001 frames. An animated picture can have at most 1,000.'
    );
  });

  it('is accepted at 50 million pixels across its frames for a token, and refused past them', async () => {
    // 5,000 by 10 pixels, 1,000 times: 50,000,000.
    expect(await pictureLimitProblem(craftedGif({ width: 5_000, height: 10, frames: 1_000 }), 'TOKEN')).toBeNull();
    expect(await pictureLimitProblem(craftedGif({ width: 5_000, height: 11, frames: 1_000 }), 'TOKEN')).toBe(
      'This animation is 55 million pixels across its frames. An animated token picture can be at most 50 million.'
    );
  });

  it('says a total just past the limit is past it', async () => {
    // 5,001 by 10 pixels, 1,000 times: 50,010,000.
    expect(await pictureLimitProblem(craftedGif({ width: 5_001, height: 10, frames: 1_000 }), 'AVATAR')).toBe(
      'This animation is 50.1 million pixels across its frames. An animated avatar can be at most 50 million.'
    );
  });

  it('with one frame is a still picture, whatever its size', async () => {
    expect(await pictureLimitProblem(craftedGif({ width: 16_384, height: 16_384, frames: 1 }), 'TOKEN')).toBeNull();
  });
});

describe('an animated WebP', () => {
  it('is accepted at 200 million pixels across its frames for a map, and refused past them', async () => {
    // 10,000 pixels square, twice: 200,000,000.
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 10_000, height: 10_000, frames: 2 }), 'MAP')).toBeNull();
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 10_000, height: 10_000, frames: 3 }), 'MAP')).toBe(
      'This animation is 300 million pixels across its frames. An animated map can be at most 200 million.'
    );
  });

  it('is held to a token\'s limit as a token', async () => {
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 10_000, height: 10_000, frames: 2 }), 'TOKEN')).toBe(
      'This animation is 200 million pixels across its frames. An animated token picture can be at most 50 million.'
    );
  });

  it('is accepted with 1,000 frames and refused past them', async () => {
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 4, height: 4, frames: 1_000 }), 'MAP')).toBeNull();
    // Counting stops at the first frame past the limit.
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 4, height: 4, frames: 1_001 }), 'MAP')).toBe(
      'This animation has more than 1,000 frames. An animated picture can have at most 1,000.'
    );
  });

  // The image library cannot read a WebP canvas wider than WebP allows, and
  // a browser may still try to draw it.
  it('is refused when its size cannot be read', async () => {
    expect(await pictureLimitProblem(await craftedAnimatedWebp({ width: 20_000, height: 10, frames: 2 }), 'MAP')).toBe(
      'CozyVTT could not read the size of this picture, so it cannot be checked. Save it again in an image editor and try once more.'
    );
  });
});

describe('reading the limits', () => {
  // Measured: 15 ms for a 114 MB GIF of 20 frames of 2,048 pixels square,
  // where unpacking every frame took 528 ms and 336 MB. A ceiling well above
  // that catches a reader that has started to unpack frames.
  it('unpacks no frames: 100,000 frames of a 16,384-pixel screen are measured at once', async () => {
    const gif = craftedGif({ width: 16_384, height: 16_384, frames: 100_000 });
    const started = Date.now();
    expect(await pictureLimitProblem(gif, 'TOKEN')).toMatch(/100,000 frames/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  // The image library takes time that grows with the square of a WebP's
  // frames before it says how many there are: 10 seconds for 100,000, on a
  // thread every upload shares. The frames are counted from the file first.
  it('counts a WebP\'s frames without the image library: 100,000 frames are refused at once', async () => {
    const webp = await craftedAnimatedWebp({ width: 4, height: 4, frames: 100_000 });
    const started = Date.now();
    expect(await pictureLimitProblem(webp, 'MAP')).toBe(
      'This animation has more than 1,000 frames. An animated picture can have at most 1,000.'
    );
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('counts a WebP\'s frames from a file as well as from bytes', async () => {
    const file = path.join(dir, 'many-frames.webp');
    fs.writeFileSync(file, await craftedAnimatedWebp({ width: 4, height: 4, frames: 100_000 }));
    const started = Date.now();
    expect(await pictureLimitProblem(file, 'MAP')).toMatch(/more than 1,000 frames/);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
