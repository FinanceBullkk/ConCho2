const logger = require('./logger');

// ──────────────────────────────────────────────────────────
// In-process domain-event bus (rearchitecture Phase 0).
//
// Lets business mutations PUBLISH a domain event and have cross-cutting concerns
// (notifications, audit, completion rollups) SUBSCRIBE — instead of hand-wiring
// every side effect into the use-case. In-process + synchronous (awaited): a
// publisher calls `publish(...)` AFTER its mutation has persisted, and each
// subscriber runs before `publish` resolves, so a request still completes its
// side effects within the same turn (preserving today's behaviour).
//
// Modular-monolith appropriate — no external broker. A throwing subscriber is
// logged and ISOLATED: one bad handler never breaks the request or the other
// handlers (mirrors the existing fail-soft notification behaviour).
// ──────────────────────────────────────────────────────────

const handlers = new Map(); // eventName -> [handler]

/** Register a handler for an event. Multiple handlers per event run in order. */
function subscribe(eventName, handler) {
  if (typeof handler !== 'function') {
    throw new TypeError(`event-bus: handler for "${eventName}" must be a function`);
  }
  if (!handlers.has(eventName)) handlers.set(eventName, []);
  handlers.get(eventName).push(handler);
}

/**
 * Publish an event to all subscribers. Awaits each handler; a handler that
 * throws is logged and skipped (never propagates to the caller).
 */
async function publish(eventName, payload) {
  const list = handlers.get(eventName);
  if (!list || list.length === 0) return;
  for (const handler of list) {
    try {
      await handler(payload);
    } catch (err) {
      logger.error({ err, event: eventName }, 'domain event subscriber failed');
    }
  }
}

/** Test helper — drop all registrations so suites start from a clean bus. */
function _clear() {
  handlers.clear();
}

module.exports = { subscribe, publish, _clear };
