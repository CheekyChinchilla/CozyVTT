/**
 * A state-changing request a browser sends from another site is refused.
 *
 * The session cookie is SameSite=Lax, which a page on another port of the
 * same host, or on a sibling subdomain, still receives: those count as the
 * same site. Such a page could post to the API, or open a socket, as whoever
 * was signed in. Browsers say where a request came from in Sec-Fetch-Site.
 */

import { crossSiteRefused } from '../originCheck';

const CORS_ORIGIN = 'https://table.example.com';

beforeAll(() => { process.env.CORS_ORIGIN = CORS_ORIGIN; });

describe('crossSiteRefused', () => {
  it('lets through the page itself and a request typed into the address bar', () => {
    expect(crossSiteRefused({ 'sec-fetch-site': 'same-origin', origin: 'https://table.example.com' })).toBe(false);
    expect(crossSiteRefused({ 'sec-fetch-site': 'none' })).toBe(false);
  });

  it('lets through a client that is not a browser, which sends no Sec-Fetch-Site', () => {
    expect(crossSiteRefused({})).toBe(false);
    expect(crossSiteRefused({ origin: 'https://anything.example' })).toBe(false);
  });

  it('refuses another port or subdomain of the same site, and another site', () => {
    expect(crossSiteRefused({ 'sec-fetch-site': 'same-site', origin: 'https://table.example.com:8443' })).toBe(true);
    expect(crossSiteRefused({ 'sec-fetch-site': 'same-site', origin: 'https://evil.example.com' })).toBe(true);
    expect(crossSiteRefused({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })).toBe(true);
    expect(crossSiteRefused({ 'sec-fetch-site': 'cross-site' })).toBe(true);
  });

  // A frontend served from its own address, with CORS_ORIGIN naming it, is
  // how a split install works.
  it('lets through the address CORS_ORIGIN names', () => {
    expect(crossSiteRefused({ 'sec-fetch-site': 'same-site', origin: CORS_ORIGIN })).toBe(false);
    expect(crossSiteRefused({ 'sec-fetch-site': 'cross-site', origin: CORS_ORIGIN })).toBe(false);
  });
});
