/**
 * The one Markdown renderer.
 *
 * Personal notes and documents both show Markdown a person typed, and both used
 * to call react-markdown directly with no plugins. That left two renderers with
 * the same two gaps: tables did not render, because they are a GitHub-flavoured
 * extension and not core Markdown, and a single Enter was folded into the line
 * above, which is correct CommonMark and wrong for notes typed at a table. It
 * also meant the settings that make user-written Markdown safe existed twice.
 *
 * Now there is one. What it deliberately does not do:
 *
 * - **Render raw HTML.** react-markdown ignores it unless rehype-raw is added,
 *   and it is not. A <script> in a note is shown as the text "<script>".
 * - **Pass through unsafe links.** react-markdown's default URL transform drops
 *   javascript:, data: and the like, leaving an empty href. remark-gfm's
 *   autolinks only ever produce http, https and mailto, so nothing new can
 *   arrive that way.
 * - **Load an image from another host.** A document is read by everyone it is
 *   shared with, and an image on an outside host makes each reader's browser
 *   fetch it, telling that host who opened the document and when. Only images
 *   served by this instance are shown; any other image is replaced by its alt
 *   text.
 * - **Load anything on this instance but a picture.** Each reader's browser
 *   fetches an image with their own sign-in, so an image pointing at any other
 *   address here (a campaign export, an admin page) would be a request made in
 *   the reader's name. Only a map, token or avatar picture's own address,
 *   `/api/assets/{maps|tokens|avatars}/{id}`, is shown.
 * - **Navigate away from the page.** Notes and documents are read at the live
 *   table, so every link opens in a new tab, with `noopener noreferrer` so the
 *   page it opens can neither reach back into this one nor learn its address.
 *
 * Adding a plugin here changes every place Markdown is shown. That is the
 * point; check both when you do.
 */

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

const plugins = [remarkGfm, remarkBreaks];

/** A picture's own address: exactly `/api/assets/{maps|tokens|avatars}/{id}`. */
const PICTURE_PATH = /^\/api\/assets\/(?:maps|tokens|avatars)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for a map, token or avatar picture on this instance, given as a path
 * or as this instance's full address, with nothing after the id. As written,
 * so a `..` that the browser would resolve elsewhere is refused.
 */
function isOwnPicture(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin);
    if (url.origin !== window.location.origin || url.search !== '' || url.hash !== '') return false;
    const path = src.startsWith(window.location.origin) ? src.slice(window.location.origin.length) : src;
    return PICTURE_PATH.test(path);
  } catch {
    return false;
  }
}

const components: Components = {
  img: ({ src, alt }) =>
    src && isOwnPicture(src) ? (
      <img src={src} alt={alt ?? ''} />
    ) : (
      <span className="italic text-warm-gray">{alt || 'image not shown'}</span>
    ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

interface MarkdownProps {
  children: string;
}

export default function Markdown({ children }: MarkdownProps) {
  return (
    <ReactMarkdown remarkPlugins={plugins} components={components}>
      {children}
    </ReactMarkdown>
  );
}
