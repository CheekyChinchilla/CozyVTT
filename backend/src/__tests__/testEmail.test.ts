/**
 * Test users are created several at a time (Promise.all), and jest runs test
 * files in parallel against one database, so two addresses made in the same
 * millisecond must still differ or the second insert hits the unique email.
 */
import { testEmail } from './helpers/db';

describe('testEmail', () => {
  it('gives two calls in the same millisecond different addresses', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const first = testEmail('user');
    const second = testEmail('user');
    now.mockRestore();
    expect(first).not.toBe(second);
  });
});
