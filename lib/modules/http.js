// Elyxion http module
'use strict';

const { EventEmitter } = require('events');
const { Buffer } = require('buffer');
const net = require('net');
const stream = require('stream');

// ============================================
// Agent class
// ============================================

class Agent extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.maxSockets = options.maxSockets || Infinity;
    this.maxFreeSockets = options.maxFreeSockets || 256;
    this.sockets = {};
    this.freeSockets = {};
    this.keepAlive = options.keepAlive || false;
    this.keepAliveMsecs = options.keepAliveMsecs || 1000;
    this.maxCachedSessions = options.maxCachedSessions || 100;
    this._sessions = {};
  }
  
  createConnection(options, callback) {
    const socket = net.createConnection(options, callback);
    return socket;
  }
  
  keepSocketAlive(socket) {
    // Will be implemented
  }
  
  reuseSocket(socket, req) {
    // Will be implemented
  }
  
  destroy() {
    // Will be implemented
  }
}

// ============================================
// ClientRequest class
// ============================================

class ClientRequest extends stream.Writable {
  constructor(options, callback) {
    super();
    
    if (typeof options === 'string') {
      options = new URL(options);
    }
    
    this.method = options.method || options.Method || 'GET';
    this.path = options.path || options.Path || '/';
    this.host = options.hostname || options.host || 'localhost';
    this.port = options.port || options.Port || 80;
    this.headers = options.headers || {};
    this.agent = options.agent;
    this.timeout = options.timeout || 0;
    this.protocol = options.protocol || 'http:';
    this.protocolVersion = options.protocolVersion || '1.1';
    this._headers = {};
    this._headerNames = {};
    this._response = null;
    this._ended = false;
    this._req = null;
    
    // Handle body
    if (options.body) {
      this.write(options.body);
    }
    
    // Handle callback
    if (callback) {
      this.on('response', callback);
    }
    
    // Start the request
    process.nextTick(() => this._connect());
  }
  
  _connect() {
    // Will use native HTTP
    this._req = net.createConnection({
      host: this.host,
      port: this.port
    });
    
    this._req.on('connect', () => {
      // Send request
      const headers = this._buildHeaders();
      const request = `${this.method} ${this.path} HTTP/${this.protocolVersion}\r\n${headers}\r\n`;
      this._req.write(request);
    });
    
    this._req.on('data', (data) => {
      // Parse response
      this._parseResponse(data);
    });
    
    this._req.on('end', () => {
      this._ended = true;
      if (this._response) {
        this._response.push(null);
      }
    });
    
    this._req.on('error', (err) => {
      this.emit('error', err);
    });
  }
  
  _buildHeaders() {
    let headers = '';
    headers += `Host: ${this.host}:${this.port}\r\n`;
    
    for (const [key, value] of Object.entries(this.headers)) {
      headers += `${key}: ${value}\r\n`;
    }
    
    return headers;
  }
  
  _parseResponse(data) {
    const response = data.toString();
    const lines = response.split('\r\n');
    
    // Parse status line
    const statusLine = lines[0];
    const match = statusLine.match(/HTTP\/[\d.]+ (\d+)/);
    if (!match) return;
    
    const statusCode = parseInt(match[1], 10);
    const statusMessage = statusLine.substring(statusLine.indexOf(' ') + 1);
    
    // Parse headers
    const headers = {};
    let i = 1;
    for (; i < lines.length; i++) {
      if (lines[i] === '') break;
      const [key, ...value] = lines[i].split(':');
      headers[key.trim()] = value.join(':').trim();
    }
    
    // Create response
    const responseObj = new IncomingMessage();
    responseObj.statusCode = statusCode;
    responseObj.statusMessage = statusMessage;
    responseObj.headers = headers;
    responseObj.socket = this._req;
    responseObj.httpVersionMajor = 1;
    responseObj.httpVersionMinor = 1;
    responseObj.httpVersion = '1.1';
    responseObj.complete = false;
    
    this._response = responseObj;
    this.emit('response', responseObj);
    
    // Emit body
    const body = lines.slice(i + 1).join('\r\n');
    if (body) {
      responseObj.push(Buffer.from(body));
    }
    responseObj.push(null);
  }
  
