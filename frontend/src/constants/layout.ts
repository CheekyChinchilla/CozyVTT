/**
 * The screens that get the campaign page's narrow layout: narrower than
 * Tailwind's `lg`, 64rem, which is 1,024 CSS pixels at the browser's usual
 * 16 px text. It is written in rem, as `lg` is, so the page and its `lg:`
 * classes agree whatever text size the browser is set to. Below it the
 * Creature Library and Token Templates open their forms as a step of their
 * own (`components/campaign/libraryFormStep.tsx`). Ask it through
 * `useMediaQuery(COMPACT_LAYOUT_QUERY)`; never write the width again, since a
 * second copy drifts (`constants/__tests__/layout.test.ts` fails on one, and
 * when this is not the exact complement of `lg`).
 */
export const COMPACT_LAYOUT_QUERY = '(width < 64rem)';

/**
 * A screen under 500 px tall, such as a phone turned sideways: the query
 * Tailwind's `short:` variant asks (`@custom-variant short` in index.css).
 * Code that must change with it asks `useMediaQuery(SHORT_SCREEN_QUERY)`, so
 * a component's code and its `short:` classes change together;
 * `constants/__tests__/layout.test.ts` holds the two to one another.
 */
export const SHORT_SCREEN_QUERY = '(max-height: 499.98px)';

/**
 * A short screen wider than it is tall, as a phone turned on its side is: the
 * compact layout then puts the bar's buttons in its header and draws its
 * sheets from the side. A short window narrower than it is tall has no room
 * for the buttons beside the campaign's name, so it keeps the bar at its foot.
 */
export const SIDEWAYS_QUERY = `${SHORT_SCREEN_QUERY} and (orientation: landscape)`;
