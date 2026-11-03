/**
 * CozyVTT added to a phone's or a tablet's home screen opens as an app of
 * its own: full screen, at the dashboard, with its name and icon. The
 * manifest is all it takes; there is no service worker, so nothing is kept
 * offline and every page is the server's latest.
 */

import { describe, it, expect } from 'vitest';
import manifestText from '../../public/manifest.webmanifest?raw';
import indexHtml from '../../index.html?raw';
import nginxConf from '../../nginx.conf?raw';

/** The pictures in the public folder, by their address. */
const publicPictures = Object.keys(import.meta.glob('../../public/*.png')).map((p) => p.slice(p.lastIndexOf('/')));

const manifest = JSON.parse(manifestText) as {
  name: string; short_name: string; start_url: string; scope: string; display: string;
  theme_color: string; background_color: string; icons: Array<{ src: string; sizes: string; type: string }>;
};

describe('the home-screen app', () => {
  it('opens full screen at the dashboard, named CozyVTT, in the app\'s colours', () => {
    expect(manifest).toMatchObject({ name: 'CozyVTT', short_name: 'CozyVTT', start_url: '/dashboard', scope: '/', display: 'standalone' });
    const themeColour = /<meta name="theme-color" content="([^"]+)"/.exec(indexHtml)?.[1];
    expect(manifest.theme_color).toBe(themeColour);
  });

  it('names a 192 and a 512 pixel icon that are in the public folder', () => {
    expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of manifest.icons) expect(publicPictures, icon.src).toContain(icon.src);
  });

  it('is served as a manifest, which the image\'s nginx types do not name', () => {
    const block = /location = \/manifest\.webmanifest \{([^}]*\{\s*\}[^}]*)\}/.exec(nginxConf)?.[1] ?? '';
    expect(block).toContain('default_type application/manifest+json;');
    expect(block).toContain('include /etc/nginx/security-headers.conf;');
  });

  it('is linked from the page', () => {
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  });
});
