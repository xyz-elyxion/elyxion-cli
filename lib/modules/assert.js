// Elyxion assert module.
'use strict';

function fail(message) {
  throw new Error(message || 'Assertion failed');
}

function assert(value, message) {
  if (!value) fail(message);
}

assert.ok = assert;
assert.fail = fail;
assert.equal = (actual, expected, message) => {
  if (actual != expected) fail(message || `${actual} != ${expected}`);
};
assert.notEqual = (actual, expected, message) => {
  if (actual == expected) fail(message || `${actual} == ${expected}`);
};
assert.strictEqual = (actual, expected, message) => {
  if (actual !== expected) fail(message || `${actual} !== ${expected}`);
};
assert.notStrictEqual = (actual, expected, message) => {
  if (actual === expected) fail(message || `${actual} === ${expected}`);
};
assert.deepStrictEqual = (actual, expected, message) => {
  const util = require('util');
  if (!util.isDeepStrictEqual(actual, expected)) fail(message || 'Values are not deeply equal');
};
assert.throws = (fn, message) => {
  let threw = false;
  try { fn(); } catch (error) { threw = true; }
  if (!threw) fail(message || 'Missing expected exception');
};

module.exports = assert;
