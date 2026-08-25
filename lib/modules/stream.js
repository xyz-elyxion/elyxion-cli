// Elyxion stream module
'use strict';

const { EventEmitter } = require('events');
const { Buffer } = require('buffer');
const util = require('util');

// ============================================
// Stream base class
// ============================================

class Stream extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.readable = options.readable !== false;
    this.writable = options.writable !== false;
    this.allowHalfOpen = options.allowHalfOpen || false;
    this.destroyed = false;
    this._readableState = null;
    this._writableState = null;
  }
  
  pipe(destination, options = {}) {
    this.on('data', (chunk) => {
      destination.write(chunk);
    });
    
    this.on('end', () => {
      if (!options.end || options.end !== false) {
        destination.end();
      }
    });
    
    this.on('error', (err) => {
      destination.emit('error', err);
    });
    
    return destination;
  }
  
  unpipe(destination) {
    this.removeListener('data', destination.write);
    return this;
  }
  
  wrap(stream) {
    // Will be implemented
    return stream;
  }
  
  read(size) {
    // Will be implemented in Readable
  }
  
  write(chunk, encoding, callback) {
    // Will be implemented in Writable
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = 'utf8';
    }
    
    if (callback) {
      callback();
    }
    
    return true;
  }
  
  end(chunk, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = 'utf8';
    }
    
    if (chunk) {
      this.write(chunk, encoding);
    }
    
    if (callback) {
      callback();
    }
    
    return this;
  }
  
  destroy(error) {
    if (this.destroyed) return this;
    
    this.destroyed = true;
    this.readable = false;
    this.writable = false;
    
    process.nextTick(() => {
      if (error) {
        this.emit('error', error);
      }
      this.emit('close');
    });
    
    return this;
  }
  
  isPaused() {
    return this._readableState && this._readableState.flowing === false;
  }
  
  pause() {
    if (this._readableState) {
      this._readableState.flowing = false;
    }
    return this;
  }
  
  resume() {
    if (this._readableState) {
      this._readableState.flowing = true;
      this._read(0);
    }
    return this;
  }
  
  setEncoding(encoding) {
    if (this._readableState) {
      this._readableState.encoding = encoding;
    }
    return this;
  }
  
  unshift(chunk) {
    // Will be implemented in Readable
  }
  
  push(chunk, encoding) {
    // Will be implemented in Readable
    return false;
  }
}

// ============================================
// Readable class
// ============================================

class Readable extends Stream {
  constructor(options = {}) {
    super(options);
    
    this._readableState = {
      objectMode: options.objectMode || false,
      encoding: options.encoding || null,
      buffer: [],
      length: 0,
      flowing: null,
      endEmitted: false,
      readListening: false,
      errorEmitted: false,
      destroyed: false,
      paused: false,
      resumeScheduled: false,
      highWaterMark: options.highWaterMark || 16384,
      defaultEncoding: options.defaultEncoding || 'utf8',
      awaitDrainWriters: null,
      multiAwaitDrain: false
    };
    
    if (options.encoding) {
      this.setEncoding(options.encoding);
    }
  }
  
  _read(size) {
    // Must be implemented by subclass
  }
  
  read(size) {
    const state = this._readableState;
    
    if (state.destroyed) {
      return null;
    }
    
    if (size === 0 && state.endEmitted) {
      return null;
    }
    
    if (state.objectMode) {
      return state.buffer.shift() || null;
    }
    
    let ret;
    if (size > state.length) {
      ret = null;
      if (state.length > 0) {
        ret = state.buffer.join('');
        state.buffer = [];
        state.length = 0;
      }
    } else {
      ret = state.buffer.shift() || null;
      if (ret) {
        state.length -= ret.length;
      }
    }
    
    if (ret === null && state.length === 0) {
      this._read(0);
    }
    
    return ret;
  }
  
  push(chunk, encoding) {
    const state = this._readableState;
    
    if (chunk === null) {
      state.endEmitted = true;
      this.emit('end');
      return false;
    }
    
    const isObject = typeof chunk === 'object' && chunk !== null;
    
    if (!state.objectMode && isObject && !Buffer.isBuffer(chunk)) {
      const decoder = state.encoding;
      if (decoder) {
        chunk = chunk.toString(decoder);
      } else {
        chunk = chunk.toString();
      }
    }
    
    state.buffer.push(chunk);
    state.length += chunk.length;
    
    if (state.flowing !== false && !state.readListening) {
      this._read(0);
    }
    
    return state.length < state.highWaterMark;
  }
  
  unshift(chunk) {
    return this.push(chunk);
  }
  
