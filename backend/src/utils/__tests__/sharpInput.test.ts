/**
 * sharp is given only bytes identified as PNG, JPEG, WebP or GIF.
 *
 * The image library has readers for many more formats than a picture in
 * CozyVTT can be, and reads whatever it is handed with whichever claims it.
 * openPicture identifies the bytes first, with the real file-type, and
 * refuses everything else before sharp sees it; and nothing else in the
 * backend may import sharp, so there is no way round it.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { openPicture, NotAPictureError } from '../sharpInput';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-sharp-input-'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const blank = () => sharp({ create: { width: 30, height: 20, channels: 3, background: '#445566' } });
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"><rect width="30" height="20"/></svg>';

function write(name: string, bytes: Buffer | string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes);
  return file;
}

describe('openPicture', () => {
  it.each([
    ['png', () => blank().png().toBuffer()],
    ['jpeg', () => blank().jpeg().toBuffer()],
    ['webp', () => blank().webp().toBuffer()],
    ['gif', () => blank().gif().toBuffer()],
  ])('reads a %s picture, from bytes or from a file', async (format, make) => {
    const bytes = await make();
    for (const input of [bytes, write(`picture.${format}`, bytes)]) {
      const meta = await (await openPicture(input)).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual([format, 30, 20]);
    }
  });

  it.each([
    ['SVG', () => Buffer.from(SVG)],
    ['SVG after a byte-order mark', () => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SVG)])],
    ['plain text', () => Buffer.from('Session notes, nothing more.')],
    ['a PDF', () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')],
    ['a TIFF picture', () => blank().tiff().toBuffer()],
    ['an AVIF picture', () => blank().avif().toBuffer()],
    ['nothing at all', () => Buffer.alloc(0)],
  ])('refuses %s, from bytes or from a file', async (label, make) => {
    const bytes = await make();
    for (const input of [bytes, write(`refused-${label.replace(/\W+/g, '-')}.png`, bytes)]) {
      await expect(openPicture(input)).rejects.toBeInstanceOf(NotAPictureError);
    }
  });
});

describe('the backend', () => {
  it('imports sharp in one place, the module that identifies its input', () => {
    const src = path.resolve(__dirname, '..', '..');
    const importers: string[] = [];
    const walk = (folder: string) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (/\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)) {
          if (/(?:from\s+|require\(\s*|import\(\s*)['"]sharp['"]/.test(fs.readFileSync(full, 'utf8'))) {
            importers.push(path.relative(src, full).split(path.sep).join('/'));
          }
        }
      }
    };
    walk(src);
    expect(importers).toEqual(['utils/sharpInput.ts']);
  });
});
