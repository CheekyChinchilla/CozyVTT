/**
 * Whole files of the formats an upload accepts, and of two programs.
 *
 * file-type reads more than a format's first bytes: an Ogg header with
 * nothing after it is not sound to it, and a picture must decode. A suite
 * that runs the real library needs files that are complete enough for it to
 * give the verdict its format earns, so these are built once, here.
 */

import sharp from 'sharp';

export const picture = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } });

/** One Ogg page carrying a Vorbis identification header, as an .ogg track starts. */
export function oggVorbis(): Buffer {
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
export function wav(): Buffer {
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
export const mp3 = (tagged: boolean): Buffer =>
  Buffer.concat([tagged ? Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]) : Buffer.alloc(0), mpegFrame, mpegFrame, mpegFrame]);

export const pdf = (): Buffer => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

export const linuxProgram = (): Buffer => Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]), Buffer.alloc(120)]);

export const windowsProgram = (): Buffer => Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(200)]);
