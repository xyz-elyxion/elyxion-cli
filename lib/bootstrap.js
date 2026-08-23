// Elyxion Bootstrap Script
// This initializes the JavaScript runtime environment

'use strict';

// Core polyfills and initialization
(function() {
  'use strict';
  
  // ============================================
  // Global scope setup
  // ============================================
  
  const globalObj = typeof globalThis !== 'undefined' ? globalThis : global;
  
  // Ensure console is available
  if (typeof console === 'undefined') {
    globalObj.console = {
      log: function() { print(Array.prototype.slice.call(arguments).join(' ')); },
      error: function() { print('[ERROR]', Array.prototype.slice.call(arguments).join(' ')); },
      warn: function() { print('[WARN]', Array.prototype.slice.call(arguments).join(' ')); },
      info: function() { print('[INFO]', Array.prototype.slice.call(arguments).join(' ')); },
      debug: function() { print('[DEBUG]', Array.prototype.slice.call(arguments).join(' ')); },
      trace: function() { print('[TRACE]', new Error().stack); },
      assert: function(condition) {
        if (!condition) {
          var args = Array.prototype.slice.call(arguments, 1);
          throw new Error('Assertion failed' + (args.length ? ': ' + args.join(' ') : ''));
        }
      },
      clear: function() { /* no-op in terminal */ },
      count: function(label) {
        if (!console._counts) console._counts = {};
        label = label || 'default';
        console._counts[label] = (console._counts[label] || 0) + 1;
        print(label + ': ' + console._counts[label]);
      },
      countReset: function(label) {
        if (!console._counts) console._counts = {};
        label = label || 'default';
        console._counts[label] = 0;
      },
      table: function(data) {
        print(JSON.stringify(data, null, 2));
      },
      dir: function(obj) {
        print(JSON.stringify(obj, null, 2));
      },
      time: function(label) {
        if (!console._timers) console._timers = {};
        label = label || 'default';
        console._timers[label] = Date.now();
      },
      timeEnd: function(label) {
        if (!console._timers) console._timers = {};
        label = label || 'default';
        var start = console._timers[label];
        if (start) {
          var duration = Date.now() - start;
          print(label + ': ' + duration + 'ms');
          delete console._timers[label];
        }
      },
      timeLog: function(label) {
        if (!console._timers) console._timers = {};
        label = label || 'default';
        var start = console._timers[label];
        if (start) {
          var duration = Date.now() - start;
          print(label + ': ' + duration + 'ms');
        }
      },
      group: function() {},
      groupEnd: function() {},
      groupCollapsed: function() {}
    };
  }
  
  // ============================================
  // Event Emitter
  // ============================================
  
  class EventEmitter {
    constructor() {
      this._events = {};
      this._eventsCount = 0;
    }
    
    addListener(type, listener) {
      return this.on(type, listener);
    }
    
    on(type, listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('Listener must be a function');
      }
      
      if (!this._events) this._events = {};
      
      if (!this._events[type]) {
        this._events[type] = [];
        this._eventsCount++;
      }
      
      this._events[type].push(listener);
      
      // Emit 'newListener' event
      if (this._events.newListener) {
        this.emit('newListener', type, listener);
      }
      
      return this;
    }
    
    once(type, listener) {
      const wrapper = (...args) => {
        this.removeListener(type, wrapper);
        return listener.apply(this, args);
      };
      wrapper._original = listener;
      return this.on(type, wrapper);
    }
    
    removeListener(type, listener) {
      if (!this._events || !this._events[type]) {
        return this;
      }
      
      const list = this._events[type];
      const index = list.indexOf(listener);
      
      if (index !== -1) {
        list.splice(index, 1);
        
        if (list.length === 0) {
          delete this._events[type];
          this._eventsCount--;
          
          // Emit 'removeListener' event
          if (this._events.removeListener) {
            this.emit('removeListener', type, listener);
          }
        }
      }
      
      return this;
    }
    
    off(type, listener) {
      return this.removeListener(type, listener);
    }
    
    removeAllListeners(type) {
      if (!this._events) return this;
      
      if (type) {
        if (this._events[type]) {
          delete this._events[type];
          this._eventsCount--;
          
          // Emit 'removeListener' events
          if (this._events.removeListener) {
            const listeners = this._events.removeListener.slice();
            for (const listener of listeners) {
              this.emit('removeListener', type, listener);
            }
          }
        }
      } else {
        this._events = {};
        this._eventsCount = 0;
      }
      
      return this;
    }
    
    emit(type, ...args) {
      if (!this._events || !this._events[type]) {
        return false;
      }
      
      const list = this._events[type].slice();
      
      for (const listener of list) {
        try {
          listener.apply(this, args);
        } catch (error) {
          console.error('EventEmitter error:', error);
        }
      }
      
      return true;
    }
    
    listenerCount(type) {
      if (!this._events || !this._events[type]) {
        return 0;
      }
      return this._events[type].length;
    }
    
    listeners(type) {
      if (!this._events || !this._events[type]) {
        return [];
      }
      return this._events[type].slice();
    }
    
    rawListeners(type) {
      return this.listeners(type);
    }
  }
  
  globalObj.EventEmitter = EventEmitter;
  
  // ============================================
  // Timers (setTimeout, setInterval, etc.)
  // ============================================
  
  // These will be backed by native C++ timers
  // For now, we provide JS-level wrappers
  
  if (typeof setTimeout === 'undefined') {
    globalObj.setTimeout = function(callback, delay, ...args) {
      // Will use native timer
      return 0;
    };
  }
  
  if (typeof setInterval === 'undefined') {
    globalObj.setInterval = function(callback, delay, ...args) {
      // Will use native timer
      return 0;
    };
  }
  
  if (typeof clearTimeout === 'undefined') {
    globalObj.clearTimeout = function(id) {};
  }
  
  if (typeof clearInterval === 'undefined') {
    globalObj.clearInterval = function(id) {};
  }
  
  if (typeof setImmediate === 'undefined') {
    globalObj.setImmediate = function(callback, ...args) {
      // Will use native immediate
      return 0;
    };
  }
  
  if (typeof clearImmediate === 'undefined') {
    globalObj.clearImmediate = function(id) {};
  }
  
  // ============================================
  // Buffer (simplified)
  // ============================================
  
  class Buffer {
    constructor(arg, encodingOrOffset, length) {
      if (typeof arg === 'number') {
        this._data = new Uint8Array(arg);
      } else if (typeof arg === 'string') {
        const encoder = new TextEncoder();
        this._data = encoder.encode(arg);
      } else if (arg instanceof ArrayBuffer) {
        this._data = new Uint8Array(arg);
      } else if (arg instanceof Uint8Array) {
        this._data = new Uint8Array(arg);
      } else if (Array.isArray(arg)) {
        this._data = new Uint8Array(arg);
      } else {
        throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or number');
      }
      
      Object.defineProperty(this, 'length', {
        get: () => this._data.length,
        enumerable: false
      });
    }
    
    static alloc(size, fill = 0) {
      const buf = new Buffer(size);
      buf.fill(fill);
      return buf;
    }
    
    static allocUnsafe(size) {
      return new Buffer(size);
    }
    
    static from(data, encodingOrOffset, length) {
      return new Buffer(data, encodingOrOffset, length);
    }
    
    static concat(list, totalLength) {
      if (!Array.isArray(list)) {
        throw new TypeError('list must be an Array of Buffers');
      }
      
      if (list.length === 0) {
        return Buffer.alloc(0);
      }
      
      if (totalLength === undefined) {
        totalLength = list.reduce((acc, buf) => acc + buf.length, 0);
      }
      
      const result = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      
      for (const buf of list) {
        buf.copy(result, offset);
        offset += buf.length;
      }
      
      return result;
    }
    
    static isBuffer(obj) {
      return obj instanceof Buffer;
    }
    
    fill(value, offset = 0, end = this.length) {
      if (typeof value === 'number') {
        this._data.fill(value, offset, end);
      } else if (typeof value === 'string') {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        for (let i = offset; i < end; i++) {
          this._data[i] = bytes[i - offset] || 0;
        }
      }
      return this;
    }
    
    copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
      const source = this._data.subarray(sourceStart, sourceEnd);
      target._data.set(source, targetStart);
      return sourceEnd - sourceStart;
    }
    
    slice(start = 0, end = this.length) {
      return Buffer.from(this._data.buffer.slice(start, end));
    }
    
    subarray(start = 0, end = this.length) {
      return Buffer.from(this._data.buffer.slice(start, end));
    }
    
    equals(other) {
      if (!Buffer.isBuffer(other)) {
        return false;
      }
      if (this.length !== other.length) {
        return false;
      }
      for (let i = 0; i < this.length; i++) {
        if (this._data[i] !== other._data[i]) {
          return false;
        }
      }
      return true;
    }
    
    compare(other) {
      if (!Buffer.isBuffer(other)) {
        throw new TypeError('Must compare with a Buffer');
      }
      
      const a = this._data;
      const b = other._data;
      
      const minLength = Math.min(a.length, b.length);
      
      for (let i = 0; i < minLength; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
      }
      
      return a.length - b.length;
    }
    
    toString(encoding = 'utf-8', start = 0, end = this.length) {
      const decoder = new TextDecoder(encoding);
      return decoder.decode(this._data.buffer.slice(start, end));
    }
    
    toJSON() {
      return {
        type: 'Buffer',
        data: Array.from(this._data)
      };
    }
    
    // Iterator
    *[Symbol.iterator]() {
      yield* this._data;
    }
    
    // Indexed access
    [Symbol.toPrimitive](hint) {
      if (hint === 'number') {
        return this.length;
      }
      return this.toString();
    }
  }
  
  globalObj.Buffer = Buffer;
  
  // ============================================
  // Process (minimal)
  // ============================================
  
  if (typeof process === 'undefined') {
    globalObj.process = {
      pid: 0,
      ppid: 0,
      argv: [],
      env: {},
      platform: 'unknown',
      arch: 'unknown',
      version: '1.0.0',
      versions: { elyxion: '1.0.0' },
      exit: function(code) { /* native */ },
      cwd: function() { return '.'; },
      chdir: function() {},
      nextTick: function() {},
      emitWarning: function() {},
      emit: function() {}
    };
  }
  
  // ============================================
  // Module System
  // ============================================
  
  class Module {
    constructor(id, parent) {
      this.id = id;
      this.exports = {};
      this.parent = parent;
      this.filename = null;
      this.loaded = false;
      this.children = [];
      this.paths = [];
    }
    
    load(filename) {
      this.filename = filename;
      
      // Determine module type
      const ext = filename.split('.').pop();
      
      switch (ext) {
        case 'js':
          this._compileJS(filename);
          break;
        case 'json':
          this._loadJSON(filename);
          break;
        default:
          throw new Error('Unsupported module type: ' + ext);
      }
      
      this.loaded = true;
      
      if (this.parent && this.parent.children) {
        this.parent.children.push(this);
      }
      
      return this.exports;
    }
    
    _compileJS(filename) {
      // Will use native module loading
      throw new Error('JS compilation not implemented in bootstrap');
    }
    
    _loadJSON(filename) {
      // Will use native JSON loading
      throw new Error('JSON loading not implemented in bootstrap');
    }
  }
  
  Module._cache = {};
  Module._extensions = {};
  Module._paths = [];
  
  globalObj.Module = Module;
  
  // ============================================
  // Require function (placeholder)
  // ============================================
  
  // This will be replaced by native implementation
  globalObj.require = function(id) {
    if (Module._cache[id]) {
      return Module._cache[id].exports;
    }
    
    // Built-in modules
    const builtins = ['fs', 'path', 'http', 'https', 'net', 'os', 'util', 
                      'events', 'stream', 'buffer', 'crypto', 'child_process',
                      'url', 'querystring', 'assert', 'constants', 'domain',
                      'punycode', 'string_decoder', 'timers', 'v8', 'vm',
                      'cluster', 'worker_threads', 'perf_hooks', 'async_hooks',
                      'dns', 'readline', 'tls', 'zlib', 'tty', 'dgram'];
    
    if (builtins.includes(id)) {
      console.log('Native module:', id);
      return {};
    }
    
    // Module resolution will be implemented
    throw new Error('Cannot find module \'' + id + '\'');
  };
  
  // ============================================
  // Promise utilities
  // ============================================
  
  globalObj.Promise.all = (function(original) {
    return function(iterable) {
      const promise = original.call(Promise, iterable);
      return promise;
    };
  })(Promise.all);
  
  // ============================================
  // TextEncoder/TextDecoder polyfills
  // ============================================
  
  if (typeof TextEncoder === 'undefined') {
    globalObj.TextEncoder = class TextEncoder {
      encode(str) {
        const arr = [];
        for (let i = 0; i < str.length; i++) {
          let c = str.charCodeAt(i);
          if (c < 128) {
            arr.push(c);
          } else if (c < 2048) {
            arr.push(192 | (c >> 6));
            arr.push(128 | (c & 63));
          } else {
            arr.push(224 | (c >> 12));
            arr.push(128 | ((c >> 6) & 63));
            arr.push(128 | (c & 63));
          }
        }
        return new Uint8Array(arr);
      }
    };
  }
  
  if (typeof TextDecoder === 'undefined') {
    globalObj.TextDecoder = class TextDecoder {
      constructor(encoding = 'utf-8') {
        this.encoding = encoding;
      }
      
      decode(buffer) {
        const arr = new Uint8Array(buffer);
        let str = '';
        for (let i = 0; i < arr.length; i++) {
          const byte = arr[i];
          if (byte < 128) {
            str += String.fromCharCode(byte);
          } else if (byte < 224) {
            str += String.fromCharCode(((byte & 31) << 6) | (arr[++i] & 63));
          } else {
            str += String.fromCharCode(((byte & 15) << 12) | ((arr[++i] & 63) << 6) | (arr[++i] & 63));
          }
        }
        return str;
      }
    };
  }
  
  // ============================================
  // Performance API (minimal)
  // ============================================
  
  if (typeof performance === 'undefined') {
    globalObj.performance = {
      now: function() {
        return Date.now();
      },
      mark: function() {},
      measure: function() {},
      getEntries: function() { return []; },
      getEntriesByName: function() { return []; },
      getEntriesByType: function() { return []; },
      clearMarks: function() {},
      clearMeasures: function() {}
    };
  }
  
  // ============================================
  // QueueMicrotask polyfill
  // ============================================
  
  if (typeof queueMicrotask === 'undefined') {
    globalObj.queueMicrotask = function(callback) {
      Promise.resolve().then(callback);
    };
  }
  
  console.log('Elyxion runtime initialized');
  
})();
