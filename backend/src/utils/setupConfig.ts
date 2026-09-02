/**
 * The setup wizard's system configuration step.
 *
 * The wizard asks for an instance name, a timezone, and whether public
 * registration is allowed. It validated the name and showed all three back on
 * its review screen, but none of them were sent and `POST /api/setup/init` read
 * only the admin's credentials — so every instance came up with the defaults
 * regardless. An admin who deliberately enabled registration got it disabled,
 * and nothing said so.
 *
 * Kept as a pure function rather than inline in the route so it can be tested
 * without a database. Reaching the state the route needs — no settings row, no
 * users — means emptying tables the rest of the suite is using at the same
 * time, which is not a trade worth making for logic that is really just
 * "read three optional fields the same way the admin settings page does".
 */

import { sanitizeInput } from './validation';

/** The subset of system settings the wizard can set. */
export interface SetupSystemConfig {
  instanceName?: string;
  timezone?: string;
  allowRegistration?: boolean;
}

/** Field caps, matching PUT /api/admin/settings so the two cannot disagree. */
const MAX_INSTANCE_NAME = 100;
const MAX_TIMEZONE = 50;

/**
 * Pick the configuration fields out of a setup request body.
 *
 * Anything absent, blank or of the wrong type is omitted rather than rejected,
 * leaving that setting at its default. Setup runs exactly once per instance:
 * failing the whole thing over a malformed optional field would cost an admin
 * their only chance to run it, for no gain.
 */
export function systemConfigFromSetupBody(body: unknown): SetupSystemConfig {
  const config: SetupSystemConfig = {};
  if (typeof body !== 'object' || body === null) return config;

  const { instanceName, timezone, allowRegistration } = body as Record<string, unknown>;

  if (typeof instanceName === 'string' && instanceName.trim()) {
    config.instanceName = sanitizeInput(instanceName).slice(0, MAX_INSTANCE_NAME);
  }
  if (typeof timezone === 'string' && timezone.trim()) {
    config.timezone = sanitizeInput(timezone).slice(0, MAX_TIMEZONE);
  }
  // Explicitly `boolean`, so that a `false` is carried through as a choice
  // rather than mistaken for an absent field — the difference between "left it
  // off" and "never asked" is the whole point of this step.
  if (typeof allowRegistration === 'boolean') {
    config.allowRegistration = allowRegistration;
  }

  return config;
}
