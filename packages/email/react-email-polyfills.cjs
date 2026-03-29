"use strict";

/**
 * React Email's preview server evaluates templates in a VM context by doing:
 * `{ ...global }` (spread), which only copies *enumerable* globals.
 *
 * Node's Web Streams globals (e.g. WritableStream) are non-enumerable by default,
 * so they get dropped and Next/React can crash during prerender.
 *
 * Make them enumerable (and define from node:stream/web as a fallback) so the VM
 * context includes them reliably.
 */
function ensureEnumerableGlobal(name, fallbackValue) {
  const existing = globalThis[name];
  if (existing == null && fallbackValue != null) {
    Object.defineProperty(globalThis, name, {
      value: fallbackValue,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (!descriptor || !descriptor.configurable || descriptor.enumerable) return;

  Object.defineProperty(globalThis, name, { ...descriptor, enumerable: true });
}

try {
  // These are provided by Node >= 18, but non-enumerable on globalThis.
  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  const web = require("node:stream/web");

  ensureEnumerableGlobal("WritableStream", web?.WritableStream);
  ensureEnumerableGlobal("TransformStream", web?.TransformStream);
  ensureEnumerableGlobal(
    "ByteLengthQueuingStrategy",
    web?.ByteLengthQueuingStrategy,
  );
  ensureEnumerableGlobal("CountQueuingStrategy", web?.CountQueuingStrategy);
} catch {
  // Best-effort polyfill; ignore.
}
