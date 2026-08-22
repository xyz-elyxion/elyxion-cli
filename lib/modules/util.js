// Elyxion util module
'use strict';

const { EventEmitter } = require('events');
const { Buffer } = require('buffer');

// ============================================
// Type checking utilities
// ============================================

function isNull(value) {
  return value === null;
}

function isUndefined(value) {
  return typeof value === 'undefined';
}

function isNullOrUndefined(value) {
  return value === null || typeof value === 'undefined';
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isNumber(value) {
  return typeof value === 'number' && !isNaN(value);
}

function isString(value) {
  return typeof value === 'string';
}

function isSymbol(value) {
  return typeof value === 'symbol';
}

function isFunction(value) {
  return typeof value === 'function';
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value) {
  return Array.isArray(value);
}

function isArrayBuffer(value) {
  return value instanceof ArrayBuffer;
}

function isArrayBufferView(value) {
  return ArrayBuffer.isView(value);
}

function isDate(value) {
  return value instanceof Date && !isNaN(value);
}

function isRegExp(value) {
  return value instanceof RegExp;
}

function isError(value) {
  return value instanceof Error || (value && value.constructor && value.constructor.prototype && value.constructor.prototype.name === 'Error');
}

function isPrimitive(value) {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

function isBuffer(value) {
  return Buffer.isBuffer(value);
}

function isArgumentsObject(value) {
  return Object.prototype.toString.call(value) === '[object Arguments]';
}

function isGeneratorObject(value) {
  return value && typeof value.next === 'function' && typeof value.throw === 'function';
}

function isPromise(value) {
  return value && typeof value.then === 'function';
}

function isAsyncFunction(value) {
  return value && value.constructor && value.constructor.name === 'AsyncFunction';
}

function isWeakMap(value) {
  return value instanceof WeakMap;
}

function isWeakSet(value) {
  return value instanceof WeakSet;
}

function isMap(value) {
  return value instanceof Map;
}

function isSet(value) {
  return value instanceof Set;
}

function isProxy(value) {
  try {
    return value && typeof value === 'object' && value.__proto__ === null;
  } catch (e) {
    return false;
  }
}

function isTypedArray(value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function isDataView(value) {
  return value instanceof DataView;
}

function isExternal(value) {
  return false; // Native external
}

function isModuleNamespaceObject(value) {
  return typeof value === 'object' && value !== null && Symbol.toStringTag in value && value[Symbol.toStringTag] === 'Module';
}

// ============================================
// Formatting utilities
// ============================================

function format(formatStr, ...args) {
  if (typeof formatStr !== 'string') {
    return Array.from(arguments).join(' ');
  }
  
  let result = formatStr;
  let argIndex = 0;
  
  // Handle %s, %d, %j, %o, %O, %%
  result = result.replace(/%[sdjoO%]/g, (match) => {
    if (match === '%%') return '%';
    if (argIndex >= args.length) return match;
    
    const arg = args[argIndex++];
    
    switch (match) {
      case '%s':
        return String(arg);
      case '%d':
        return Number(arg).toString();
      case '%j':
        return JSON.stringify(arg);
      case '%o':
      case '%O':
        return formatValue(arg);
      default:
        return match;
    }
  });
  
  // Append remaining args
  while (argIndex < args.length) {
    result += ' ' + args[argIndex++];
  }
  
  return result;
}

function formatValue(value, recurseTimes = 2) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (typeof value === 'symbol') return value.toString();
  
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  
  if (value instanceof RegExp) {
    return value.toString();
  }
  
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  if (Buffer.isBuffer(value)) {
    return `<Buffer ${value.toString('hex').split('').join(' ')}>`;
  }
  
  if (recurseTimes <= 0) {
    return Array.isArray(value) ? '[Array]' : '[Object]';
  }
  
  const indent = '  '.repeat(3 - recurseTimes);
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(item => 
      formatValue(item, recurseTimes - 1)
    ).join(', ');
    return `[ ${items} ]`;
  }
  
  if (value instanceof Map) {
    if (value.size === 0) return 'Map {}';
    const items = Array.from(value.entries()).map(([k, v]) =>
      `${formatValue(k, recurseTimes - 1)} => ${formatValue(v, recurseTimes - 1)}`
    ).join(', ');
    return `Map { ${items} }`;
  }
  
  if (value instanceof Set) {
    if (value.size === 0) return 'Set {}';
    const items = Array.from(value).map(item =>
      formatValue(item, recurseTimes - 1)
    ).join(', ');
    return `Set { ${items} }`;
  }
  
  if (value instanceof WeakMap) return 'WeakMap {}';
  if (value instanceof WeakSet) return 'WeakSet {}';
  
  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  
  const items = keys.map(key => {
    const val = formatValue(value[key], recurseTimes - 1);
    return `${key}: ${val}`;
  }).join(',\n  ');
  
  return `{\n  ${indent}${items}\n${indent}}`;
}

// ============================================
// Callback utilities
// ============================================

function callbackify(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function');
  }
  
  return function(...args) {
    const callback = args[args.length - 1];
    
    if (typeof callback !== 'function') {
      return fn.apply(this, args).then(
        result => callback(null, result),
        err => callback(err)
      );
    }
    
    return fn.apply(this, args.slice(0, -1)).then(
      result => callback(null, result),
      err => callback(err)
    );
  };
}

