/**
 * What file-type says each format is, with the real library.
 *
 * An upload, a campaign import and the image library's input are accepted by
 * what file-type says their bytes are, and the tests of each mostly stub that
 * answer with the one the real library gave. This asks the real library about
 * a file of every format an upload accepts, and a few it must not mistake for
 * one, so an upgrade that changes a verdict fails here.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import type { AssetType } from '@prisma/client';
import { isAllowedMimeType } from '../../utils/fileUtils';
import { picture, oggVorbis, wav, mp3, pdf, linuxProgram, windowsProgram } from '../../__tests__/helpers/wholeFiles';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-file-type-'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const ACCEPTED: Array<[string, () => Promise<Buffer> | Buffer, string, AssetType[]]> = [
  ['a PNG picture', () => picture().png().toBuffer(), 'image/png', ['MAP', 'TOKEN', 'AVATAR']],
  ['a JPEG picture', () => picture().jpeg().toBuffer(), 'image/jpeg', ['MAP', 'TOKEN', 'AVATAR']],
  ['a WebP picture', () => picture().webp().toBuffer(), 'image/webp', ['MAP', 'TOKEN', 'AVATAR']],
  ['a GIF picture', () => picture().gif().toBuffer(), 'image/gif', ['TOKEN']],
  ['an MP3 track with an ID3 tag', () => mp3(true), 'audio/mpeg', ['AUDIO']],
  ['an MP3 track without one', () => mp3(false), 'audio/mpeg', ['AUDIO']],
  ['an Ogg Vorbis track', oggVorbis, 'audio/ogg', ['AUDIO']],
  ['a WAV track', wav, 'audio/wav', ['AUDIO']],
  ['a PDF', pdf, 'application/pdf', ['DOCUMENT']],
];

describe('a file of a format an upload accepts', () => {
  it.each(ACCEPTED)('is identified: %s', async (_label, make, mime, types) => {
    const bytes = await make();
    const file = path.join(dir, `accepted-${mime.replace('/', '-')}-${bytes.length}`);
    fs.writeFileSync(file, bytes);
    expect((await fileTypeFromBuffer(bytes))?.mime).toBe(mime);
    expect((await fileTypeFromFile(file))?.mime).toBe(mime);
    for (const type of types) expect(isAllowedMimeType(type, mime)).toBe(true);
  });
});

describe('a file that must go to the per-format checks', () => {
  // Text has no signature, so these are not identified at all, and an upload
  // accepts one only as a document whose bytes prove they are text.
  it.each([
    ['plain text', 'Session notes, nothing more.'],
    ['Markdown', '# Handout\n\nThe door is *locked*.\n'],
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>'],
    ['HTML', '<!doctype html><html><body>x</body></html>'],
  ])('is not identified: %s', async (_label, text) => {
    expect(await fileTypeFromBuffer(Buffer.from(text))).toBeUndefined();
  });
});

describe('a program', () => {
  it.each([
    ['a Linux program', linuxProgram(), 'application/x-elf'],
    ['a Windows program', windowsProgram(), 'application/x-msdownload'],
  ])('is identified as one, and no kind of asset accepts it: %s', async (_label, bytes, mime) => {
    expect((await fileTypeFromBuffer(bytes))?.mime).toBe(mime);
    for (const type of ['MAP', 'TOKEN', 'AUDIO', 'AVATAR', 'DOCUMENT', 'OTHER'] as const) {
      expect(isAllowedMimeType(type, mime)).toBe(false);
    }
  });
});
