import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import { oneAtATime } from '../oneAtATime';

function fakeResponse() {
  const emitter = new EventEmitter();
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
  return res;
}

const asReq = (key: string) => ({ key }) as unknown as Request;
const asRes = (res: ReturnType<typeof fakeResponse>) => res as unknown as Response;

describe('oneAtATime', () => {
  const guard = () => oneAtATime((req) => (req as unknown as { key: string }).key || undefined, 'Wait for the other one.');

  it('refuses a second request for the same key while the first is running', () => {
    const run = guard();
    const next = jest.fn();
    const first = fakeResponse();
    const second = fakeResponse();
    run(asReq('a'), asRes(first), next);
    run(asReq('a'), asRes(second), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(second.statusCode).toBe(429);
    expect(second.body).toMatchObject({ message: 'Wait for the other one.' });
  });

  it('lets a different key through', () => {
    const run = guard();
    const next = jest.fn();
    run(asReq('a'), asRes(fakeResponse()), next);
    run(asReq('b'), asRes(fakeResponse()), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('lets the next request through as soon as the response finishes', () => {
    const run = guard();
    const next = jest.fn();
    for (let i = 0; i < 50; i++) {
      const res = fakeResponse();
      run(asReq('a'), asRes(res), next);
      res.emit('finish');
    }
    expect(next).toHaveBeenCalledTimes(50);
  });

  it('frees the slot when the connection drops', () => {
    const run = guard();
    const next = jest.fn();
    const first = fakeResponse();
    run(asReq('a'), asRes(first), next);
    first.emit('close');
    run(asReq('a'), asRes(fakeResponse()), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('does not hold requests with no key', () => {
    const run = guard();
    const next = jest.fn();
    run(asReq(''), asRes(fakeResponse()), next);
    run(asReq(''), asRes(fakeResponse()), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
