import { escapeHtml } from '../html';

describe('escapeHtml', () => {
  it('escapes the five characters that can break out of text or an attribute', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Bob the Wizard, 3rd level')).toBe('Bob the Wizard, 3rd level');
  });

  it('accepts a number', () => {
    expect(escapeHtml(7)).toBe('7');
  });

  it('turns an attribute breakout into inert text', () => {
    expect(escapeHtml(`"><script>alert(1)</script>`)).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes the ampersand first, so an existing entity is not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});
