/**
 * What the backend says outside production about a SESSION_SECRET it would
 * refuse in production.
 *
 * The Docker stacks pass SESSION_SECRET from the .env file at the top of the
 * CozyVTT folder (docker-compose.yml, docker-compose.dev.yml), as an empty
 * value when it is unset, and a variable already set is never replaced from
 * backend/.env. The warning named backend/.env alone, so a developer on the
 * Docker dev stack who followed it changed nothing.
 */

import { sessionSecretWarning } from '../sessionSecret';

describe('sessionSecretWarning', () => {
  const warning = sessionSecretWarning('is not set');

  it('says what is wrong with the secret', () => {
    expect(warning).toMatch(/^\[WARN\] SESSION_SECRET is not set\. /);
  });

  it('names the .env file at the top of the CozyVTT folder for the Docker stacks', () => {
    expect(warning).toMatch(/\.env file at the top of the CozyVTT folder when you run CozyVTT with Docker/);
  });

  it('names backend/.env for a backend run without Docker', () => {
    expect(warning).toMatch(/backend\/\.env when you run the backend without Docker/);
  });

  it('says how to make a secret', () => {
    expect(warning).toMatch(/openssl rand -hex 32$/);
  });
});
