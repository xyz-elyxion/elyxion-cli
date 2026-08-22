// Elyxion path module
'use strict';

const platform = process.platform || 'linux';
const isWindows = platform === 'win32';

// ============================================
// Path utilities
// ============================================

function normalizeString(path, allowAboveRoot) {
  let res = '';
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code;
  
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) {
      code = path.charCodeAt(i);
    } else if (code === 47 /* / */ || code === 92 /* \ */) {
      if (i === lastSlash + 1) {
        dots++;
      } else if (dots !== 0) {
        if (lastSlash !== -1 && lastSlash + 1 !== i) {
          if (lastSlash + 2 === i || dots > 2) {
            // too many dots
            if (res.length > 0) {
              res = res.substring(0, lastSegmentLength);
            }
            lastSlash = i;
            lastSegmentLength = res.length + 1;
          } else {
            res = res.substring(0, res.length - lastSegmentLength - 1);
            lastSlash = i;
            lastSegmentLength = res.length + 1;
          }
        }
        dots = 0;
      }
      res += (i < path.length ? path.charAt(i) : '/');
      lastSegmentLength = res.length;
      lastSlash = i;
      continue;
    } else if (code === 46 /* . */ && i > 0) {
      dots++;
    } else {
      dots = 0;
    }
    res += (i < path.length ? path.charAt(i) : '/');
  }
  
  if (res === '') {
    res = '.';
  }
  
  return res;
}

function normalize(path) {
  const isPathAbsolute = isAbsolute(path);
  let trailingSlash = path && path.charCodeAt(path.length - 1) === 47 /* / */;
  
  // Normalize the path
  path = normalizeString(path, !isPathAbsolute);
  
  if (path.length === 0 && !isPathAbsolute) {
    path = '.';
  }
  
  if (path.length > 0 && trailingSlash) {
    path += '/';
  }
  
  if (isWindows) {
    path = path.replace(/\//g, '\\');
  }
  
  return path;
}

function resolve(...args) {
  let resolvedPath = '';
  let resolvedAbsolute = false;
  
  for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    const path = i >= 0 ? args[i] : process.cwd();
    
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    }
    
    if (!path) {
      continue;
    }
    
    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charCodeAt(0) === 47 /* / */;
  }
  
  // At this point all the characters have been processed, but the
  // final `.` hasn't been processed yet. So we normalize it.
  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute);
  
  if (resolvedAbsolute) {
    return (isWindows ? '\\\\' : '/') + resolvedPath;
  }
  
  return resolvedPath && normalize(resolvedPath);
}

function join(...args) {
  const joined = args.join('/');
  const normalized = normalize(joined);
  return normalized;
}

function isAbsolute(path) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string');
  }
  
  if (isWindows) {
    return path.length > 1 && path.charCodeAt(1) === 58 /* : */;
  }
  
  return path.length > 0 && path.charCodeAt(0) === 47 /* / */;
}

function relative(from, to) {
  from = resolve(from);
  to = resolve(to);
  
  // Trim leading slashes from both paths
  if (from === to) return '';
  
  from = from.substring(1);
  to = to.substring(1);
  
  const fromParts = from.split('/');
  const toParts = to.split('/');
  
  const length = Math.min(fromParts.length, toParts.length);
  let samePartsLength = length;
  
  for (let i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }
  
  const outputParts = [];
  
  // Generate the relative path
  for (let i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }
  
  // Add remaining parts of toPath
  outputParts.push(...toParts.slice(samePartsLength));
  
  return normalize(outputParts.join('/'));
}

function dirname(path) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string');
  }
  
  if (path.length === 0) {
    return '.';
  }
  
  const hasRoot = isWindows ? path.charCodeAt(0) === 92 /* \ */ : path.charCodeAt(0) === 47 /* / */;
  let end = -1;
  let matchedSlash = true;
  
  for (let i = path.length - 1; i >= 1; --i) {
    if (path.charCodeAt(i) === 47 /* / */) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      // We saw the first non-backslash
      matchedSlash = false;
    }
  }
  
  if (end === -1) {
    return hasRoot ? '/' : '.';
  }
  
  if (hasRoot && end === 1) {
    return '//';
  }
  
  return path.substring(0, end);
}

function basename(path, ext) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string');
  }
  
  let start = 0;
  let end = -1;
  let matchedSlash = true;
  
  // Check for a drive letter on Windows
  if (isWindows && path.length >= 2) {
    const driveLetter = path.charCodeAt(0);
    if (driveLetter >= 65 && driveLetter <= 90 /* A-Z */ && path.charCodeAt(1) === 58 /* : */) {
      start = 2;
    }
  }
  
  for (let i = path.length - 1; i >= start; --i) {
    if (path.charCodeAt(i) === 47 /* / */ || path.charCodeAt(i) === 92 /* \ */) {
      if (!matchedSlash) {
        start = i + 1;
        break;
      }
    } else if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
  }
  
  if (end === -1) return '';
  
  let name = path.substring(start, end);
  
  if (ext && name.endsWith(ext)) {
    name = name.substring(0, name.length - ext.length);
  }
  
  return name;
}

