// Elyxion Package Manager - Logout Command
'use strict';

const { Registry } = require('../utils/registry');
const http = require('../utils/http');

async function logout(args) {
  const token = Registry.getToken();
  const username = Registry.getUsername();

  if (token) {
    // Best-effort server-side token invalidation
    try {
      await http.postJSON(Registry.getRegistryUrl() + '/api/auth/logout', {}, {
        Authorization: 'Bearer ' + token,
      });
    } catch (_) {
      // Ignore network errors — local logout still proceeds
    }
  }

  Registry.logout();
  console.log('\n\x1b[32m✓\x1b[0m Logged out' + (username ? ' as \x1b[1m' + username + '\x1b[0m' : '') + '\n');
}

module.exports = { logout };