function promisify(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function');
  }
  
  return function(...args) {
    return new Promise((resolve, reject) => {
      args.push((err, ...result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result.length <= 1 ? result[0] : result);
        }
      });
      
      try {
        fn.apply(this, args);
      } catch (err) {
        reject(err);
      }
    });
  };
}

// ============================================
// Inheritance utilities
// ============================================

function inherits(ctor, superCtor) {
  if (typeof superCtor !== 'function' && superCtor !== null) {
    throw new TypeError('The super constructor must be a function or null');
  }
  
  ctor.super_ = superCtor;
  
  if (superCtor === null) {
    Object.setPrototypeOf(ctor.prototype, null);
  } else {
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
  }
}

function inheritsLazy(ctor, superCtor) {
  const LazyInitializer = class {
    constructor() {
      if (superCtor.prototype) {
        Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
      } else {
        Object.setPrototypeOf(ctor.prototype, Object.create(superCtor && superCtor.prototype, {
          constructor: { value: ctor, enumerable: false, writable: true, configurable: true }
        }));
      }
    }
  };
  
  ctor.super_ = superCtor;
  
  if (superCtor !== null) {
    Object.setPrototypeOf(ctor, LazyInitializer);
  }
}

// ============================================
// Object utilities
// ============================================

function extend(target, ...sources) {
  for (const source of sources) {
    if (source) {
      Object.assign(target, source);
    }
  }
  return target;
}

function mixin(target, source) {
  for (const key of Object.keys(source)) {
    target[key] = source[key];
  }
  return target;
}

// ============================================
// String utilities
// ============================================

function stripBOM(content) {
  if (typeof content !== 'string') {
    throw new TypeError('Expected a string');
  }
  
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  
  return content;
}

function isDeepStrictEqual(val1, val2) {
  if (val1 === val2) return true;
  
  if (typeof val1 !== 'object' || typeof val2 !== 'object' || val1 === null || val2 === null) {
    return false;
  }
  
  if (val1 instanceof Date && val2 instanceof Date) {
    return val1.getTime() === val2.getTime();
  }
  
  if (val1 instanceof RegExp && val2 instanceof RegExp) {
    return val1.source === val2.source && val1.flags === val2.flags;
  }
  
  if (Buffer.isBuffer(val1) && Buffer.isBuffer(val2)) {
    return val1.equals(val2);
  }
  
  if (ArrayBuffer.isView(val1) && ArrayBuffer.isView(val2)) {
    const a1 = new Uint8Array(val1.buffer, val1.byteOffset, val1.byteLength);
    const a2 = new Uint8Array(val2.buffer, val2.byteOffset, val2.byteLength);
    return isDeepStrictEqual(a1, a2);
  }
  
  if (val1 instanceof Map && val2 instanceof Map) {
    if (val1.size !== val2.size) return false;
    for (const [key, value] of val1) {
      if (!val2.has(key) || !isDeepStrictEqual(value, val2.get(key))) return false;
    }
    return true;
  }
  
  if (val1 instanceof Set && val2 instanceof Set) {
    if (val1.size !== val2.size) return false;
    for (const value of val1) {
      if (!val2.has(value)) return false;
    }
    return true;
  }
  
  if (val1 instanceof Error && val2 instanceof Error) {
    return val1.message === val2.message && val1.name === val2.name;
  }
  
  if (Object.getPrototypeOf(val1) !== Object.getPrototypeOf(val2)) {
    return false;
  }
  
  const keys1 = Object.keys(val1);
  const keys2 = Object.keys(val2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!Object.prototype.hasOwnProperty.call(val2, key)) return false;
    if (!isDeepStrictEqual(val1[key], val2[key])) return false;
  }
  
  return true;
}

