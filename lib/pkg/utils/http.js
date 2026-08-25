// Elyxion Package Manager - HTTP client
// ----------------------------------------
// The runtime has server-side TCP but no outbound TLS client yet, so the
// CLI shells out to `curl` (available on macOS, Linux, and Windows 10+)
// for all registry traffic. Returns { statusCode, body } and never throws
// on HTTP error codes — callers inspect statusCode.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const IS_WIN = process.platform === 'win32';

// Wrap an argument in single quotes so shell metacharacters are safe
function shellQuote(arg) {
  return "'" + String(arg).replace(/'/g, "'\\''") + "'";
}

function runCurl(cmd) {
  let out;
  try {
    out = execSync(cmd).toString('utf-8');
  } catch (err) {
    throw new Error('Failed to run curl: ' + (err && err.message ? err.message : 'unknown error'));
  }

  // We append -w '\n%{http_code}'; the status code is the last line.
  const idx = out.lastIndexOf('\n');
  const statusLine = idx === -1 ? out : out.substring(idx + 1);
  const body = idx === -1 ? '' : out.substring(0, idx);
  const statusCode = parseInt(statusLine.trim(), 10) || 0;

  return { statusCode, body };
}

// Perform an HTTP request.
//   request(method, url, { headers, body, timeout })
// Returns { statusCode, body }.
function request(method, url, options = {}) {
  const headers = options.headers || {};
  const body = options.body; // string | undefined
  const timeoutSec = Math.max(1, Math.ceil((options.timeout || 30000) / 1000));

  const parts = ['curl', '-sS', '--max-time', String(timeoutSec), '-X', method];
  for (const [k, v] of Object.entries(headers)) {
    parts.push('-H', shellQuote(k + ': ' + v));
  }

  let tmp = null;
  if (body !== undefined && body !== null) {
    // Write the body to a temp file to avoid shell-quoting issues
    tmp = path.join(os.tmpdir(), 'elyx-body-' + Math.random().toString(36).slice(2) + '.txt');
    fs.writeFileSync(tmp, String(body), 'utf-8');
    parts.push('--data-binary', '@' + tmp);
  }

  parts.push('-w', shellQuote('\n%{http_code}'));
  parts.push(shellQuote(url));

  // Best-effort cleanup of the temp body file (POSIX ';', cmd '&')
  if (tmp) {
    parts.push(IS_WIN ? '&' : ';');
    parts.push(IS_WIN ? 'del /F /Q ' + shellQuote(tmp) + ' 2>nul' : 'rm -f ' + shellQuote(tmp));
  }

  return runCurl(parts.join(' '));
}

function parseJSON(res) {
  let data = null;
  if (res.body) {
    try {
      data = JSON.parse(res.body);
    } catch (_) {
      data = null;
    }
  }
  return { statusCode: res.statusCode, data, body: res.body };
}

function getJSON(url, headers) {
  return parseJSON(request('GET', url, { headers }));
}

function postJSON(url, payload, headers) {
  const allHeaders = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
  return parseJSON(request('POST', url, { headers: allHeaders, body: JSON.stringify(payload) }));
}

function del(url, headers) {
  return parseJSON(request('DELETE', url, { headers }));
}

module.exports = { request, getJSON, postJSON, del, shellQuote };
