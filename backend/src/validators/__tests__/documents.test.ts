/**
 * What may be typed into a document.
 *
 * The content is never interpreted, so the question is only whether it is text
 * of a sane size. HTML is text. Markdown with a javascript: link is text. What
 * makes those harmless is the reader and the serving route, and tests for each
 * live with them. What is refused here is what is not text at all: NUL bytes,
 * control characters, and anything too large to have been typed.
 */

import {
  CreateDocumentSchema,
  UpdateDocumentContentSchema,
  MAX_TYPED_DOCUMENT_BYTES,
  MAX_DOCUMENT_NAME_LENGTH,
} from '../documents';

const base = { name: 'House Rules', format: 'md' as const, content: '# Rules\n' };

describe('CreateDocumentSchema', () => {
  it('accepts plain text and Markdown', () => {
    expect(CreateDocumentSchema.safeParse(base).success).toBe(true);
    expect(CreateDocumentSchema.safeParse({ ...base, format: 'txt', content: 'notes' }).success).toBe(true);
  });

  it('defaults to personal scope', () => {
    const r = CreateDocumentSchema.safeParse(base);
    expect(r.success && r.data.scope).toBe('USER');
  });

  it('accepts HTML, because it is text and is never rendered as a page', () => {
    const r = CreateDocumentSchema.safeParse({ ...base, content: '<script>alert(1)</script>' });
    expect(r.success).toBe(true);
  });

  it('accepts Markdown with a hostile link, for the same reason', () => {
    const r = CreateDocumentSchema.safeParse({ ...base, content: '[x](javascript:alert(1))' });
    expect(r.success).toBe(true);
  });

  it('accepts an empty document', () => {
    expect(CreateDocumentSchema.safeParse({ ...base, content: '' }).success).toBe(true);
  });

  it('refuses a NUL byte, which JSON can carry as an escape', () => {
    const r = CreateDocumentSchema.safeParse({ ...base, content: 'a\x00b' });
    expect(r.success).toBe(false);
  });

  it('refuses control characters that never appear in text', () => {
    expect(CreateDocumentSchema.safeParse({ ...base, content: 'a\x01b' }).success).toBe(false);
    expect(CreateDocumentSchema.safeParse({ ...base, content: 'a\x1b[31mb' }).success).toBe(false);
  });

  it('keeps tabs, newlines and form feeds', () => {
    expect(CreateDocumentSchema.safeParse({ ...base, content: 'a\tb\r\nc\fd' }).success).toBe(true);
  });

  it('refuses content over the typed limit, and says to upload instead', () => {
    const r = CreateDocumentSchema.safeParse({ ...base, content: 'x'.repeat(MAX_TYPED_DOCUMENT_BYTES + 1) });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.message).toMatch(/upload it as a file/i);
  });

  it('measures the limit in bytes, not characters', () => {
    // Four bytes each in UTF-8. A character count would let this through.
    const r = CreateDocumentSchema.safeParse({
      ...base,
      content: '🎲'.repeat(MAX_TYPED_DOCUMENT_BYTES / 4 + 1),
    });
    expect(r.success).toBe(false);
  });

  it('refuses a format that cannot be typed', () => {
    expect(CreateDocumentSchema.safeParse({ ...base, format: 'pdf' }).success).toBe(false);
    expect(CreateDocumentSchema.safeParse({ ...base, format: 'html' }).success).toBe(false);
  });

  it('refuses a blank name', () => {
    expect(CreateDocumentSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
  });

  it('refuses a scope it does not know', () => {
    expect(CreateDocumentSchema.safeParse({ ...base, scope: 'EVERYONE' }).success).toBe(false);
  });
});

describe('UpdateDocumentContentSchema', () => {
  it('applies the same content rules', () => {
    expect(UpdateDocumentContentSchema.safeParse({ content: 'fine' }).success).toBe(true);
    expect(UpdateDocumentContentSchema.safeParse({ content: 'a\x00b' }).success).toBe(false);
  });
});

describe('parity with the frontend copy of the limits', () => {
  // The dialog states the limits it will be held to; the numbers must match.
  it('frontend/src/utils/documentLimits.ts carries the same numbers', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const copy = readFileSync(path.resolve(__dirname, '../../../../frontend/src/utils/documentLimits.ts'), 'utf8');
    expect(copy).toContain(`MAX_DOCUMENT_NAME_LENGTH = ${MAX_DOCUMENT_NAME_LENGTH};`);
    expect(copy).toContain(`MAX_TYPED_DOCUMENT_BYTES = ${MAX_TYPED_DOCUMENT_BYTES / 1024} * 1024;`);
  });
});
