/**
 * The setup wizard's system configuration step.
 *
 * The wizard collected an instance name, a timezone and a public-registration
 * choice, validated the name, and showed all three back for confirmation — then
 * sent none of them. Every instance started with the defaults, so an admin who
 * ticked "enable registration" finished setup with it switched off.
 */

import { systemConfigFromSetupBody } from '../setupConfig';

describe('systemConfigFromSetupBody', () => {
  it('carries the three fields through', () => {
    expect(
      systemConfigFromSetupBody({
        email: 'a@b.test',
        password: 'irrelevant',
        instanceName: 'The Cozy Table',
        timezone: 'Europe/London',
        allowRegistration: true,
      })
    ).toEqual({
      instanceName: 'The Cozy Table',
      timezone: 'Europe/London',
      allowRegistration: true,
    });
  });

  it('keeps an explicit false rather than treating it as absent', () => {
    // The bug and a correct "left it switched off" look identical in the
    // database, so this is the case that has to be pinned deliberately.
    const config = systemConfigFromSetupBody({ allowRegistration: false });
    expect(config).toHaveProperty('allowRegistration', false);
  });

  it('omits fields that were not sent, leaving them at their defaults', () => {
    expect(systemConfigFromSetupBody({ email: 'a@b.test' })).toEqual({});
  });

  it('ignores a blank or whitespace-only instance name', () => {
    expect(systemConfigFromSetupBody({ instanceName: '   ' })).toEqual({});
  });

  it('ignores fields of the wrong type instead of failing setup', () => {
    // Setup runs once per instance. Rejecting the whole request over a bad
    // optional field would cost the admin their only chance to run it.
    expect(
      systemConfigFromSetupBody({
        instanceName: 42,
        timezone: ['Europe/London'],
        allowRegistration: 'yes',
      })
    ).toEqual({});
  });

  it('caps an over-long instance name at 100 characters', () => {
    const config = systemConfigFromSetupBody({ instanceName: 'x'.repeat(400) });
    expect(config.instanceName).toHaveLength(100);
  });

  it('caps an over-long timezone at 50 characters', () => {
    const config = systemConfigFromSetupBody({ timezone: 'y'.repeat(200) });
    expect(config.timezone).toHaveLength(50);
  });

  it('sanitises the instance name the way the admin settings page does', () => {
    const config = systemConfigFromSetupBody({
      instanceName: '  <script>alert(1)</script>Cozy  ',
    });
    expect(config.instanceName).not.toContain('<script>');
    expect(config.instanceName?.startsWith(' ')).toBe(false);
  });

  it('survives a body that is not an object', () => {
    expect(systemConfigFromSetupBody(null)).toEqual({});
    expect(systemConfigFromSetupBody(undefined)).toEqual({});
    expect(systemConfigFromSetupBody('nonsense')).toEqual({});
  });
});
