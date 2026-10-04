/**
 * What a request refused for want of a sign-in does, depending on whether an
 * editor holds unsaved changes.
 *
 * It sent the page to sign-in every time, and an editor open with unsaved
 * changes went with it. While one is open the page now stays where it is and
 * the editors say the browser was signed out, so the changes can be saved
 * once it signs in again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type UnsavedWork = typeof import('../unsavedWork');
let work: UnsavedWork;

beforeEach(async () => {
  vi.resetModules();
  work = await import('../unsavedWork');
});

describe('a refused request', () => {
  it('goes to sign-in when nothing is unsaved', () => {
    const goToSignIn = vi.fn();
    work.handleUnauthorized('/characters/c1/edit', goToSignIn);
    expect(goToSignIn).toHaveBeenCalled();
    expect(work.isSignedOut()).toBe(false);
  });

  it('stays, and says the browser was signed out, while changes are unsaved', () => {
    const goToSignIn = vi.fn();
    const heard = vi.fn();
    work.subscribeSignedOut(heard);
    work.holdUnsavedWork();

    work.handleUnauthorized('/characters/c1/edit', goToSignIn);

    expect(goToSignIn).not.toHaveBeenCalled();
    expect(work.isSignedOut()).toBe(true);
    expect(heard).toHaveBeenCalledWith(true);
  });

  it('does nothing on a page anyone may open', () => {
    const goToSignIn = vi.fn();
    work.holdUnsavedWork();
    work.handleUnauthorized('/auth/login', goToSignIn);
    expect(goToSignIn).not.toHaveBeenCalled();
    expect(work.isSignedOut()).toBe(false);
  });

  it('goes to sign-in again once the last unsaved change is let go', () => {
    const goToSignIn = vi.fn();
    const release = work.holdUnsavedWork();
    work.handleUnauthorized('/characters/c1/edit', goToSignIn);

    release();
    expect(work.isSignedOut()).toBe(false);
    work.handleUnauthorized('/characters/c1/edit', goToSignIn);
    expect(goToSignIn).toHaveBeenCalledTimes(1);
  });

  it('counts one release once, however often it is called', () => {
    const goToSignIn = vi.fn();
    const first = work.holdUnsavedWork();
    work.holdUnsavedWork();
    first();
    first();
    work.handleUnauthorized('/characters/c1/edit', goToSignIn);
    expect(goToSignIn).not.toHaveBeenCalled();
  });

  it('clears the signed-out state when a request succeeds again', () => {
    const heard = vi.fn();
    work.subscribeSignedOut(heard);
    work.holdUnsavedWork();
    work.handleUnauthorized('/characters/c1/edit', vi.fn());

    work.reportSignedIn();

    expect(work.isSignedOut()).toBe(false);
    expect(heard).toHaveBeenLastCalledWith(false);
  });
});
