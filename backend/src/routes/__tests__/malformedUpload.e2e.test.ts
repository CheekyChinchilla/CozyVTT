/**
 * Malformed upload bodies — End-to-End Tests
 *
 * The multipart parser behind every upload has had a family of published flaws
 * in which a crafted body made it throw outside any error handler, or keep the
 * server busy for minutes. The backend has no process-wide exception handler,
 * so the first kind ended the whole server and every table connected to it.
 * Any signed-in user can post to the first three routes below, so any
 * signed-in user could do it.
 *
 * Inside Jest an exception like that ends nothing, since the runner catches it
 * and blames the test. So these tests start the app as a process of its own
 * (see helpers/serve-test-app.ts), send it the bodies over a real socket, and
 * check that it answers with a client error and is still running afterwards.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { PlatformRole } from '@prisma/client';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-malformed-upload-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
const BACKUP_DIR = path.join(SCRATCH, 'backups');
const SERVER_SCRIPT = path.join(__dirname, '..', '..', '__tests__', 'helpers', 'serve-test-app.ts');

type Who = 'user' | 'dm' | 'admin';

interface RunningServer {
  child: ChildProcess;
  port: number;
  /** Session cookies, one per signed-in test account. */
  cookies: Record<Who, string>;
  /** Everything the process has written to stderr, for the failure message. */
  stderr: () => string;
}

interface RawResponse {
  status?: number;
  body: string;
  /** Set when the connection broke before a response arrived, as it does when the server dies mid-request. */
  socketError?: string;
}

async function signIn(port: number, email: string): Promise<string> {
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  expect(login.status).toBe(200);
  const cookie = (login.headers.getSetCookie()[0] ?? '').split(';')[0];
  expect(cookie).not.toBe('');
  return cookie;
}

/** Start the app in its own process and sign each account in. */
async function startServer(emails: Record<Who, string>): Promise<RunningServer> {
  const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', SERVER_SCRIPT], {
    env: { ...process.env, UPLOAD_DIR, BACKUP_DIR, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const port = await new Promise<number>((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`The test server did not start in time. ${stderr}`)), 60_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const match = /LISTENING (\d+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`The test server exited with code ${code} before it was listening. ${stderr}`));
    });
  });

  const cookies: Record<Who, string> = {
    user: await signIn(port, emails.user),
    dm: await signIn(port, emails.dm),
    admin: await signIn(port, emails.admin),
  };
  return { child, port, cookies, stderr: () => stderr };
}

/**
 * Whether the process is up and answering. A process that has just died may not
 * have reported its exit yet, so asking it something is the only reliable check.
 */
async function isAlive(server: RunningServer): Promise<boolean> {
  if (server.child.exitCode !== null || server.child.signalCode !== null) return false;
  try {
    const health = await fetch(`http://127.0.0.1:${server.port}/health`, { signal: AbortSignal.timeout(3000) });
    return health.status === 200;
  } catch {
    return false;
  }
}

/** POST a body exactly as given, with no help from a client library that would refuse to send it. */
function sendRaw(
  server: RunningServer,
  route: string,
  who: Who,
  contentType: string,
  body: string
): Promise<RawResponse> {
  return new Promise((resolve) => {
    const payload = Buffer.from(body, 'latin1');
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server.port,
        path: route,
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': payload.length,
          Cookie: server.cookies[who],
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', (err) => resolve({ body: '', socketError: err.message }));
    // A server stuck in a loop never answers; give it a few seconds, not the test's whole allowance.
    req.setTimeout(5000, () => req.destroy(new Error('no answer within 5 seconds')));
    req.end(payload);
  });
}

const BOUNDARY = '----CozyBoundary';
const MULTIPART = `multipart/form-data; boundary=${BOUNDARY}`;

/** Assemble a multipart body from parts, each a header block and its content. */
function multipart(parts: Array<{ headers: string[]; content: string }>): string {
  const lines: string[] = [];
  for (const part of parts) {
    lines.push(`--${BOUNDARY}`, ...part.headers, '', part.content);
  }
  lines.push(`--${BOUNDARY}--`, '');
  return lines.join('\r\n');
}

