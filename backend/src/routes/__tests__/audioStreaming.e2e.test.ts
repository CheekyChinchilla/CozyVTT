/**
 * Streaming an audio file: byte ranges, and what happens when it goes wrong.
 *
 * A browser plays a track by asking for byte ranges, and the hand-written
 * range handling took the header apart with split('-'). A request for the
 * last bytes of a file (`bytes=-100`) or for a start past its end threw and
 * answered 500, and an end past the file was promised in Content-Length but
 * never sent. The file was sent with .pipe(), which does not close the file
 * when the listener goes away, as a browser does whenever someone seeks or
 * changes track, and which leaves a read error with no one to catch it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { AddressInfo } from 'net';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { captureLogs } from '../../__tests__/helpers/logCapture';

jest.setTimeout(30000);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-audio-stream-'));
const server = http.createServer(createTestApp());

/** 1,000 bytes, each the low byte of its own position, so any slice can be checked. */
const SMALL = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

let userId: string;
let cookie: string;
let smallId: string;
let largePath: string;
let largeId: string;

async function audioAsset(name: string, contents: Buffer): Promise<{ id: string; filePath: string }> {
  const filePath = path.join(dir, `${name}.mp3`);
  fs.writeFileSync(filePath, contents);
  const asset = await prisma.asset.create({
    data: {
      type: 'AUDIO', scope: 'USER', uploadedById: userId,
      filename: `${name}.mp3`, originalName: `${name}.mp3`, mimeType: 'audio/mpeg',
      fileSize: contents.length, filePath, name,
    },
  });
  return { id: asset.id, filePath };
}

const fetchAudio = (id: string, range?: string) => {
  const req = request(server).get(`/api/assets/audio/${id}`).set('Cookie', cookie).timeout(5000).responseType('blob');
  return range ? req.set('Range', range) : req;
};

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const user = await createTestUser({ email: testEmail('audio-stream'), displayName: 'Audio Stream' });
  userId = user.id;
  const login = await request(server).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  expect(login.status).toBe(200);
  cookie = String(login.headers['set-cookie']?.[0] ?? '').split(';')[0];
  smallId = (await audioAsset('small', SMALL)).id;
  // Far larger than a connection's buffers, so a listener that stops early
  // leaves most of the file unread.
  const large = await audioAsset('large', Buffer.alloc(32 * 1024 * 1024));
  largeId = large.id;
  largePath = large.filePath;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a byte range', () => {
  it('for the last bytes of the file answers 206 with exactly those bytes', async () => {
    const res = await fetchAudio(smallId, 'bytes=-100');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 900-999/1000');
    expect(res.headers['content-length']).toBe('100');
    expect(Buffer.from(res.body as Buffer)).toEqual(SMALL.subarray(900));
  });

  it('for more last bytes than the file has answers with the whole file', async () => {
    const res = await fetchAudio(smallId, 'bytes=-5000');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-999/1000');
    expect(Buffer.from(res.body as Buffer)).toEqual(SMALL);
  });

  it('ending past the file is cut to the file', async () => {
    const res = await fetchAudio(smallId, 'bytes=990-5000');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 990-999/1000');
    expect(res.headers['content-length']).toBe('10');
    expect(Buffer.from(res.body as Buffer)).toEqual(SMALL.subarray(990));
  });

  it('from a start to the end answers the rest of the file', async () => {
    const res = await fetchAudio(smallId, 'bytes=10-');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 10-999/1000');
    expect(Buffer.from(res.body as Buffer)).toEqual(SMALL.subarray(10));
  });

  it.each(['bytes=1000-', 'bytes=5000-6000', 'bytes=-0'])('%s, outside the file, answers 416 with the size', async (range) => {
    const res = await fetchAudio(smallId, range);
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */1000');
  });

  it.each(['bytes=abc', 'items=0-5', 'bytes=5-2', 'bytes=0-1,5-6'])('%s, which is not one byte range, is ignored', async (range) => {
    const res = await fetchAudio(smallId, range);
    expect(res.status).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(Buffer.from(res.body as Buffer)).toEqual(SMALL);
  });
});

describe('no byte range', () => {
  it('answers 200 with the whole file and says ranges are accepted', async () => {
    const res = await fetchAudio(smallId);
    expect(res.status).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe('1000');
    expect(Buffer.from(res.body as Buffer)).toEqual(SMALL);
  });
});

describe('a HEAD request', () => {
  it('answers the headers a GET would, with no body', async () => {
    const res = await request(server).head(`/api/assets/audio/${smallId}`).set('Cookie', cookie).set('Range', 'bytes=-100');
    expect(res.status).toBe(206);
    expect(res.headers['content-length']).toBe('100');
    expect(res.headers['content-range']).toBe('bytes 900-999/1000');
  });
});

describe('a track whose file is gone from disk', () => {
  it('answers 404', async () => {
    const { id, filePath } = await audioAsset('gone', SMALL);
    fs.rmSync(filePath);
    const res = await fetchAudio(id, 'bytes=0-9');
    expect(res.status).toBe(404);
  });
});

/** Descriptors this process holds open on the file. */
function openDescriptors(filePath: string): number {
  return fs.readdirSync('/proc/self/fd').filter((fd) => {
    try {
      return fs.readlinkSync(`/proc/self/fd/${fd}`) === filePath;
    } catch {
      return false;
    }
  }).length;
}

const onLinux = fs.existsSync('/proc/self/fd') ? describe : describe.skip;

onLinux('a listener that goes away part-way', () => {
  it('leaves the file closed', async () => {
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        { port, path: `/api/assets/audio/${largeId}`, headers: { cookie, range: 'bytes=0-' } },
        (res) => {
          res.once('data', () => {
            req.destroy();
            resolve();
          });
        }
      );
      req.on('error', (err: NodeJS.ErrnoException) => (err.code === 'ECONNRESET' ? undefined : reject(err)));
    });

    let open = openDescriptors(largePath);
    for (let i = 0; i < 40 && open > 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      open = openDescriptors(largePath);
    }
    expect(open).toBe(0);
  });
});

describe('a read error part-way through', () => {
  it('is logged and does not take the server down', async () => {
    const failing = jest.spyOn(fs, 'createReadStream').mockImplementationOnce(() => {
      let sent = false;
      return new Readable({
        read() {
          if (!sent) {
            sent = true;
            this.push(SMALL.subarray(0, 10));
          } else {
            this.destroy(Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }));
          }
        },
      }) as unknown as fs.ReadStream;
    });
    const logs = captureLogs();
    const { port } = server.address() as AddressInfo;

    await new Promise<void>((resolve) => {
      const req = http.get({ port, path: `/api/assets/audio/${smallId}`, headers: { cookie } }, (res) => {
        res.resume();
        res.on('close', () => resolve());
      });
      req.on('error', () => resolve());
    });
    failing.mockRestore();

    const entries = await logs.stop();
    expect(entries.some((e) => e.level === 'error' && JSON.stringify(e).includes('EIO'))).toBe(true);
    // And the next listener is served as usual.
    expect((await fetchAudio(smallId, 'bytes=0-9')).status).toBe(206);
  });
});