  _write(chunk, encoding, callback) {
    if (this._req) {
      this._req.write(chunk, encoding, callback);
    } else {
      callback();
    }
  }
  
  end(data, encoding, callback) {
    if (data) {
      this.write(data, encoding);
    }
    
    if (this._req) {
      this._req.end(callback);
    } else if (callback) {
      process.nextTick(callback);
    }
    
    return this;
  }
  
  abort() {
    if (this._req) {
      this._req.destroy();
    }
  }
  
  setTimeout(ms, callback) {
    this.timeout = ms;
    if (this._req) {
      this._req.setTimeout(ms, callback);
    }
    return this;
  }
  
  setHeader(name, value) {
    this._headers[name.toLowerCase()] = value;
    this.headers[name] = value;
    return this;
  }
  
  getHeader(name) {
    return this._headers[name.toLowerCase()];
  }
  
  removeHeader(name) {
    delete this._headers[name.toLowerCase()];
    delete this.headers[name];
    return this;
  }
  
  addTrailers(headers) {
    // Will be implemented
  }
}

// ============================================
// IncomingMessage class
// ============================================

class IncomingMessage extends stream.Readable {
  constructor(socket) {
    super();
    
    this.socket = socket;
    this.headers = {};
    this.trailers = {};
    this.rawHeaders = [];
    this.rawTrailers = [];
    this.statusCode = 200;
    this.statusMessage = 'OK';
    this.httpVersion = '1.1';
    this.httpVersionMajor = 1;
    this.httpVersionMinor = 1;
    this.complete = false;
    this.aborted = false;
    this.url = '';
    this.method = null;
    this._readableState = null;
  }
  
  _read(size) {
    // Will use native read
  }
  
  setTimeout(ms, callback) {
    if (this.socket) {
      this.socket.setTimeout(ms, callback);
    }
    return this;
  }
  
  destroy(error) {
    if (this.destroyed) return;
    
    this.destroyed = true;
    this.aborted = true;
    
    if (this.socket) {
      this.socket.destroy(error);
    }
    
    this.emit('error', error);
    this.emit('aborted');
  }
}

// ============================================
// ServerResponse class
// ============================================

class ServerResponse extends stream.Writable {
  constructor(req) {
    super();
    
    this.req = req;
    this.statusCode = 200;
    this.statusMessage = 'OK';
    this._headers = {};
    this._headerNames = {};
    this._headerSent = false;
    this._sendDate = true;
    this._chunkedEncoding = false;
    this._contentLength = null;
    this._hasBody = true;
    this._finished = false;
    this._flushHeaders = false;
    this._body = '';
    this.writable = true;
  }
  
  // Status and headers
  writeHead(statusCode, statusMessage, headers) {
    if (typeof statusMessage === 'object' && !headers) {
      headers = statusMessage;
      statusMessage = undefined;
    }
    
    this.statusCode = statusCode;
    if (statusMessage) {
      this.statusMessage = statusMessage;
    }
    
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        this.setHeader(key, value);
      }
    }
    
    return this;
  }
  
  setHeader(name, value) {
    this._headers[name.toLowerCase()] = value;
    return this;
  }
  
  getHeader(name) {
    return this._headers[name.toLowerCase()];
  }
  
  removeHeader(name) {
    delete this._headers[name.toLowerCase()];
    return this;
  }
  
  hasHeader(name) {
    return this._headers.hasOwnProperty(name.toLowerCase());
  }
  
  getHeaderNames() {
    return Object.keys(this._headers);
  }
  
  getHeaders() {
    return { ...this._headers };
  }
  
  // Writing
  write(data, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = 'utf8';
    }
    
    if (!this._headerSent) {
      this._sendHeaders();
    }
    
    this._body += data;
    
    if (callback) {
      process.nextTick(callback);
    }
    
    return true;
  }
  
  end(data, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = 'utf8';
    }
    
    if (data) {
      this.write(data, encoding);
    }
    
    if (!this._headerSent) {
      this._sendHeaders();
    }
    
    this._finished = true;
    
    // Will use native response end
    if (callback) {
      process.nextTick(callback);
    }
    
    this.emit('finish');
    
    return this;
  }
  
  _sendHeaders() {
    // Build response
    let response = `HTTP/1.1 ${this.statusCode} ${this.statusMessage}\r\n`;
    
    // Add default headers
    if (!this._headers['content-type']) {
      this.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    
    if (!this._headers['connection']) {
      this.setHeader('Connection', 'close');
    }
    
    // Send headers
    for (const [name, value] of Object.entries(this._headers)) {
      response += `${name}: ${value}\r\n`;
    }
    
    response += '\r\n';
    
    // Will use native socket write
    this._headerSent = true;
  }
  
  // Status
  setStatus(code) {
    this.statusCode = code;
    return this;
  }
  
  // Redirect
  redirect(url) {
    this.writeHead(302, { 'Location': url });
    this.end();
  }
  
  // Template support
  render(view, data) {
    // Simple template rendering
    let content = view;
    
    if (typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    }
    
    this.setHeader('Content-Type', 'text/html');
    this.end(content);
  }
  
  // JSON
  json(data) {
    this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(data));
  }
  
  // Send file
  sendFile(filePath) {
    const fs = require('fs');
    const path = require('path');
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        this.statusCode = 404;
        this.end('File not found');
        return;
      }
      
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
      };
      
      this.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
      this.end(data);
    });
  }
}