const field = (name: string, content = 'x') => ({
  headers: [`Content-Disposition: form-data; name="${name}"`],
  content,
});

interface MalformedBody {
  name: string;
  contentType: string;
  body: string;
}

const MALFORMED_BODIES: MalformedBody[] = [
  {
    name: 'a field with an empty name',
    contentType: MULTIPART,
    body: multipart([field('')]),
  },
  {
    // A file part with an empty filename, cut off in the middle of the closing
    // boundary, used to raise an error on a stream nobody was listening to.
    name: 'an empty-filename file part cut off inside the closing boundary',
    contentType: MULTIPART,
    body: [
      `--${BOUNDARY}`,
      'Content-Disposition: form-data; name="file"; filename=""',
      'Content-Type: application/octet-stream',
      '',
      '',
      `--${BOUNDARY.slice(0, -1)}`,
    ].join('\r\n'),
  },
  {
    name: 'a file part cut off before its end',
    contentType: MULTIPART,
    body: [
      `--${BOUNDARY}`,
      'Content-Disposition: form-data; name="file"; filename="map.png"',
      'Content-Type: image/png',
      '',
      'PNGDATA-THAT-NEVER-ENDS',
    ].join('\r\n'),
  },
  {
    name: 'a text field cut off before its end',
    contentType: MULTIPART,
    body: [`--${BOUNDARY}`, 'Content-Disposition: form-data; name="type"', '', 'MAP'].join('\r\n'),
  },
  {
    name: 'a file part with an empty field name',
    contentType: MULTIPART,
    body: multipart([
      { headers: ['Content-Disposition: form-data; name=""; filename="map.png"', 'Content-Type: image/png'], content: 'x' },
    ]),
  },
  {
    name: 'a part with no field name at all',
    contentType: MULTIPART,
    body: multipart([{ headers: ['Content-Disposition: form-data'], content: 'x' }]),
  },
  {
    // The first name makes a sparse array of the largest possible length; the
    // second then tries to push one more element onto it.
    name: 'two field names that overflow an array',
    contentType: MULTIPART,
    body: multipart([field('a[4294967294]'), field('a[]', 'y')]),
  },
  {
    // Turning that array into an object afterwards walks every slot of it. At
    // this length that is more than a minute of the server doing nothing else.
    name: 'an array index so large that reading it back stalls the server',
    contentType: MULTIPART,
    body: multipart([field('a[4294967294]'), field('a[b]', 'y')]),
  },
  {
    name: 'a field name of thousands of nested levels',
    contentType: MULTIPART,
    body: multipart([field(`a${'[b]'.repeat(5000)}`)]),
  },
  {
    name: 'thousands of text fields',
    contentType: MULTIPART,
    body: multipart(Array.from({ length: 5000 }, (_, i) => field(`f${i}`))),
  },
  {
    name: 'a content type with no boundary',
    contentType: 'multipart/form-data',
    body: multipart([field('type', 'MAP')]),
  },
];

