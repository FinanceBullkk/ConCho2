const bus = require('../../lib/event-bus');

// Unit coverage for the Phase-0 in-process domain-event bus. Cross-flow parity
// (enrollment → cohort_enrolled via subscriber) is covered by the enrollment
// integration suite, which boots the app and registers the real subscribers.

describe('event-bus', () => {
  beforeEach(() => bus._clear());

  test('publish invokes a subscriber with the payload', async () => {
    const calls = [];
    bus.subscribe('thing.happened', (p) => calls.push(p));
    await bus.publish('thing.happened', { x: 1 });
    expect(calls).toEqual([{ x: 1 }]);
  });

  test('multiple subscribers run in registration order', async () => {
    const order = [];
    bus.subscribe('e', () => order.push('a'));
    bus.subscribe('e', () => order.push('b'));
    await bus.publish('e', {});
    expect(order).toEqual(['a', 'b']);
  });

  test('publishing an event with no subscribers is a no-op', async () => {
    await expect(bus.publish('nobody.listening', {})).resolves.toBeUndefined();
  });

  test('a throwing subscriber is isolated — others still run, caller never sees it', async () => {
    const ran = [];
    bus.subscribe('e', () => { throw new Error('boom'); });
    bus.subscribe('e', () => ran.push('ok'));
    await expect(bus.publish('e', {})).resolves.toBeUndefined();
    expect(ran).toEqual(['ok']);
  });

  test('async subscribers are awaited before publish resolves', async () => {
    let done = false;
    bus.subscribe('e', async () => { await Promise.resolve(); done = true; });
    await bus.publish('e', {});
    expect(done).toBe(true);
  });

  test('subscribe rejects a non-function handler', () => {
    expect(() => bus.subscribe('e', 'nope')).toThrow(TypeError);
  });
});
