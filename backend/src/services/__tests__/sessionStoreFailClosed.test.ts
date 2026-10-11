/**
 * Ending an account's sessions fails closed.
 *
 * The helper caught every database error, logged it and reported nothing
 * removed, and every caller ignored the count. A demotion, an admin reset or
 * a password change then reported success while the old sessions kept their
 * role until they expired. The helper now lets the error through, so the
 * route answers 500 and the person is told it did not take.
 */

const executeRaw = jest.fn();
jest.mock('../../config/database', () => ({
  prisma: { $executeRaw: (...args: unknown[]) => executeRaw(...args) },
}));
jest.mock('../../utils/logger', () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

import { destroyUserLoginSessions } from '../sessionStore';

beforeEach(() => executeRaw.mockReset());

it('reports how many sessions it removed', async () => {
  executeRaw.mockResolvedValue(3);
  await expect(destroyUserLoginSessions('u1')).resolves.toBe(3);
});

it('lets a database failure through instead of reporting nothing removed', async () => {
  executeRaw.mockRejectedValue(new Error('connection terminated'));
  await expect(destroyUserLoginSessions('u1')).rejects.toThrow('connection terminated');
});