describe('malformed multipart upload bodies', () => {
  let userIds: string[] = [];
  let campaignId: string;
  let emails: Record<Who, string>;
  let server: RunningServer | undefined;

  beforeAll(async () => {
    const user = await createTestUser({ displayName: 'Malformed Upload User' });
    const dm = await createTestUser({ displayName: 'Malformed Upload DM' });
    const admin = await createTestUser({ displayName: 'Malformed Upload Admin', role: PlatformRole.ADMIN });
    userIds = [user.id, dm.id, admin.id];
    campaignId = (await createTestCampaign(dm.id, { name: `Malformed upload ${Date.now()}` })).id;
    await prisma.campaignMembership.create({ data: { userId: dm.id, campaignId, role: 'DM', characterIds: [] } });
    emails = { user: user.email, dm: dm.email, admin: admin.email };
    server = await startServer(emails);
  }, 90_000);

  afterAll(async () => {
    server?.child.kill('SIGKILL');
    await cleanupCampaigns([campaignId]);
    await cleanupUsers(userIds);
    await prisma.$disconnect();
    fs.rmSync(SCRATCH, { recursive: true, force: true });
  });

  /** A server that crashed or hung on the previous case is replaced, so each case reports for itself. */
  beforeEach(async () => {
    if (!server || !(await isAlive(server))) {
      server?.child.kill('SIGKILL');
      server = await startServer(emails);
    }
  }, 90_000);

  it('removes the partial file when the client drops the connection mid-upload', async () => {
    const live = server as RunningServer;
    const filesOnDisk = (): string[] =>
      fs.existsSync(UPLOAD_DIR)
        ? (fs.readdirSync(UPLOAD_DIR, { recursive: true }) as string[]).filter((entry) =>
            fs.statSync(path.join(UPLOAD_DIR, entry)).isFile()
          )
        : [];
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const before = filesOnDisk().length;

    // Promise a large file, send the start of it, then hang up.
    const req = http.request({
      host: '127.0.0.1',
      port: live.port,
      path: '/api/assets/upload',
      method: 'POST',
      headers: { 'Content-Type': MULTIPART, 'Content-Length': 10_000_000, Cookie: live.cookies.user },
    });
    req.on('error', () => undefined);
    req.write(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="map.png"\r\n` +
        `Content-Type: image/png\r\n\r\n${'x'.repeat(100_000)}`
    );

    // The server is writing the file once it exists.
    for (let waited = 0; filesOnDisk().length === before && waited < 5000; waited += 50) await wait(50);
    expect(filesOnDisk().length).toBeGreaterThan(before);
    req.destroy();

    // And, with nobody left to finish it, takes the file away again.
    for (let waited = 0; filesOnDisk().length > before && waited < 5000; waited += 50) await wait(50);
    expect(filesOnDisk().length).toBe(before);
    expect(await isAlive(live)).toBe(true);
  }, 90_000);

  // These three answer a refused body themselves.
  describe.each([['/api/assets/upload'], ['/api/campaigns/import/preview'], ['/api/campaigns/import']])(
    'POST %s',
    (route) => {
      it.each(MALFORMED_BODIES)('answers 400 and keeps running for $name', async ({ contentType, body }) => {
        const live = server as RunningServer;
        const res = await sendRaw(live, route, 'user', contentType, body);

        // A crash shows up as a connection that broke with no answer.
        if (res.socketError) {
          throw new Error(`No answer (${res.socketError}). The server wrote to stderr:\n${live.stderr().slice(-1500)}`);
        }
        // Refused by the parser itself, not let through to be refused later for
        // lacking the fields a real upload has.
        expect(res.status).toBe(400);
        expect(JSON.parse(res.body)).toMatchObject({ error: 'Upload Error' });

        // Still running, and still serving.
        expect(await isAlive(live)).toBe(true);
      }, 90_000);
    }
  );

  // TODO(upload): these two leave a refused body to the generic error handler,
  // which answers 500 "An unexpected error occurred". A refusal should be a 400
  // that says what was wrong, as on the routes above. Until then this checks
  // only what matters most: that the server survives and does not report success.
  describe.each([
    ['/api/campaigns/:campaignId/maps/import-uvtt', 'dm' as const],
    ['/api/admin/backups/restore', 'admin' as const],
  ])('POST %s', (route, who) => {
    it.each(MALFORMED_BODIES)('keeps running and refuses $name', async ({ contentType, body }) => {
      const live = server as RunningServer;
      const res = await sendRaw(live, route.replace(':campaignId', campaignId), who, contentType, body);

      if (res.socketError) {
        throw new Error(`No answer (${res.socketError}). The server wrote to stderr:\n${live.stderr().slice(-1500)}`);
      }
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await isAlive(live)).toBe(true);
    }, 90_000);
  });
});
