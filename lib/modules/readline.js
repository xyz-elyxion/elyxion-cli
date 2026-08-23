// Elyxion readline compatibility module.
'use strict';

function createInterface(options = {}) {
  let closed = false;
  const listeners = {};

  return {
    question(prompt, callback) {
      if (closed) return;
      const answer = typeof globalThis.__elyxion_readline === 'function'
        ? globalThis.__elyxion_readline(prompt)
        : '';
      if (typeof callback === 'function') callback(answer === null ? '' : answer);
    },
    on(event, listener) {
      listeners[event] = listener;
      return this;
    },
    once(event, listener) {
      listeners[event] = listener;
      return this;
    },
    close() {
      closed = true;
      if (typeof listeners.close === 'function') listeners.close();
    },
    setPrompt() {},
    prompt() {},
    write() {}
  };
}

module.exports = { createInterface };