// ============================================
// Server class
// ============================================

class Server extends net.Server {
  constructor(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    
    super(options, (socket) => {
      this._handleConnection(socket);
    });
    
    this._allowHalfOpen = options.allowHalfOpen || false;
    this._connections = 0;
    
    if (callback) {
      this.on('request', callback);
    }
  }
  
  _handleConnection(socket) {
    let currentData = '';
    let headersComplete = false;
    let request = null;
    let response = null;
    
    socket.on('data', (data) => {
      currentData += data.toString();
      
      if (!headersComplete) {
        const headerEnd = currentData.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        
        headersComplete = true;
        const headerSection = currentData.substring(0, headerEnd);
        const bodyStart = currentData.substring(headerEnd + 4);
        
        // Parse request
        request = this._parseRequest(headerSection);
        response = new ServerResponse(request);
        
        // Emit request event
        this.emit('request', request, response);
        
        // Handle body
        if (bodyStart) {
          request.push(Buffer.from(bodyStart));
        }
      }
    });
    
    socket.on('end', () => {
      if (request) {
        request.complete = true;
        request.push(null);
      }
      
      if (!this._allowHalfOpen) {
        socket.end();
      }
    });
    
    socket.on('error', (err) => {
      if (request) {
        request.emit('error', err);
      }
    });
  }
  
  _parseRequest(headerSection) {
    const lines = headerSection.split('\r\n');
    const [method, path, httpVersion] = lines[0].split(' ');
    
    const request = new IncomingMessage();
    request.method = method;
    request.url = path;
    request.httpVersion = httpVersion.split('/')[1];
    
    // Parse headers
    for (let i = 1; i < lines.length; i++) {
      const [key, ...value] = lines[i].split(':');
      request.headers[key.trim().toLowerCase()] = value.join(':').trim();
    }
    
    return request;
  }
}

// ============================================
// Global agent
// ============================================

const globalAgent = new Agent();

// ============================================
// HTTP methods
// ============================================

function request(options, callback) {
  if (typeof options === 'string') {
    options = new URL(options);
  }
  
  if (!options.agent) {
    options.agent = globalAgent;
  }
  
  return new ClientRequest(options, callback);
}

function get(options, callback) {
  if (typeof options === 'string') {
    options = new URL(options);
  }
  
  options.method = 'GET';
  
  const req = request(options, callback);
  req.end();
  
  return req;
}

// ============================================
// Server creation
// ============================================

function createServer(options, callback) {
  return new Server(options, callback);
}

// ============================================
// http module
// ============================================

module.exports = {
  // Classes
  Agent,
  ClientRequest,
  IncomingMessage,
  ServerResponse,
  Server,
  
  // Methods
  request,
  get,
  createServer,
  
  // Global agent
  globalAgent
};