  wrap(stream) {
    stream.on('data', (chunk) => {
      this.push(chunk);
    });
    
    stream.on('end', () => {
      this.push(null);
    });
    
    stream.on('error', (err) => {
      this.emit('error', err);
    });
    
    return this;
  }
  
  _destroy(error, callback) {
    callback(error);
  }
  
  destroy(error, callback) {
    if (this._readableState.destroyed) {
      if (callback) {
        callback();
      }
      return this;
    }
    
    this._readableState.destroyed = true;
    
    this._destroy(error || null, (err) => {
      if (err) {
        this.emit('error', err);
      } else {
        this.emit('close');
      }
      
      if (callback) {
        callback(err);
      }
    });
    
    return this;
  }
  
  _read(n) {
    // Default implementation does nothing
  }
  
  _flowReading() {
    const state = this._readableState;
    
    while (state.flowing && state.length < state.highWaterMark) {
      const chunk = this.read();
      if (chunk === null) break;
      
      if (state.flowing) {
        this.emit('data', chunk);
      }
    }
  }
  
  on(event, listener) {
    if (event === 'data') {
      this._readableState.flowing = true;
      this._readableState.readListening = true;
    }
    return super.on(event, listener);
  }
  
  addListener(event, listener) {
    return this.on(event, listener);
  }
  
  removeListener(event, listener) {
    if (event === 'data') {
      this._readableState.flowing = false;
      this._readableState.readListening = false;
    }
    return super.removeListener(event, listener);
  }
}

// ============================================
// Writable class
// ============================================

class Writable extends Stream {
  constructor(options = {}) {
    super(options);
    
    this._writableState = {
      objectMode: options.objectMode || false,
      highWaterMark: options.highWaterMark || 16384,
      finalCalled: false,
      needFinish: false,
      ending: false,
      finished: false,
      destroyed: false,
      decodeStrings: options.decodeStrings !== false,
      defaultEncoding: options.defaultEncoding || 'utf8',
      buffer: [],
      length: 0,
      writing: false,
      corked: 0,
      sync: true,
      bufferProcessing: false,
      writecb: null,
      writelen: 0,
      afterWriteTickInfo: null,
      bufferedIndex: 0,
      allBuffers: true,
      allNoop: true,
      pendingcb: 0,
      prefinished: false,
      errorBuffer: null,
      errorEmitted: false
    };
  }
  
  _write(chunk, encoding, callback) {
    callback(new Error('_write() must be implemented'));
  }
  
  _writev(chunks, callback) {
    callback(new Error('_writev() must be implemented'));
  }
  
  write(chunk, encoding, callback) {
    const state = this._writableState;
    let ret = false;
    
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = state.defaultEncoding;
    }
    
    if (typeof chunk === 'string') {
      if (state.objectMode) {
        const str = chunk;
        chunk = str;
      } else if (state.decodeStrings !== false && encoding !== 'buffer') {
        chunk = Buffer.from(chunk, encoding);
        encoding = 'buffer';
      }
    }
    
    if (state.ending) {
      writeError(this);
    } else if (state.destroyed) {
      writeError(this, new Error('write after end'));
    }
    
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, callback);
    
    return ret;
  }
  
  end(chunk, encoding, callback) {
    const state = this._writableState;
    
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = 'utf8';
    }
    
    if (chunk !== null && chunk !== undefined) {
      this.write(chunk, encoding);
    }
    
    // .finish() already called
    if (state.corked) {
      state.corked = 1;
      this.uncork();
    }
    
    if (!state.ending) {
      finishMaybe(this, state, true);
    }
    
    state.ending = true;
    
    if (callback) {
      this.once('finish', callback);
    }
    
    if (state.finished) {
      process.nextTick(() => this.emit('finish'));
    } else if (state.destroyed) {
      process.nextTick(() => this.emit('close'));
    }
    
    return this;
  }
  
  cork() {
    this._writableState.corked = true;
  }
  
  uncork() {
    const state = this._writableState;
    
    if (state.corked) {
      state.corked--;
      
      if (!state.writing && !state.corked && !state.destroyed && !state.finished) {
        writeOrBuffer(this, state, null, null, () => {});
      }
    }
  }
  
  setDefaultEncoding(encoding) {
    if (typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string');
    }
    
    const enc = encoding.toLowerCase();
    this._writableState.defaultEncoding = enc;
    return this;
  }
  
  _destroy(error, callback) {
    callback(error);
  }
  
  destroy(error, callback) {
    const state = this._writableState;
    
    if (state.destroyed) {
      if (callback) {
        callback();
      }
      return this;
    }
    
    state.destroyed = true;
    
    this._destroy(error || null, (err) => {
      state.finished = true;
      
      if (err) {
        this.emit('error', err);
      } else {
        this.emit('close');
      }
      
      if (callback) {
        callback(err);
      }
    });
    
    return this;
  }
  
  _final(callback) {
    callback();
  }
  
  finish() {
    const state = this._writableState;
    
    if (!state.finished) {
      state.finished = true;
      
      process.nextTick(() => {
        this.emit('finish');
        
        if (state.errorEmitted) {
          this.emit('error', new Error('premature close'));
        }
      });
    }
    
    return this;
  }
  
  get finished() {
    return this._writableState && this._writableState.finished;
  }
}

