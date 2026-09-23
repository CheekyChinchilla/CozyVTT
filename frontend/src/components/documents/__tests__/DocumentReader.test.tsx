/**
 * Reading a document inside CozyVTT.
 *
 * The case that matters is Markdown containing HTML. The server serves the
 * file as text/plain so the browser never renders it as a page, and this
 * component renders it with react-markdown, which ignores raw HTML unless
 * rehype-raw is added. That must stay true: a <script> in a shared house-rules
 * file has to end up as visible text, never as a script element.
 *
 * The PDF path is an <iframe> pointing at the document route. What is checked
 * is that it points at the right URL and nothing else, because everything that
 * makes an inline PDF safe is on the response, not in here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DocumentReader, { documentFormat } from '../DocumentReader';

vi.mock('@/services/api', () => {
  const client = {
    getDocumentUrl: (id: string) => `/api/assets/documents/${id}`,
    updateDocumentContent: vi.fn(),
  };
  return { api: client, default: client };
});

import api from '@/services/api';
const updateDocumentContent = api.updateDocumentContent as ReturnType<typeof vi.fn>;

const originalFetch = globalThis.fetch;

function mockFetch(body: string, status = 200) {
  globalThis.fetch = vi.fn(async () =>
    new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  ) as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('documentFormat', () => {
  it('decides from the extension, case-insensitively', () => {
    expect(documentFormat('rules.pdf')).toBe('pdf');
    expect(documentFormat('RULES.PDF')).toBe('pdf');
    expect(documentFormat('house-rules.md')).toBe('markdown');
    expect(documentFormat('notes.txt')).toBe('text');
  });

  it('treats anything unrecognised as plain text, the safest reading', () => {
    expect(documentFormat('mystery')).toBe('text');
  });
});

describe('DocumentReader', () => {
  it('shows a PDF in an iframe pointing at the document route', () => {
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-1" name="Rules" originalName="rules.pdf" />
    );
    const frame = screen.getByTitle('Rules');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', '/api/assets/documents/doc-1');
  });

  it('sandboxes the PDF frame without allow-same-origin', () => {
    // The attribute is what isolates the viewer: a null origin that cannot send
    // the SameSite=Lax session cookie. A sandbox directive on the PDF response
    // does not do this, so the attribute is the only thing standing here.
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-1" name="Rules" originalName="rules.pdf" />
    );
    const sandbox = screen.getByTitle('Rules').getAttribute('sandbox') ?? '';
    expect(sandbox.split(/\s+/)).toContain('allow-scripts');
    expect(sandbox).not.toMatch(/allow-same-origin/);
  });

  it('does not fetch a PDF itself', () => {
    mockFetch('should not be called');
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-1" name="Rules" originalName="rules.pdf" />
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('renders Markdown', async () => {
    mockFetch('# House Rules\n\nRoll a d20 for *everything*.');
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-2" name="House Rules" originalName="rules.md" />
    );
    expect(await screen.findByRole('heading', { name: 'House Rules', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('everything')).toBeInTheDocument();
  });

  it('shows HTML inside Markdown as text, never as elements', async () => {
    mockFetch('Read this:\n\n<script>window.__pwned = true</script>\n\n<img src=x onerror="window.__pwned=true">');
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-3" name="Sneaky" originalName="sneaky.md" />
    );
    const shown = await screen.findByText(/Read this/);

    // The modal renders through a portal, so look at the document, not the
    // render container. Querying the container would pass with nothing in it,
    // which is the wrong way for a security test to pass.
    const reader = shown.closest('[role="dialog"]') ?? document.body;
    expect(reader.querySelector('script')).toBeNull();
    expect(reader.querySelector('img[src="x"]')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    // The tag text is still there for a person to read, as text.
    expect(reader.textContent).toContain('<script>');
  });

  it('shows plain text preformatted', async () => {
    mockFetch('line one\n  indented line two');
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-4" name="Notes" originalName="notes.txt" />
    );
    const shown = await screen.findByText(/line one/);
    expect(shown.tagName).toBe('PRE');
    expect(shown.textContent).toContain('  indented line two');
  });

  it('says so when the document is not available to the reader', async () => {
    mockFetch('', 404);
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-5" name="Private" originalName="private.md" />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available to you/i);
  });

  it('offers the same URL for opening in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-1" name="Rules" originalName="rules.pdf" />
    );
    screen.getByRole('button', { name: 'Open in a new tab' }).click();
    expect(open).toHaveBeenCalledWith('/api/assets/documents/doc-1', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('offers a way out above the frame when a browser will not show a PDF inline', () => {
    // Safari shows a blank frame for an embedded PDF. Whatever the cause, the
    // reader says so and offers the path that works, which is the one the
    // player found for themselves.
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-1" name="Rules" originalName="rules.pdf" />
    );
    const hint = screen.getByRole('button', { name: 'Open this PDF in a new tab' });
    hint.click();
    expect(open).toHaveBeenCalledWith('/api/assets/documents/doc-1', '_blank', 'noopener,noreferrer');
    // Two ways out, each with its own name, so neither is ambiguous.
    expect(screen.getByRole('button', { name: 'Open in a new tab' })).not.toBe(hint);
    open.mockRestore();
  });

  it('does not offer it for a document it renders itself', async () => {
    mockFetch('plain words');
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-2" name="Notes" originalName="notes.txt" />
    );
    await waitFor(() => expect(screen.getByText('plain words')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Open this PDF in a new tab' })).toBeNull();
  });

  it('asks the server before trusting a cached copy', async () => {
    // A text document can be edited in place. With a plain fetch the browser
    // served the pre-edit text from its cache on the next open.
    mockFetch('current text');
    render(
      <DocumentReader isOpen onClose={vi.fn()} documentId="doc-6" name="Notes" originalName="notes.txt" />
    );
    await screen.findByText('current text');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/assets/documents/doc-6',
      expect.objectContaining({ cache: 'no-cache' })
    );
  });

  it('fetches nothing while closed', async () => {
    mockFetch('unused');
    render(
      <DocumentReader isOpen={false} onClose={vi.fn()} documentId="doc-2" name="X" originalName="x.md" />
    );
    await waitFor(() => expect(globalThis.fetch).not.toHaveBeenCalled());
  });

  describe('editing', () => {
    it('offers Edit only when allowed, and never for a PDF', async () => {
      mockFetch('text');
      const { unmount } = render(
        <DocumentReader isOpen onClose={vi.fn()} documentId="d" name="N" originalName="n.md" canEdit />
      );
      await screen.findByText('text');
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      unmount();

      render(<DocumentReader isOpen onClose={vi.fn()} documentId="d" name="P" originalName="p.pdf" canEdit />);
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    });

    it('does not offer Edit without the right', async () => {
      mockFetch('text');
      render(<DocumentReader isOpen onClose={vi.fn()} documentId="d" name="N" originalName="n.md" />);
      await screen.findByText('text');
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    });

    it('saves what was typed and shows it', async () => {
      mockFetch('# Old');
      updateDocumentContent.mockResolvedValue({ asset: { id: 'd', fileSize: 5 } });
      const onSaved = vi.fn();
      render(
        <DocumentReader isOpen onClose={vi.fn()} documentId="d" name="N" originalName="n.md" canEdit onSaved={onSaved} />
      );
      await screen.findByRole('heading', { name: 'Old' });
      fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

      const box = screen.getByLabelText('Edit N');
      expect(box).toHaveValue('# Old');
      fireEvent.change(box, { target: { value: '# New' } });
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => expect(updateDocumentContent).toHaveBeenCalledWith('d', '# New'));
      expect(await screen.findByRole('heading', { name: 'New' })).toBeInTheDocument();
      expect(onSaved).toHaveBeenCalledWith('d', 5);
    });

    it('keeps the text and shows the reason when a save is refused', async () => {
      mockFetch('fine');
      updateDocumentContent.mockRejectedValue({
        isAxiosError: true,
        response: { data: { error: 'Validation Error', message: 'The text contains characters that do not belong in a document.' } },
      });
      render(<DocumentReader isOpen onClose={vi.fn()} documentId="d" name="N" originalName="n.txt" canEdit />);
      await screen.findByText('fine');
      fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
      fireEvent.change(screen.getByLabelText('Edit N'), { target: { value: 'attempt' } });
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/do not belong in a document/i);
      expect(screen.getByLabelText('Edit N')).toHaveValue('attempt');
    });

    it('cancel discards the draft and returns to reading', async () => {
      mockFetch('original');
      render(<DocumentReader isOpen onClose={vi.fn()} documentId="d" name="N" originalName="n.txt" canEdit />);
      await screen.findByText('original');
      fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
      fireEvent.change(screen.getByLabelText('Edit N'), { target: { value: 'changed' } });
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(updateDocumentContent).not.toHaveBeenCalled();
      expect(screen.getByText('original')).toBeInTheDocument();
    });
  });
});
