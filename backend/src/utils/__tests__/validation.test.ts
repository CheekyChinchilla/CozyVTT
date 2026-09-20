import { isSameOriginPath } from '../validation';

describe('isSameOriginPath', () => {
  it.each(['/logo.png', '/branding/mascot.webp', '/a/b/c.svg'])('accepts the path %j', (value) => {
    expect(isSameOriginPath(value)).toBe(true);
  });

  it.each([
    '',
    'logo.png',
    'https://evil.example/x.png',
    '//evil.example/x.png',
    // Browsers read a backslash after the first slash as a second slash, so
    // this names another host too.
    '/\\evil.example/x.png',
    '/a\\b.png',
    // The URL parser strips tabs and newlines before it looks, so these
    // would become `//evil.example/...` on the way in.
    '/\t/evil.example/x.png',
    '/\n/evil.example/x.png',
    '/a\rb.png',
  ])('refuses %j', (value) => {
    expect(isSameOriginPath(value)).toBe(false);
  });
});
