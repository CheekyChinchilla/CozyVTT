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