// ============================================
// Duplex class
// ============================================

class Duplex extends Readable {
  constructor(options = {}) {
    super(options);

    this._writableState = {
      objectMode: options.objectMode || false,
      highWaterMark: options.highWaterMark || 16384,
      finalCalled: false,
      needFinish: false,
      ending: false,
      finished: false,
      destroyed: false,
      decodeStrings: options.decodeStrings !== false,
      defaultEncoding: options.defaultEncoding || 'utf8',
      buffer: [],
      length: 0,
      writing: false,
      corked: 0,
      sync: true,
      bufferProcessing: false,
      onwrite: null,
      writecb: null,
      writelen: 0,
      bufferedRequest: null,
      errorEmitted: false,
      emitClose: options.emitClose !== false,
      autoDestroy: options.autoDestroy !== false
    };

    this.writable = true;
    this.allowHalfOpen = options.allowHalfOpen || false;
  }

  write(chunk, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = 'utf8';
    }
    encoding = encoding || 'utf8';

    if (this._writableState.ending) return false;

    const cb = callback || (() => {});
    if (!this._writableState.writing && !this._writableState.corked) {
      this._write(chunk, encoding, cb);
    } else {
      this._writableState.buffer.push({ chunk, encoding, callback: cb });
      this._writableState.length += (this._writableState.objectMode ? 1 : (chunk.length || 0));
    }

    return this._writableState.length < this._writableState.highWaterMark;
  }

  _write(chunk, encoding, callback) {
    if (callback) callback();
  }

  end(chunk, encoding, callback) {
    if (typeof chunk === 'function') { callback = chunk; chunk = null; encoding = null; }
    if (typeof encoding === 'function') { callback = encoding; encoding = 'utf8'; }

    if (chunk) this.write(chunk, encoding);
    this._writableState.ending = true;
    this._writableState.finished = true;
    if (callback) callback();
    this.emit('finish');
    return this;
  }

  cork() { this._writableState.corked++; }
  uncork() {
    if (this._writableState.corked > 0) {
      this._writableState.corked--;
    }
    if (this._writableState.corked === 0) {
      while (this._writableState.buffer.length > 0) {
        const entry = this._writableState.buffer.shift();
        this._write(entry.chunk, entry.encoding, entry.callback);
      }
    }
  }

  destroy(err) {
    if (this.destroyed) return this;
    this.destroyed = true;
    this._writableState.destroyed = true;
    if (err) this.emit('error', err);
    this.emit('close');
    return this;
  }
}

// ============================================
// Transform class
// ============================================

class Transform extends Readable {
  constructor(options = {}) {
    super(options);
    
    this._writableState = {
      objectMode: options.objectMode || false,
      highWaterMark: options.highWaterMark || 16384,
      finalCalled: false,
      needFinish: false,
      ending: false,
      finished: false,
      destroyed: false,
      decodeStrings: options.decodeStrings !== false,
      defaultEncoding: options.defaultEncoding || 'utf8',
      buffer: [],
      length: 0,
      writing: false,
      corked: 0,
      sync: true,
      bufferProcessing: false,
      writecb: null,
      writelen: 0,
      afterWriteTickInfo: null,
      bufferedIndex: 0,
      allBuffers: true,
      allNoop: true,
      pendingcb: 0,
      prefinished: false,
      errorBuffer: null,
      errorEmitted: false
    };
    
    this._transformState = {
      afterTransform: (err, data) => {
        return afterTransform(this, err, data);
      },
      needTransform: false,
      transforming: false,
      writecb: null,
      writechunk: null,
      writeencoding: null
    };
  }
  
  _transform(chunk, encoding, callback) {
    callback(new Error('_transform() must be implemented'));
  }
  
  _flush(callback) {
    callback();
  }
  
  push(chunk, encoding) {
    this._transformState.needTransform = true;
    return super.push(chunk, encoding);
  }
}

// ============================================
// PassThrough class
// ============================================

class PassThrough extends Transform {
  constructor(options) {
    super(options);
  }
  
  _transform(chunk, encoding, callback) {
    this.push(chunk);
    callback();
  }
}

