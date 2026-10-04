import { themeColorSchema } from '../sheetChrome';

describe('themeColorSchema', () => {
  it.each(['Classic Red', 'Teal', 'Victorian Purple', 'Slate Gray', '#b91c1c', '#B91C1C', ''])(
    'accepts %j',
    (value) => expect(themeColorSchema.safeParse(value).success).toBe(true),
  );

  it.each(['#12345', '#12345g', 'red; background: url(x)', '<script>', 'url(javascript:alert(1))', 'x'.repeat(41)])(
    'rejects %j',
    (value) => expect(themeColorSchema.safeParse(value).success).toBe(false),
  );

  it('is optional', () => {
    expect(themeColorSchema.safeParse(undefined).success).toBe(true);
  });
});