// ============================================
// Async utilities
// ============================================

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}

function promisifyMultiArgs(fn) {
  return promisify(fn);
}

function promisifyCustom(fn, symbol = PromiseResolve) {
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function');
  }
  
  const original = fn;
  
  fn[symbol] = function(...args) {
    return new Promise((resolve, reject) => {
      args.push((err, ...result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result.length <= 1 ? result[0] : result);
        }
      });
      
      try {
        original.apply(this, args);
      } catch (err) {
        reject(err);
      }
    });
  };
  
  return fn;
}

// ============================================
// Debug utilities
// ============================================

function debuglog(set) {
  const debug = require('util')._debug || (() => {});
  
  return function debugFn(...args) {
    debug(set, format(...args));
  };
}

// ============================================
// Deprecation utilities
// ============================================

const _deprecated = new Map();

function deprecate(fn, msg, code) {
  if (process.noDeprecation) {
    return fn;
  }
  
  let warned = false;
  
  const deprecated = function(...args) {
    if (!warned) {
      warned = true;
      
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.warn(`DeprecationWarning: ${msg}`);
      }
    }
    
    return fn.apply(this, args);
  };
  
  deprecated._original = fn;
  
  return deprecated;
}

function deprecations() {
  return _deprecated;
}

// ============================================
// Other utilities
// ============================================

function log() {
  console.log(format.apply(null, arguments));
}

function print() {
  console.log(format.apply(null, arguments));
}

function puts() {
  console.log(format.apply(null, arguments));
}

function debug(x) {
  console.error(format(x));
}

function error(x) {
  console.error(format(x));
}

function inherits(constructor, superConstructor) {
  if (typeof superConstructor !== 'function' && superConstructor !== null) {
    throw new TypeError('The super constructor must be a function or null');
  }
  
  constructor.super_ = superConstructor;
  
  if (superConstructor === null) {
    Object.setPrototypeOf(constructor.prototype, null);
  } else {
    Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
  }
}

function inspect(obj, options = {}) {
  return formatValue(obj, options.depth || 3);
}

function isatty(fd) {
  return false; // Not a TTY in most cases
}

function pump(readable, writable, callback) {
  if (typeof callback !== 'function') {
    callback = () => {};
  }
  
  let error = null;
  
  readable.on('error', (err) => {
    error = err;
  });
  
  readable.on('end', () => {
    if (writable && typeof writable.end === 'function') {
      writable.end(callback);
    } else {
      callback(error);
    }
  });
  
  if (writable && typeof writable.write === 'function') {
    readable.on('data', (chunk) => {
      writable.write(chunk);
    });
  }
  
  return readable;
}

function callbackify(fn) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      fn.apply(this, args).then(resolve, reject);
    });
  };
}

function promisify(fn) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      args.push((err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
      fn.apply(this, args);
    });
  };
}

// ============================================
// Module exports
// ============================================

module.exports = {
  // Type checking
  isNull,
  isUndefined,
  isNullOrUndefined,
  isBoolean,
  isNumber,
  isString,
  isSymbol,
  isFunction,
  isObject,
  isArray,
  isArrayBuffer,
  isArrayBufferView,
  isDate,
  isRegExp,
  isError,
  isPrimitive,
  isBuffer,
  isArgumentsObject,
  isGeneratorObject,
  isPromise,
  isAsyncFunction,
  isWeakMap,
  isWeakSet,
  isMap,
  isSet,
  isProxy,
  isTypedArray,
  isDataView,
  isExternal,
  isModuleNamespaceObject,
  
  // Formatting
  format,
  formatValue,
  inspect,
  
  // Callback utilities
  callbackify,
  promisify,
  
  // Inheritance
  inherits,
  inheritsLazy,
  
  // Object utilities
  extend,
  mixin,
  
  // String utilities
  stripBOM,
  
  // Comparison
  isDeepStrictEqual,
  
  // Async utilities
  isPromiseLike,
  promisifyMultiArgs,
  promisifyCustom,
  
  // Debug
  debuglog,
  
  // Deprecation
  deprecate,
  deprecations,
  
  // Other
  log,
  print,
  puts,
  debug,
  error,
  isatty,
  pump
};
