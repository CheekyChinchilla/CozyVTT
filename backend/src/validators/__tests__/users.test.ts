/**
 * What a display name keeps of the invisible characters sent with it.
 *
 * Controls, bidirectional marks, zero-width spaces and the like are removed,
 * so a name cannot look blank or pass for someone else's. The joiners and tag
 * characters some text needs are kept where that text uses them: emoji
 * sequences (families, professions, skin tones), the Scotland, Wales and
 * England flags, and Persian, Urdu and Indic names. A joiner is kept between
 * any two characters that are neither ASCII nor space, which takes in two
 * accented letters, and removed anywhere else, so it cannot hide inside a
 * name typed in ASCII; a tag is removed anywhere outside a flag.
 */

import { cleanDisplayName } from '../users';

const ZWNJ = '\u200C';
const ZWJ = '\u200D';
/** Man, woman, girl and boy, joined into one family emoji. */
const FAMILY = `\u{1F468}${ZWJ}\u{1F469}${ZWJ}\u{1F467}${ZWJ}\u{1F466}`;
/** Woman technologist with a medium skin tone. */
const TECHNOLOGIST = `\u{1F469}\u{1F3FD}${ZWJ}\u{1F4BB}`;
/** A black flag followed by the tags g, b, s, c, t and the cancel tag. */
const SCOTLAND = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
/** Persian "mi-khaham" (I want), which needs a non-joiner after its second letter. */
const PERSIAN = `می${ZWNJ}خواهم`;
/** Devanagari ka, virama, joiner, ssa: the half-form conjunct. */
const DEVANAGARI = `क्${ZWJ}ष`;

const bytes = (text: string) => Buffer.from(text, 'utf8');

describe('cleanDisplayName keeps what real names and emoji need', () => {
  it('keeps a family emoji sequence byte for byte', () => {
    expect(bytes(cleanDisplayName(FAMILY))).toEqual(bytes(FAMILY));
    expect(cleanDisplayName(`Rin ${FAMILY}`)).toBe(`Rin ${FAMILY}`);
  });

  it('keeps a profession emoji with a skin tone', () => {
    expect(bytes(cleanDisplayName(TECHNOLOGIST))).toEqual(bytes(TECHNOLOGIST));
  });

  it('keeps the Scotland flag byte for byte', () => {
    expect(bytes(cleanDisplayName(SCOTLAND))).toEqual(bytes(SCOTLAND));
    expect(cleanDisplayName(`Morag ${SCOTLAND}`)).toBe(`Morag ${SCOTLAND}`);
  });

  it('keeps the non-joiner in a Persian word', () => {
    expect(cleanDisplayName(PERSIAN)).toBe(PERSIAN);
  });

  it('keeps the joiner in a Devanagari conjunct', () => {
    expect(cleanDisplayName(DEVANAGARI)).toBe(DEVANAGARI);
  });

  it('keeps a joiner between two characters outside ASCII, accented letters included', () => {
    expect(cleanDisplayName(`Ren\u00E9${ZWNJ}\u00E9e`)).toBe(`Ren\u00E9${ZWNJ}\u00E9e`);
    expect(cleanDisplayName(`Ren${ZWNJ}\u00E9e`)).toBe('Ren\u00E9e');
  });
});

describe('cleanDisplayName removes joiners and tags anywhere else', () => {
  it('removes a joiner between two Latin letters', () => {
    expect(cleanDisplayName(`Ali${ZWJ}ce`)).toBe('Alice');
    expect(cleanDisplayName(`Ali${ZWNJ}ce`)).toBe('Alice');
  });

  it('removes a joiner next to a Latin letter or a space', () => {
    expect(cleanDisplayName(`क${ZWJ}a`)).toBe('कa');
    expect(cleanDisplayName(`a${ZWNJ}क`)).toBe('aक');
    expect(cleanDisplayName(`क ${ZWJ}ष`)).toBe('क ष');
  });

  it('removes a joiner at either end', () => {
    expect(cleanDisplayName(`${ZWJ}\u{1F468}`)).toBe('\u{1F468}');
    expect(cleanDisplayName(`\u{1F468}${ZWNJ}`)).toBe('\u{1F468}');
  });

  it('removes repeated joiners', () => {
    expect(cleanDisplayName(`क्${ZWJ}${ZWJ}ष`)).toBe('क्ष');
  });

  it('removes tag characters outside a flag', () => {
    expect(cleanDisplayName('Bob\u{E0062}\u{E006F}\u{E0062}\u{E007F}')).toBe('Bob');
    expect(cleanDisplayName('\u{1F3F4}\u{E0067}\u{E0062}')).toBe('\u{1F3F4}');
  });

  it('removes a right-to-left override at the start of a name', () => {
    expect(cleanDisplayName('\u202EAlice')).toBe('Alice');
  });

  it('still removes zero-width spaces, word joiners, byte-order marks and controls', () => {
    expect(cleanDisplayName('Al\u200Bi\u2060c\uFEFFe\u0007\u2066')).toBe('Alice');
  });
});
