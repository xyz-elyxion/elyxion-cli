// Elyxion url module
'use strict';

// ============================================
// URL class (native implementation)
// ============================================

const nativeURL = globalThis.URL || class URL {
  constructor(url, base) {
    this._url = '';
    this._pathname = '';
    this._search = '';
    this._hash = '';
    this._protocol = '';
    this._host = '';
    this._port = '';
    this._username = '';
    this._password = '';
    this._origin = '';
    this._searchParams = new URLSearchParams();
    
    // Parse URL
    this._parse(url, base);
  }
  
  _parse(url, base) {
    // Simple URL parsing
    if (url.startsWith('//')) {
      url = 'http:' + url;
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // Keep as is
    } else if (base) {
      // Resolve relative URL
      const baseUrl = new URL(base);
      url = baseUrl.origin + '/' + url;
    } else {
      url = 'http://' + url;
    }
    
    // Extract parts
    const match = url.match(/^(https?):\/\/([^/:]+)(:\d+)?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
    
    if (match) {
      this._protocol = match[1] + ':';
      this._host = match[2];
      this._port = match[3] ? match[3].substring(1) : '';
      this._pathname = match[4] || '/';
      this._search = match[5] || '';
      this._hash = match[6] || '';
      this._origin = this._protocol + '//' + this._host + (this._port ? ':' + this._port : '');
    }
  }
  
  get protocol() { return this._protocol; }
  set protocol(value) { this._protocol = value; }
  
  get host() { return this._host + (this._port ? ':' + this._port : ''); }
  set host(value) {
    const [host, port] = value.split(':');
    this._host = host;
    this._port = port || '';
  }
  
  get hostname() { return this._host; }
  set hostname(value) { this._host = value; }
  
  get port() { return this._port; }
  set port(value) { this._port = value; }
  
  get pathname() { return this._pathname; }
  set pathname(value) { this._pathname = value; }
  
  get search() { return this._search; }
  set search(value) {
    this._search = value.startsWith('?') ? value : (value ? '?' + value : '');
  }
  
  get hash() { return this._hash; }
  set hash(value) {
    this._hash = value.startsWith('#') ? value : (value ? '#' + value : '');
  }
  
  get origin() { return this._origin; }
  
  get username() { return this._username; }
  set username(value) { this._username = value; }
  
  get password() { return this._password; }
  set password(value) { this._password = value; }
  
  get searchParams() { return this._searchParams; }
  
  toString() {
    return this._origin + this._pathname + this._search + this._hash;
  }
  
  toJSON() {
    return this.toString();
  }
  
  href() {
    return this.toString();
  }
  
  host() {
    return this.host;
  }
  
  hostname() {
    return this.hostname;
  }
  
  port() {
    return this.port;
  }
  
  pathname() {
    return this.pathname;
  }
  
  search() {
    return this.search;
  }
  
  hash() {
    return this.hash;
  }
  
  origin() {
    return this.origin;
  }
};

// ============================================
// URLSearchParams class
// ============================================

class URLSearchParams {
  constructor(init) {
    this._params = [];
    
    if (init) {
      if (typeof init === 'string') {
        this._parseString(init);
      } else if (Array.isArray(init)) {
        init.forEach(([key, value]) => {
          this.append(key, value);
        });
      } else if (typeof init === 'object') {
        Object.entries(init).forEach(([key, value]) => {
          this.append(key, value);
        });
      }
    }
  }
  
  _parseString(str) {
    str = str.startsWith('?') ? str.substring(1) : str;
    
    if (!str) return;
    
    const pairs = str.split('&');
    pairs.forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) {
        this.append(
          decodeURIComponent(key),
          value ? decodeURIComponent(value.replace(/\+/g, ' ')) : ''
        );
      }
    });
  }
  
  append(name, value) {
    this._params.push([name, String(value)]);
  }
  
  delete(name) {
    this._params = this._params.filter(([key]) => key !== name);
  }
  
  get(name) {
    const entry = this._params.find(([key]) => key === name);
    return entry ? entry[1] : null;
  }
  
  getAll(name) {
    return this._params
      .filter(([key]) => key === name)
      .map(([, value]) => value);
  }
  
  has(name) {
    return this._params.some(([key]) => key === name);
  }
  
  set(name, value) {
    this.delete(name);
    this.append(name, value);
  }
  
  sort() {
    this._params.sort(([a], [b]) => a.localeCompare(b));
  }
  
  entries() {
    return this._params[Symbol.iterator]();
  }
  
  keys() {
    return this._params.map(([key]) => key)[Symbol.iterator]();
  }
  
  values() {
    return this._params.map(([, value]) => value)[Symbol.iterator]();
  }
  
  forEach(callback, thisArg) {
    this._params.forEach(([key, value]) => {
      callback.call(thisArg, value, key, this);
    });
  }
  
  toString() {
    return this._params
      .map(([key, value]) => 
        encodeURIComponent(key) + '=' + encodeURIComponent(value)
      )
      .join('&');
  }
  
  [Symbol.iterator]() {
    return this.entries();
  }
  
  get [Symbol.toStringTag]() {
    return 'URLSearchParams';
  }
}

