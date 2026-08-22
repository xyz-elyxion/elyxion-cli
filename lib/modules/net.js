// Elyxion net module
'use strict';

const { EventEmitter } = require('events');
const { Buffer } = require('buffer');
const stream = require('stream');
const util = require('util');

// ============================================
// Socket class
// ============================================

class Socket extends stream.Duplex {
  constructor(options = {}) {
    super(options);
    
    this.readable = true;
    this.writable = true;
    this.allowHalfOpen = options.allowHalfOpen || false;
    this.noDelay = options.noDelay || false;
    this.pending = false;
    this.server = null;
    this._handle = null;
    this._remoteFamily = null;
    this._remoteAddress = null;
    this._remotePort = null;
    this._localAddress = null;
    this._localPort = null;
    this._readableState = null;
    this._writableState = null;
    this.bytesRead = 0;
    this.bytesWritten = 0;
  }
  
  // Connection
  connect(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    
    if (options.host === undefined) {
      options.host = '127.0.0.1';
    }
    if (options.port === undefined) {
      throw new Error('connect requires a port');
    }
    if (options.family === undefined) {
      options.family = 4;
    }
    if (options.localAddress === undefined) {
      options.localAddress = '0.0.0.0';
    }
    if (options.localPort === undefined) {
      options.localPort = 0;
    }
    
    // Store connection info
    this._remoteAddress = options.host;
    this._remotePort = options.port;
    this._remoteFamily = 'IPv' + options.family;
    this._localAddress = options.localAddress;
    this._localPort = options.localPort;
    
    if (callback) {
      this.once('connect', callback);
    }
    
    // Will use native TCP connect
    this.pending = true;
    
    // Simulate connection for now
    process.nextTick(() => {
      this.pending = false;
      this.emit('connect');
    });
    
    return this;
  }
  
  // Address info
  address() {
    return {
      address: this._localAddress || '0.0.0.0',
      family: this._remoteFamily || 'IPv4',
      port: this._localPort || 0
    };
  }
  
  // Write
  write(data, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = 'utf8';
    }
    
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding);
    this.bytesWritten += buf.length;
    
    // Will use native TCP write
    if (callback) {
      process.nextTick(callback);
    }
    
    return true;
  }
  
  // Read
  _read(size) {
    // Will use native TCP read
  }
  
  // Write internal
  _write(chunk, encoding, callback) {
    this.write(chunk, encoding, callback);
  }
  
  // End
  end(data, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = 'utf8';
    }
    
    if (data) {
      this.write(data, encoding);
    }
    
    // Will use native TCP shutdown
    process.nextTick(() => {
      this.emit('finish');
      if (callback) callback();
    });
    
    return this;
  }
  
  // Destroy
  destroy(error) {
    if (this.destroyed) return this;
    
    this.destroyed = true;
    this.readable = false;
    this.writable = false;
    
    // Will use native TCP close
    if (this._handle) {
      this._handle.close();
      this._handle = null;
    }
    
    process.nextTick(() => {
      this.emit('close', error || null);
    });
    
    return this;
  }
  
  // Close
  close(callback) {
    if (callback) {
      this.once('close', callback);
    }
    
    this.end();
    return this;
  }
  
  // Shutdown
  shutdown(callback) {
    // Will use native TCP shutdown
    if (callback) {
      process.nextTick(callback);
    }
    return this;
  }
  
  // Ref/unref
  ref() {
    // Will use native handle ref
    return this;
  }
  
  unref() {
    // Will use native handle unref
    return this;
  }
  
  // Set options
  setNoDelay(noDelay) {
    this.noDelay = noDelay !== false;
    if (this._handle) {
      this._handle.setNoDelay(this.noDelay);
    }
    return this;
  }
  
  setKeepAlive(enable, initialDelay) {
    if (this._handle) {
      this._handle.setKeepAlive(enable, initialDelay || 0);
    }
    return this;
  }
  
  // Getters
  get pending() {
    return this._pending;
  }
  
  set pending(value) {
    this._pending = value;
  }
  
  get connecting() {
    return this.pending;
  }
  
  get bufferSize() {
    return this._readableState ? this._readableState.length : 0;
  }
}

// ============================================
// Server class
// ============================================

class Server extends EventEmitter {
  constructor(options, callback) {
    super();
    
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    
    if (!options) {
      options = {};
    }
    
    this._handle = null;
    this._connections = 0;
    this._children = {};
    this._allowHalfOpen = options.allowHalfOpen || false;
    this._paused = false;
    this._usedStdHandle = false;
    this.maxConnections = options.maxConnections || 0;
    this._listen2 = null;
    
    if (callback) {
      this.on('connection', callback);
    }
  }
  
  // Listen
  listen(...args) {
    let port, host, callback;
    
    if (typeof args[0] === 'object') {
      // listen(options, callback)
      const options = args[0];
      port = options.port;
      host = options.host;
      callback = args[1];
    } else if (typeof args[0] === 'number') {
      // listen(port, callback)
      port = args[0];
      callback = args[1];
    } else if (typeof args[0] === 'function') {
      // listen(callback)
      callback = args[0];
    }
    
    if (host === undefined) {
      host = '0.0.0.0';
    }
    
    if (callback) {
      this.once('listening', callback);
    }
    
    // Will use native TCP listen
    this._port = port;
    this._host = host;
    
    // Simulate listening
    process.nextTick(() => {
      this.emit('listening');
    });
    
    return this;
  }
  
  // Close
  close(callback) {
    if (callback) {
      this.once('close', callback);
    }
    
    // Will use native TCP close
    process.nextTick(() => {
      this._connections = 0;
      this.emit('close');
    });
    
    return this;
  }
  
  // Address
  address() {
    return {
      address: this._host || '0.0.0.0',
      family: 'IPv4',
      port: this._port || 0
    };
  }
  
  // Ref/unref
  ref() {
    return this;
  }
  
  unref() {
    return this;
  }
  
  // Getters
  get connections() {
    return this._connections;
  }
  
  set connections(value) {
    this._connections = value;
    if (this.maxConnections > 0 && this._connections > this.maxConnections) {
      this._connections = this.maxConnections;
    }
  }
  
  get listening() {
    return this._handle !== null;
  }
}

// ============================================
// Connection utilities
// ============================================

function isIP(input) {
  if (!input) return 0;
  
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^[0-9a-fA-F:]+$/;
  
  if (ipv4Regex.test(input)) {
    const parts = input.split('.');
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (num < 0 || num > 255) return 0;
    }
    return 4;
  }
  
  if (ipv6Regex.test(input)) {
    // Simple IPv6 validation
    const parts = input.split(':');
    if (parts.length === 8) {
      return 6;
    }
    // Handle :: notation
    if (input.includes('::')) {
      return 6;
    }
  }
  
  return 0;
}

function isIPv4(input) {
  return isIP(input) === 4;
}

function isIPv6(input) {
  return isIP(input) === 6;
}

// ============================================
// net module
// ============================================

module.exports = {
  // Classes
  Socket,
  Server,
  
  // Connection utilities
  isIP,
  isIPv4,
  isIPv6,
  
  // Create server helper
  createServer(options, callback) {
    return new Server(options, callback);
  },
  
  // Connect helper
  createConnection(options, callback) {
    const socket = new Socket();
    if (callback) {
      socket.on('connect', callback);
    }
    socket.connect(options);
    return socket;
  },
  
  // Legacy API
  connect: function(options, callback) {
    return this.createConnection(options, callback);
  }
};
