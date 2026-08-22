// Elyxion buffer module
'use strict';

// ============================================
// Buffer class (enhanced)
// ============================================

// Re-export the core Buffer from bootstrap
const coreBuffer = global.Buffer || class Buffer {
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
    const buf = new coreBuffer(size);
    buf.fill(fill);
    return buf;
  }
  
  static allocUnsafe(size) {
    return new coreBuffer(size);
  }
  
  static from(data, encodingOrOffset, length) {
    return new coreBuffer(data, encodingOrOffset, length);
  }
  
  static concat(list, totalLength) {
    if (!Array.isArray(list)) {
      throw new TypeError('list must be an Array of Buffers');
    }
    
    if (list.length === 0) {
      return coreBuffer.alloc(0);
    }
    
    if (totalLength === undefined) {
      totalLength = list.reduce((acc, buf) => acc + buf.length, 0);
    }
    
    const result = coreBuffer.allocUnsafe(totalLength);
    let offset = 0;
    
    for (const buf of list) {
      buf.copy(result, offset);
      offset += buf.length;
    }
    
    return result;
  }
  
  static isBuffer(obj) {
    return obj instanceof coreBuffer;
  }
  
  static isEncoding(encoding) {
    return ['utf8', 'utf-8', 'ascii', 'utf16le', 'ucs2', 'base64', 'latin1', 'binary', 'hex'].includes(encoding);
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
    return coreBuffer.from(this._data.buffer.slice(start, end));
  }
  
  subarray(start = 0, end = this.length) {
    return coreBuffer.from(this._data.buffer.slice(start, end));
  }
  
  equals(other) {
    if (!coreBuffer.isBuffer(other)) {
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
    if (!coreBuffer.isBuffer(other)) {
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
  
  * [Symbol.iterator]() {
    yield* this._data;
  }
  
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') {
      return this.length;
    }
    return this.toString();
  }
  
  // Methods for each encoding
  readUInt8(offset) { return this._data[offset]; }
  readUInt16LE(offset) { return this._data[offset] | (this._data[offset + 1] << 8); }
  readUInt16BE(offset) { return (this._data[offset] << 8) | this._data[offset + 1]; }
  readUInt32LE(offset) { 
    return this._data[offset] | (this._data[offset + 1] << 8) | 
           (this._data[offset + 2] << 16) | (this._data[offset + 3] << 24); 
  }
  readUInt32BE(offset) { 
    return (this._data[offset] << 24) | (this._data[offset + 1] << 16) | 
           (this._data[offset + 2] << 8) | this._data[offset + 3]; 
  }
  readInt8(offset) { return this._data[offset] | (this._data[offset] > 127 ? -256 : 0); }
  readInt16LE(offset) { 
    const value = this._data[offset] | (this._data[offset + 1] << 8); 
    return value > 32767 ? value - 65536 : value; 
  }
  readInt16BE(offset) { 
    const value = (this._data[offset] << 8) | this._data[offset + 1]; 
    return value > 32767 ? value - 65536 : value; 
  }
  readInt32LE(offset) { 
    return this._data[offset] | (this._data[offset + 1] << 8) | 
           (this._data[offset + 2] << 16) | (this._data[offset + 3] << 24); 
  }
  readInt32BE(offset) { 
    return (this._data[offset] << 24) | (this._data[offset + 1] << 16) | 
           (this._data[offset + 2] << 8) | this._data[offset + 3]; 
  }
  readFloatLE(offset) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint8(0, this._data[offset]);
    view.setUint8(1, this._data[offset + 1]);
    view.setUint8(2, this._data[offset + 2]);
    view.setUint8(3, this._data[offset + 3]);
    return view.getFloat32(0, true);
  }
  readFloatBE(offset) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint8(0, this._data[offset]);
    view.setUint8(1, this._data[offset + 1]);
    view.setUint8(2, this._data[offset + 2]);
    view.setUint8(3, this._data[offset + 3]);
    return view.getFloat32(0, false);
  }
  readDoubleLE(offset) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    for (let i = 0; i < 8; i++) {
      view.setUint8(i, this._data[offset + i]);
    }
    return view.getFloat64(0, true);
  }
  readDoubleBE(offset) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    for (let i = 0; i < 8; i++) {
      view.setUint8(i, this._data[offset + i]);
    }
    return view.getFloat64(0, false);
  }
  
  writeUInt8(value, offset) { this._data[offset] = value; return offset + 1; }
  writeUInt16LE(value, offset) { 
    this._data[offset] = value & 0xFF; 
    this._data[offset + 1] = (value >> 8) & 0xFF; 
    return offset + 2; 
  }
  writeUInt16BE(value, offset) { 
    this._data[offset] = (value >> 8) & 0xFF; 
    this._data[offset + 1] = value & 0xFF; 
    return offset + 2; 
  }
  writeUInt32LE(value, offset) { 
    this._data[offset] = value & 0xFF; 
    this._data[offset + 1] = (value >> 8) & 0xFF; 
    this._data[offset + 2] = (value >> 16) & 0xFF; 
    this._data[offset + 3] = (value >> 24) & 0xFF; 
    return offset + 4; 
  }
  writeUInt32BE(value, offset) { 
    this._data[offset] = (value >> 24) & 0xFF; 
    this._data[offset + 1] = (value >> 16) & 0xFF; 
    this._data[offset + 2] = (value >> 8) & 0xFF; 
    this._data[offset + 3] = value & 0xFF; 
    return offset + 4; 
  }
  writeInt8(value, offset) { 
    this._data[offset] = value < 0 ? 256 + value : value; 
    return offset + 1; 
  }
  writeInt16LE(value, offset) { 
    this._data[offset] = value & 0xFF; 
    this._data[offset + 1] = (value >> 8) & 0xFF; 
    return offset + 2; 
  }
  writeInt16BE(value, offset) { 
    this._data[offset] = (value >> 8) & 0xFF; 
    this._data[offset + 1] = value & 0xFF; 
    return offset + 2; 
  }
  writeInt32LE(value, offset) { 
    this._data[offset] = value & 0xFF; 
    this._data[offset + 1] = (value >> 8) & 0xFF; 
    this._data[offset + 2] = (value >> 16) & 0xFF; 
    this._data[offset + 3] = (value >> 24) & 0xFF; 
    return offset + 4; 
  }
  writeInt32BE(value, offset) { 
    this._data[offset] = (value >> 24) & 0xFF; 
    this._data[offset + 1] = (value >> 16) & 0xFF; 
    this._data[offset + 2] = (value >> 8) & 0xFF; 
    this._data[offset + 3] = value & 0xFF; 
    return offset + 4; 
  }
  writeFloatLE(value, offset) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, true);
    this._data[offset] = view.getUint8(0);
    this._data[offset + 1] = view.getUint8(1);
    this._data[offset + 2] = view.getUint8(2);
    this._data[offset + 3] = view.getUint8(3);
    return offset + 4;
  }
  writeFloatBE(value, offset) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, false);
    this._data[offset] = view.getUint8(0);
    this._data[offset + 1] = view.getUint8(1);
    this._data[offset + 2] = view.getUint8(2);
    this._data[offset + 3] = view.getUint8(3);
    return offset + 4;
  }
  writeDoubleLE(value, offset) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, true);
    for (let i = 0; i < 8; i++) {
      this._data[offset + i] = view.getUint8(i);
    }
    return offset + 8;
  }
  writeDoubleBE(value, offset) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, false);
    for (let i = 0; i < 8; i++) {
      this._data[offset + i] = view.getUint8(i);
    }
    return offset + 8;
  }
  
  indexOf(value, byteOffset, encoding) {
    const search = typeof value === 'string' ? Buffer.from(value, encoding) : value;
    for (let i = byteOffset || 0; i < this.length - search.length + 1; i++) {
      let found = true;
      for (let j = 0; j < search.length; j++) {
        if (this._data[i + j] !== search[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }
  
  lastIndexOf(value, byteOffset, encoding) {
    const search = typeof value === 'string' ? Buffer.from(value, encoding) : value;
    for (let i = (byteOffset || this.length) - search.length; i >= 0; i--) {
      let found = true;
      for (let j = 0; j < search.length; j++) {
        if (this._data[i + j] !== search[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }
  
  includes(value, byteOffset, encoding) {
    return this.indexOf(value, byteOffset, encoding) !== -1;
  }
};

// ============================================
// Buffer constants
// ============================================

const constants = {
  MAX_LENGTH: 2147483647,
  MAX_STRING_LENGTH: 2147483646,
  INSPECT_MAX_BYTES: 50,
  UTF8: 0,
  UTF16LE: 1,
  ASCII: 2,
  HEX: 3,
  BASE64: 4,
  BINARY: 5,
  BASE64URL: 6,
  UCS2: 7
};

// ============================================
// Encoding utilities
// ============================================

const encodings = {
  utf8: 'utf-8',
  utf8utf8: 'utf-8',
  utf8utf8utf8: 'utf-8',
  ascii: 'ascii',
  binary: 'binary',
  latin1: 'latin1',
  base64: 'base64',
  base64url: 'base64url',
  hex: 'hex',
  utf16le: 'utf16le',
  ucs2: 'ucs2',
  'utf-16le': 'utf16le',
  'utf-16': 'utf16le'
};

// ============================================
// SlowBuffer (deprecated)
// ============================================

function SlowBuffer(size) {
  if (typeof size !== 'number') {
    throw new TypeError('size must be a number');
  }
  
  return coreBuffer.allocUnsafe(size);
}

// ============================================
// Buffer module
// ============================================

module.exports = {
  Buffer: coreBuffer,
  SlowBuffer,
  constants,
  encodings,
  INSPECT_MAX_BYTES: constants.INSPECT_MAX_BYTES,
  kMaxLength: constants.MAX_LENGTH,
  kStringMaxLength: constants.MAX_STRING_LENGTH
};

// Also export Buffer directly
module.exports.Buffer = coreBuffer;