// ============================================
// URL utilities (legacy API)
// ============================================

function parse(url, parseQueryString, slashesDenoteHost) {
  const result = {
    href: url,
    protocol: '',
    slashes: false,
    auth: '',
    host: '',
    port: '',
    hostname: '',
    hash: '',
    search: '',
    query: null,
    pathname: '',
    path: '',
    pathname: ''
  };
  
  if (!url) return result;
  
  // Protocol
  const protocolMatch = url.match(/^(https?):\/\//i);
  if (protocolMatch) {
    result.protocol = protocolMatch[1];
    result.slashes = true;
    url = url.substring(protocolMatch[0].length);
  }
  
  // Host
  const hostMatch = url.match(/^([^/?#]*)([/?#]?)/);
  if (hostMatch) {
    const hostPart = hostMatch[1];
    const rest = url.substring(hostPart.length);
    
    if (hostPart.includes('@')) {
      const [auth, hostPort] = hostPart.split('@');
      result.auth = auth;
      
      if (hostPort.includes(':')) {
        const [host, port] = hostPort.split(':');
        result.hostname = host;
        result.port = port;
      } else {
        result.hostname = hostPort;
      }
    } else if (hostPart.includes(':')) {
      const [host, port] = hostPart.split(':');
      result.hostname = host;
      result.port = port;
    } else {
      result.hostname = hostPart;
    }
    
    result.host = result.hostname + (result.port ? ':' + result.port : '');
    
    // Parse rest
    const pathMatch = rest.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    if (pathMatch) {
      result.pathname = pathMatch[1] || '/';
      result.search = pathMatch[2] || '';
      result.hash = pathMatch[3] || '';
      result.path = result.pathname + result.search;
      
      if (parseQueryString && result.search) {
        result.query = parseQueryString(result.search.substring(1));
      }
    }
  }
  
  return result;
}

function format(obj) {
  return obj.href || '';
}

function resolve(from, to) {
  const resolved = new URL(to, from);
  return resolved.toString();
}

function decode(string) {
  try {
    return decodeURIComponent(string);
  } catch {
    return string;
  }
}

function encode(string) {
  return encodeURIComponent(string);
}

function escape(str) {
  return encode(str);
}

function unescape(str) {
  return decode(str);
}

function querystring() {
  // Will be implemented
}

function domainToUnicode(domain) {
  // Will be implemented with punycode
  return domain;
}

function domainToASCII(domain) {
  // Will be implemented with punycode
  return domain;
}

function pathToFileURL(filepath) {
  return new URL('file://' + filepath);
}

function fileURLToPath(url) {
  if (typeof url === 'string') {
    url = new URL(url);
  }
  
  if (url.protocol !== 'file:') {
    throw new TypeError('Only file URLs are supported');
  }
  
  return decodeURIComponent(url.pathname);
}

function toIRI(url) {
  return url;
}

function isURLSearchParams(obj) {
  return obj instanceof URLSearchParams;
}

function isURL(obj) {
  return obj instanceof nativeURL;
}

// ============================================
// url module
// ============================================

module.exports = {
  // Classes
  URL: nativeURL,
  URLSearchParams,
  
  // Legacy API
  parse,
  format,
  resolve,
  decode,
  encode,
  escape,
  unescape,
  querystring,
  
  // Domain utilities
  domainToUnicode,
  domainToASCII,
  
  // File URL utilities
  pathToFileURL,
  fileURLToPath,
  
  // Utility methods
  toIRI,
  isURLSearchParams,
  isURL
};