function extname(path) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string');
  }
  
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  
  // Check for a drive letter on Windows
  if (isWindows && path.length >= 2) {
    const driveLetter = path.charCodeAt(0);
    if (driveLetter >= 65 && driveLetter <= 90 /* A-Z */ && path.charCodeAt(1) === 58 /* : */) {
      startPart = 2;
    }
  }
  
  for (let i = path.length - 1; i >= startPart; --i) {
    if (path.charCodeAt(i) === 47 /* / */ || path.charCodeAt(i) === 92 /* \ */) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
    } else if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    } else if (path.charCodeAt(i) === 46 /* . */) {
      if (startDot !== -1) {
        break;
      }
      startDot = i;
    } else if (startDot !== -1) {
      end = -1;
      break;
    }
  }
  
  if (startDot === -1 || end === -1) {
    return '';
  }
  
  return path.substring(startDot, end);
}

function format(pathObject) {
  if (typeof pathObject !== 'object' || pathObject === null) {
    throw new TypeError('path must be an object');
  }
  
  const dir = pathObject.dir || pathObject.root || '';
  const base = pathObject.base || '';
  const ext = pathObject.ext || '';
  const name = pathObject.name || '';
  
  let result = '';
  
  if (dir) {
    result += dir;
    if (dir.charCodeAt(dir.length - 1) !== 47 /* / */ && 
        dir.charCodeAt(dir.length - 1) !== 92 /* \ */) {
      result += isWindows ? '\\' : '/';
    }
  }
  
  if (base) {
    result += base;
  } else if (name) {
    result += name;
    if (ext) {
      result += ext;
    }
  }
  
  return result;
}

function parse(path) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string');
  }
  
  const result = {
    root: '',
    dir: '',
    base: '',
    ext: '',
    name: ''
  };
  
  if (path.length === 0) {
    return result;
  }
  
  let start = 0;
  
  // Check for drive letter on Windows
  if (isWindows && path.length >= 2) {
    const driveLetter = path.charCodeAt(0);
    if (driveLetter >= 65 && driveLetter <= 90 /* A-Z */ && path.charCodeAt(1) === 58 /* : */) {
      result.root = path.substring(0, 2);
      start = 2;
    }
  }
  
  let lastSlash = -1;
  let lastDot = -1;
  let matchedSlash = true;
  
  for (let i = path.length - 1; i >= start; --i) {
    if (path.charCodeAt(i) === 47 /* / */ || path.charCodeAt(i) === 92 /* \ */) {
      if (!matchedSlash) {
        lastSlash = i;
        break;
      }
    } else if (path.charCodeAt(i) === 46 /* . */) {
      if (lastDot === -1) {
        lastDot = i;
      }
      matchedSlash = false;
    } else {
      matchedSlash = false;
    }
  }
  
  if (lastDot !== -1) {
    result.ext = path.substring(lastDot);
    result.name = path.substring(lastSlash + 1, lastDot);
  } else if (lastSlash === -1) {
    result.name = path.substring(start);
  } else {
    result.name = path.substring(lastSlash + 1);
  }
  
  if (lastSlash !== -1) {
    result.dir = path.substring(0, lastSlash);
  } else {
    result.dir = result.root;
  }
  
  result.base = result.name + result.ext;
  
  return result;
}

// ============================================
// Platform-specific sep and delimiter
// ============================================

const sep = isWindows ? '\\' : '/';
const delimiter = isWindows ? ';' : ':';

// ============================================
// path module
// ============================================

const path = {
  normalize,
  resolve,
  join,
  isAbsolute,
  relative,
  dirname,
  basename,
  extname,
  format,
  parse,
  sep,
  delimiter,
  
  // Windows aliases
  win32: {
    normalize,
    resolve,
    join,
    isAbsolute,
    relative,
    dirname,
    basename,
    extname,
    format,
    parse,
    sep: '\\',
    delimiter: ';'
  },
  
  // Posix aliases
  posix: {
    normalize: (p) => normalize(p.replace(/\\/g, '/')),
    resolve,
    join,
    isAbsolute: (p) => p.startsWith('/'),
    relative,
    dirname,
    basename,
    extname,
    format,
    parse,
    sep: '/',
    delimiter: ':'
  }
};

module.exports = path;
