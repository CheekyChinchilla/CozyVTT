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
import sharp from 'sharp';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import type { AssetType } from '@prisma/client';
import { isAllowedMimeType } from '../../utils/fileUtils';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-file-type-'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const picture = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } });

/** One Ogg page carrying a Vorbis identification header, as an .ogg track starts. */
function oggVorbis(): Buffer {
  const packet = Buffer.concat([Buffer.from([1]), Buffer.from('vorbis', 'latin1'), Buffer.alloc(23)]);
  const page = Buffer.alloc(28);
  page.write('OggS', 0, 'latin1');
  page[5] = 0x02;
  page.writeUInt32LE(1, 14);
  page[26] = 1;
  page[27] = packet.length;
  return Buffer.concat([page, packet]);
}

/** A WAV header for 100 bytes of 8-bit mono sound, and the sound. */
function wav(): Buffer {
  const b = Buffer.alloc(144);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(136, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(100, 40);
  return b;
}

/** MPEG audio frames, with and without the ID3 tag most MP3 files start with. */
const mpegFrame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);
const mp3 = (tagged: boolean) =>
  Buffer.concat([tagged ? Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]) : Buffer.alloc(0), mpegFrame, mpegFrame, mpegFrame]);

const ACCEPTED: Array<[string, () => Promise<Buffer> | Buffer, string, AssetType[]]> = [
  ['a PNG picture', () => picture().png().toBuffer(), 'image/png', ['MAP', 'TOKEN', 'AVATAR']],
  ['a JPEG picture', () => picture().jpeg().toBuffer(), 'image/jpeg', ['MAP', 'TOKEN', 'AVATAR']],
  ['a WebP picture', () => picture().webp().toBuffer(), 'image/webp', ['MAP', 'TOKEN', 'AVATAR']],
  ['a GIF picture', () => picture().gif().toBuffer(), 'image/gif', ['TOKEN']],
  ['an MP3 track with an ID3 tag', () => mp3(true), 'audio/mpeg', ['AUDIO']],
  ['an MP3 track without one', () => mp3(false), 'audio/mpeg', ['AUDIO']],
  ['an Ogg Vorbis track', oggVorbis, 'audio/ogg', ['AUDIO']],
  ['a WAV track', wav, 'audio/wav', ['AUDIO']],
  ['a PDF', () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'), 'application/pdf', ['DOCUMENT']],
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
    ['a Linux program', Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]), Buffer.alloc(120)]), 'application/x-elf'],
    ['a Windows program', Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(200)]), 'application/x-msdownload'],
  ])('is identified as one, and no kind of asset accepts it: %s', async (_label, bytes, mime) => {
    expect((await fileTypeFromBuffer(bytes))?.mime).toBe(mime);
    for (const type of ['MAP', 'TOKEN', 'AUDIO', 'AVATAR', 'DOCUMENT', 'OTHER'] as const) {
      expect(isAllowedMimeType(type, mime)).toBe(false);
    }
  });
});
