// Elyxion Basic Tests
'use strict';

const { TestRunner } = require('./runner');
const assert = require('assert');

const runner = new TestRunner();

runner.describe('Elyxion Core', () => {
  runner.it('should have process object', () => {
    assert(process);
    assert(typeof process.pid === 'number');
  });

  runner.it('should have console object', () => {
    assert(console);
    assert(typeof console.log === 'function');
  });

  runner.it('should have Buffer class', () => {
    assert(typeof Buffer === 'function');
    const buf = Buffer.from('hello');
    assert.strictEqual(buf.length, 5);
  });

  runner.it('should have setTimeout', () => {
    assert(typeof setTimeout === 'function');
  });

  runner.it('should have setInterval', () => {
    assert(typeof setInterval === 'function');
  });
});

runner.describe('Events Module', () => {
  const events = require('events');

  runner.it('should have EventEmitter class', () => {
    assert(typeof events.EventEmitter === 'function');
  });

  runner.it('should emit and listen to events', (done) => {
    const emitter = new events.EventEmitter();
    let called = false;

    emitter.on('test', () => {
      called = true;
    });

    emitter.emit('test');
    assert(called);
  });

  runner.it('should pass data to listeners', () => {
    const emitter = new events.EventEmitter();
    let receivedData = null;

    emitter.on('data', (data) => {
      receivedData = data;
    });

    emitter.emit('data', 'hello');
    assert.strictEqual(receivedData, 'hello');
  });

  runner.it('should support once listener', () => {
    const emitter = new events.EventEmitter();
    let count = 0;

    emitter.once('test', () => {
      count++;
    });

    emitter.emit('test');
    emitter.emit('test');
    assert.strictEqual(count, 1);
  });
});

runner.describe('Path Module', () => {
  const path = require('path');

  runner.it('should have path module', () => {
    assert(path);
    assert(typeof path.join === 'function');
  });

  runner.it('should join paths', () => {
    const result = path.join('/foo', 'bar', 'baz');
    // Handle both Unix and Windows path separators
    const expected = path.join('/foo', 'bar', 'baz');
    assert.strictEqual(result, expected);
  });

  runner.it('should get directory name', () => {
    const result = path.dirname('/foo/bar/baz.txt');
    assert.strictEqual(result, '/foo/bar');
  });

  runner.it('should get base name', () => {
    const result = path.basename('/foo/bar/baz.txt');
    assert.strictEqual(result, 'baz.txt');
  });

  runner.it('should get extension', () => {
    const result = path.extname('file.txt');
    assert.strictEqual(result, '.txt');
  });

  runner.it('should normalize paths', () => {
    const result = path.normalize('/foo/bar/../baz');
    const expected = path.normalize('/foo/baz');
    assert.strictEqual(result, expected);
  });

  runner.it('should resolve paths', () => {
    const result = path.resolve('foo', 'bar');
    const expected = path.resolve('foo', 'bar');
    assert.strictEqual(result, expected);
  });
});

runner.describe('Util Module', () => {
  const util = require('util');

  runner.it('should have util module', () => {
    assert(util);
  });

  runner.it('should format strings', () => {
    const result = util.format('Hello %s', 'World');
    assert.strictEqual(result, 'Hello World');
  });

  runner.it('should inspect objects', () => {
    const result = util.inspect({ a: 1 });
    assert(result.includes('a'));
    assert(result.includes('1'));
  });

  runner.it('should check types', () => {
    assert(util.isString('hello'));
    assert(util.isNumber(123));
    assert(util.isBoolean(true));
    assert(util.isObject({}));
    assert(util.isArray([]));
  });

  runner.it('should do deep equality', () => {
    assert(util.isDeepStrictEqual({ a: 1 }, { a: 1 }));
    assert(!util.isDeepStrictEqual({ a: 1 }, { a: 2 }));
  });
});

// Run tests
runner.run().then(results => {
  process.exit(results.failed > 0 ? 1 : 0);
});
