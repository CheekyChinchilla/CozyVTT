import { databaseCredentialProblem, enforceDatabaseCredential } from '../databaseGuard';

describe('databaseCredentialProblem', () => {
  it('accepts a real password', () => {
    expect(databaseCredentialProblem('postgresql://cozyvtt:s3cr3t-and-long@database:5432/cozyvtt')).toBeNull();
  });

  it.each([
    'postgresql://cozyvtt:CHANGE_ME_TO_SECURE_PASSWORD@database:5432/cozyvtt',
    'postgresql://cozyvtt:CHANGE_ME@database:5432/cozyvtt',
    'postgresql://cozyvtt:CHANGE_ME_TO_SECURE_PASSWORD@localhost/cozyvtt?schema=public',
  ])('names the placeholder in %s', (url) => {
    expect(databaseCredentialProblem(url)).toMatch(/placeholder/);
  });

  it('names an unset or malformed URL', () => {
    expect(databaseCredentialProblem(undefined)).toMatch(/not set/);
    expect(databaseCredentialProblem('not a url')).toMatch(/not a valid/);
  });
});

describe('enforceDatabaseCredential', () => {
  const placeholder = 'postgresql://cozyvtt:CHANGE_ME_TO_SECURE_PASSWORD@database:5432/cozyvtt';

  it('exits in production on the placeholder', () => {
    const exit = jest.fn();
    enforceDatabaseCredential({ DATABASE_URL: placeholder, NODE_ENV: 'production' }, exit);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('only warns outside production', () => {
    const exit = jest.fn();
    enforceDatabaseCredential({ DATABASE_URL: placeholder, NODE_ENV: 'development' }, exit);
    expect(exit).not.toHaveBeenCalled();
  });

  it('does nothing with a real password in production', () => {
    const exit = jest.fn();
    enforceDatabaseCredential({ DATABASE_URL: 'postgresql://u:real-password-here@db:5432/x', NODE_ENV: 'production' }, exit);
    expect(exit).not.toHaveBeenCalled();
  });
});
