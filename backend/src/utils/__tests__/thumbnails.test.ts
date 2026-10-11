/**
 * A thumbnail is made only from a picture.
 *
 * The image library reads whatever it is given in any format it has a
 * reader for, SVG and PDF among them, and a thumbnail was made from any
 * file handed to it. A thumbnail is now made only from bytes identified as
 * PNG, JPEG, WebP or GIF; anything else gets none, as an unreadable picture
 * always has.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { generateThumbnail } from '../thumbnails';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-thumbnails-'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const blank = () => sharp({ create: { width: 900, height: 600, channels: 3, background: '#557755' } });

async function write(name: string, bytes: Buffer | string): Promise<string> {
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes);
  return file;
}

describe('generateThumbnail', () => {
  it.each([
    ['PNG', () => blank().png().toBuffer(), 'png'],
    ['JPEG', () => blank().jpeg().toBuffer(), 'jpg'],
    ['WebP', () => blank().webp().toBuffer(), 'webp'],
    ['GIF', () => blank().gif().toBuffer(), 'gif'],
  ])('makes one from a %s picture, at most 512 pixels on its longer side', async (_format, make, ext) => {
    const file = await write(`picture.${ext}`, await make());
    const thumbnail = await generateThumbnail(file);
    expect(thumbnail).toBe(path.join(dir, `thumb_picture.${ext}`));
    const meta = await sharp(thumbnail!).metadata();
    expect([meta.width, meta.height]).toEqual([512, 341]);
  });

  it.each([
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600"/></svg>', 'svg'],
    ['SVG under a picture\'s name', '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600"/></svg>', 'png'],
    ['plain text', 'Session notes, nothing more.', 'txt'],
    ['a PDF', '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'pdf'],
  ])('makes none from %s', async (_label, content, ext) => {
    const file = await write(`not-a-picture-${ext}.${ext}`, content);
    expect(await generateThumbnail(file)).toBeNull();
    expect(fs.existsSync(path.join(dir, `thumb_not-a-picture-${ext}.${ext}`))).toBe(false);
  });
});
