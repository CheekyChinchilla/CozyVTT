/**
 * Uploading an Ogg sound file, whatever codec it carries.
 *
 * file-type names an Ogg file by the codec inside it: Vorbis as `audio/ogg`
 * with the extension .ogg, but Opus as `audio/ogg; codecs=opus` with .opus,
 * FLAC as `audio/ogg` with .oga and Speex as `audio/ogg` with .spx. Opus was
 * not on the audio allowlist, so an .ogg track recorded in Opus was refused;
 * FLAC and Speex were taken but stored under an extension the audio route
 * does not serve. Each is an Ogg track and is now stored and served as one.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-ogg-upload-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

/**
 * The first page of an Ogg stream holding one packet: the 27-byte page header
 * and a one-entry segment table, so the packet, which names the codec, starts
 * at byte 28. Padding follows, as the rest of a real file would.
 */
function oggFile(packet: Buffer): Buffer {
  const header = Buffer.alloc(27);
  header.write('OggS', 0, 'latin1');
  header[5] = 0x02; // beginning of stream
  header[26] = 1; // one segment
  return Buffer.concat([header, Buffer.from([packet.length]), packet, Buffer.alloc(512)]);
}

const CODECS: Array<[string, Buffer]> = [
  ['Opus', Buffer.concat([Buffer.from('OpusHead', 'latin1'), Buffer.from([1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0])])],
  ['Vorbis', Buffer.concat([Buffer.from('\x01vorbis', 'latin1'), Buffer.alloc(23)])],
  ['FLAC', Buffer.concat([Buffer.from('\x7fFLAC', 'latin1'), Buffer.alloc(46)])],
  ['Speex', Buffer.concat([Buffer.from('Speex   ', 'latin1'), Buffer.alloc(72)])],
];

let userId: string;
let agent: request.Agent;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Ogg Upload Tester' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('an Ogg sound file uploaded as audio', () => {
  it.each(CODECS)('is taken when it carries %s, stored as an .ogg track and played back as audio/ogg', async (codec, packet) => {
    const res = await agent
      .post('/api/assets/upload')
      .field('type', 'AUDIO')
      .field('scope', 'USER')
      .field('name', `${codec} track`)
      .attach('file', oggFile(packet), `${codec.toLowerCase()}-track.ogg`);
    expect(res.status).toBe(201);

    const asset = await prisma.asset.findFirstOrThrow({ where: { uploadedById: userId, name: `${codec} track` } });
    expect(path.extname(asset.filename)).toBe('.ogg');
    expect(asset.mimeType).toBe('audio/ogg');

    const played = await agent.get(`/api/assets/audio/${asset.id}`).responseType('blob');
    expect(played.status).toBe(200);
    expect(played.headers['content-type']).toBe('audio/ogg');
  });
});