// ============================================
// Pipeline utility
// ============================================

function pipeline(streams, callback) {
  if (!Array.isArray(streams)) {
    streams = Array.from(arguments);
    callback = streams.pop();
  }
  
  if (typeof callback !== 'function') {
    callback = () => {};
  }
  
  if (streams.length < 2) {
    throw new TypeError('pipeline requires at least 2 streams');
  }
  
  let error;
  let destroy;
  
  for (let i = 0; i < streams.length - 1; i++) {
    const src = streams[i];
    const dst = streams[i + 1];
    
    src.on('error', (err) => {
      error = err;
      callback(err);
    });
    
    src.on('close', () => {
      dst.destroy();
    });
    
    src.pipe(dst);
  }
  
  const last = streams[streams.length - 1];
  
  last.on('error', (err) => {
    error = err;
    callback(err);
  });
  
  last.on('close', () => {
    if (!error) {
      callback(null);
    }
  });
  
  return last;
}

// ============================================
// Stream utilities
// ============================================

function isStream(stream) {
  return stream instanceof Stream;
}

function isReadable(stream) {
  return stream instanceof Readable;
}

function isWritable(stream) {
  return stream instanceof Writable;
}

function isDuplex(stream) {
  return stream instanceof Readable && stream instanceof Writable;
}

function isTransform(stream) {
  return stream instanceof Transform;
}

function isPaused(stream) {
  if (stream instanceof Readable) {
    return stream.isPaused();
  }
  return false;
}

function destroy(stream, error) {
  if (stream instanceof Stream) {
    stream.destroy(error);
  }
}

function finished(stream, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  const state = stream._readableState || stream._writableState;
  
  if (state && state.destroyed) {
    process.nextTick(callback);
    return;
  }
  
  stream.on('error', callback);
  stream.on('close', () => {
    process.nextTick(callback);
  });
}

function addAbortSignal(signal, stream) {
  if (typeof AbortController === 'undefined') {
    return stream;
  }
  
  signal.addEventListener('abort', () => {
    stream.destroy(new Error('The operation was aborted'));
  });
  
  return stream;
}

// ============================================
// stream module
// ============================================

module.exports = {
  // Base class
  Stream,
  
  // Stream types
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  
  // Utilities
  pipeline,
  isStream,
  isReadable,
  isWritable,
  isDuplex,
  isTransform,
  isPaused,
  destroy,
  finished,
  addAbortSignal
};

// ============================================
// Helper functions
// ============================================

function writeOrBuffer(stream, state, chunk, encoding, callback) {
  const len = state.objectMode ? 1 : chunk.length;
  
  state.length += len;
  
  const ret = state.length < state.highWaterMark;
  
  if (!state.needDrain) {
    state.needDrain = !ret;
  }
  
  if (state.writing || state.corked || state.destroyed || state.needFinish) {
    state.buffer.push({ chunk, encoding, callback });
    state.pendingcb++;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, callback);
  }
  
  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, callback) {
  state.writelen = len;
  state.writecb = callback;
  state.writing = true;
  state.sync = true;
  
  if (state.destroyed) {
    state.onwrite(new Error('write after end'));
  } else if (writev) {
    stream._writev(chunk, (err) => {
      state.sync = false;
      state.writing = false;
      state.pendingcb--;
      state.bufferedIndex++;
      
      if (err) {
        state.onwrite(err);
      }
      
      finishMaybe(stream, state, false);
    });
  } else {
    stream._write(chunk, encoding, (err) => {
      state.sync = false;
      state.writing = false;
      
      if (err) {
        state.onwrite(err);
      }
      
      state.pendingcb--;
      finishMaybe(stream, state, false);
    });
  }
  
  state.sync = false;
}

function finishMaybe(stream, state, sync) {
  const need = needFinish(state);
  
  if (need) {
    prefinish(stream, state);
  }
  
  if (need) {
    state.pendingcb--;
    process.nextTick(() => {
      stream.emit('finish');
    });
  }
  
  return need;
}

function needFinish(state) {
  return (state.ending && 
          state.length === 0 && 
          !state.finished && 
          !state.destroyed && 
          !state.errorEmitted &&
          !state.needFinish);
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream._final((err) => {
      if (err) {
        stream.emit('error', err);
      } else {
        state.prefinished = true;
      }
    });
  }
}

function afterTransform(stream, err, data) {
  const state = stream._transformState;
  
  state.transforming = false;
  
  if (err) {
    stream.emit('error', err);
    state.errorEmitted = true;
  }
  
  if (data !== null) {
    stream.push(data);
  }
  
  state.needTransform = false;
}
