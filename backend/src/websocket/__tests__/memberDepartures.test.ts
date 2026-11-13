/**
 * The short record of why a member went out of a campaign, which a tab
 * joining at that moment, or reconnecting soon after, is told.
 */

import { randomUUID } from 'crypto';
import { rememberDeparture, whyNotAMember, DEPARTURE_MEMORY_MS } from '../memberDepartures';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('whyNotAMember', () => {
  it('gives the reason a leave or a removal recorded', () => {
    const [leaver, removed, campaign] = [randomUUID(), randomUUID(), randomUUID()];
    rememberDeparture(leaver, campaign, 'left');
    rememberDeparture(removed, campaign, 'removed');

    expect(whyNotAMember(leaver, campaign)).toBe('left');
    expect(whyNotAMember(removed, campaign)).toBe('removed');
  });

  it('says not-member for someone with no record, and for another campaign of someone with one', () => {
    const [user, campaign, other] = [randomUUID(), randomUUID(), randomUUID()];
    rememberDeparture(user, campaign, 'left');

    expect(whyNotAMember(randomUUID(), campaign)).toBe('not-member');
    expect(whyNotAMember(user, other)).toBe('not-member');
  });

  it('keeps the latest reason for the same member and campaign', () => {
    const [user, campaign] = [randomUUID(), randomUUID()];
    rememberDeparture(user, campaign, 'removed');
    rememberDeparture(user, campaign, 'left');

    expect(whyNotAMember(user, campaign)).toBe('left');
  });

  it('says not-member once a minute has passed', () => {
    const [user, campaign] = [randomUUID(), randomUUID()];
    const start = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start);
    rememberDeparture(user, campaign, 'left');

    clock.mockReturnValue(start + DEPARTURE_MEMORY_MS - 1);
    expect(whyNotAMember(user, campaign)).toBe('left');

    clock.mockReturnValue(start + DEPARTURE_MEMORY_MS);
    expect(whyNotAMember(user, campaign)).toBe('not-member');
  });

  it('forgets records that have run out as new ones are written', () => {
    const [user, campaign] = [randomUUID(), randomUUID()];
    const start = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start);
    rememberDeparture(user, campaign, 'removed');

    // Written after the first has run out; going back in time would find it
    // again had it been kept.
    clock.mockReturnValue(start + DEPARTURE_MEMORY_MS);
    rememberDeparture(randomUUID(), randomUUID(), 'left');
    clock.mockReturnValue(start);
    expect(whyNotAMember(user, campaign)).toBe('not-member');
  });
});
