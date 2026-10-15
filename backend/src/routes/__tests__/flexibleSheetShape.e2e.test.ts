/**
 * A Flexible sheet (a character or template with no game system) is checked
 * against the shape its sheet reads before it is stored.
 *
 * It used to be stored exactly as sent. A section missing the list its type
 * reads, or a table cell holding an object, was saved, and opening that sheet
 * then threw inside the page of everyone who viewed it. A null sheet answered
 * 500, and a string or an array was stored as the sheet.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const u = await createTestUser({ displayName: 'Freeform' });
  userId = u.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.characterTemplate.deleteMany({ where: { createdById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

/** A sheet using every kind of section the Flexible editor makes. */
function goodSheet(): Record<string, unknown> {
  return {
    sections: [
      {
        id: 's-stats', title: 'Attributes', type: 'stats',
        fields: [{ id: 'f1', name: 'Strength', value: 14, modifier: 2 }],
      },
      { id: 's-list', title: 'Inventory', type: 'list', items: [{ id: 'i1', text: 'Rope', checked: false }] },
      { id: 's-text', title: 'Background', type: 'text', value: 'Raised by wolves.' },
      {
        id: 's-table', title: 'Equipment', type: 'table',
        columns: [{ id: 'c1', name: 'Item', width: '50%' }, { id: 'c2', name: 'Notes', width: '50%' }],
        rows: [{ id: 'r1', cells: { c1: 'Sword', c2: 'Sharp' } }],
      },
    ],
  };
}

async function createFlexible(data: unknown = goodSheet()): Promise<string> {
  const res = await agent.post('/api/characters').send({ name: 'Freeform', data });
  expect(res.status).toBe(201);
  return res.body.character.id as string;
}

/** Sheets each refused for one thing their page would trip over. */
const malformed: Array<[string, unknown]> = [
  ['a stats section with no fields', { sections: [{ id: 'x', title: 't', type: 'stats' }] }],
  ['a list section with no items', { sections: [{ id: 'x', title: 't', type: 'list' }] }],
  ['a table section with no rows', { sections: [{ id: 'x', title: 't', type: 'table', columns: [] }] }],
  ['a section of an unknown type', { sections: [{ id: 'x', title: 't', type: 'chart', points: [] }] }],
  ['sections that are not a list', { sections: 'many' }],
  ['a table cell holding an object', {
    sections: [{ id: 'x', title: 't', type: 'table', columns: [{ id: 'c1', name: 'A' }], rows: [{ id: 'r1', cells: { c1: { nested: true } } }] }],
  }],
  ['a stat value that is not a number', {
    sections: [{ id: 'x', title: 't', type: 'stats', fields: [{ id: 'f', name: 'Str', value: 'lots' }] }],
  }],
  ['a text section over 100,000 characters', {
    sections: [{ id: 'x', title: 't', type: 'text', value: 'x'.repeat(100_001) }],
  }],
  ['more than 100 sections', {
    sections: Array.from({ length: 101 }, (_, i) => ({ id: `s${i}`, title: 't', type: 'text', value: '' })),
  }],
];

describe('creating a Flexible character', () => {
  it.each(malformed)('refuses %s', async (_label, data) => {
    const res = await agent.post('/api/characters').send({ name: 'Broken', data });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(Array.isArray(res.body.validationErrors)).toBe(true);
    expect(res.body.validationErrors.length).toBeGreaterThan(0);
  });

  it.each([['null', null], ['a string', 'x'], ['an array', [1, 2]], ['a number', 7]])(
    'refuses a sheet that is %s',
    async (_label, data) => {
      const res = await agent.post('/api/characters').send({ name: 'Broken', data });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    }
  );

  it('stores a sheet using every kind of section', async () => {
    const id = await createFlexible();
    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(stored.data).toEqual(goodSheet());
  });

  it('stores a character created with no sheet as an empty one', async () => {
    const res = await agent.post('/api/characters').send({ name: 'Empty' });
    expect(res.status).toBe(201);
    const stored = await prisma.character.findUniqueOrThrow({ where: { id: res.body.character.id } });
    expect(stored.data).toEqual({});
  });

  it('keeps what a sheet stores beside its sections', async () => {
    const id = await createFlexible({ ...goodSheet(), hp: 30, notes: 'Imported' });
    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(stored.data).toMatchObject({ hp: 30, notes: 'Imported' });
  });
});

describe('saving a Flexible character', () => {
  it.each(malformed)('refuses %s and keeps the stored sheet', async (_label, data) => {
    const id = await createFlexible();
    const res = await agent.put(`/api/characters/${id}`).send({ data });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(stored.data).toEqual(goodSheet());
  });

  it.each([['null', null], ['a string', 'x'], ['an array', [1, 2]]])(
    'refuses a sheet that is %s with 400',
    async (_label, data) => {
      const id = await createFlexible();
      const res = await agent.put(`/api/characters/${id}`).send({ data });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    }
  );

  it('saves a well-formed sheet', async () => {
    const id = await createFlexible();
    const next = goodSheet();
    (next.sections as Array<Record<string, unknown>>)[2].value = 'Raised by bears.';
    const res = await agent.put(`/api/characters/${id}`).send({ data: next });
    expect(res.status).toBe(200);
    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(stored.data).toEqual(next);
  });
});

describe('Flexible character templates', () => {
  it.each(malformed)('refuses to publish %s', async (_label, data) => {
    const res = await agent.post('/api/character-templates').send({ name: 'Broken', gameSystem: null, data });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('refuses a template saved with a null sheet', async () => {
    const created = await agent.post('/api/character-templates').send({ name: 'Fine', gameSystem: null, data: goodSheet() });
    expect(created.status).toBe(201);
    const res = await agent.put(`/api/character-templates/${created.body.id}`).send({ data: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it.each(malformed)('refuses to save %s over a template', async (_label, data) => {
    const created = await agent.post('/api/character-templates').send({ name: 'Fine', gameSystem: null, data: goodSheet() });
    expect(created.status).toBe(201);
    const res = await agent.put(`/api/character-templates/${created.body.id}`).send({ data });
    expect(res.status).toBe(400);
    const stored = await prisma.characterTemplate.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.data).toEqual(goodSheet());
  });

  it('publishes a well-formed sheet as it was sent', async () => {
    const res = await agent.post('/api/character-templates').send({ name: 'Fine', gameSystem: null, data: goodSheet() });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(goodSheet());
  });
});
