// Elyxion Package Manager - Login Command
'use strict';

const readline = require('readline');
const { Registry } = require('../utils/registry');
const http = require('../utils/http');

async function login(args) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  try {
    const registryUrl = Registry.getRegistryUrl();
    console.log('\n\x1b[36mElyxion Registry Login\x1b[0m\n');
    console.log('  Registry: ' + registryUrl + '\n');

    const username = (await question('Username: ')).trim().toLowerCase();
    const password = await question('Password: ');

    if (!username || !password) {
      console.error('\n\x1b[31mError:\x1b[0m Username and password are required');
      rl.close();
      process.exit(1);
    }

    // Try to log in
    console.log('\n\x1b[36mLogging in...\x1b[0m');
    let res = await http.postJSON(registryUrl + '/api/auth/login', { username, password });

    // If the account doesn't exist, offer to create it
    if (res.statusCode === 401) {
      const answer = (await question('\nAccount not found. Create a new one? [y/N] ')).trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') {
        console.error('\n\x1b[31mError:\x1b[0m Login failed: ' + ((res.data && res.data.error) || 'Invalid credentials'));
        rl.close();
        process.exit(1);
      }

      console.log('\n\x1b[36mCreating account...\x1b[0m');
      res = await http.postJSON(registryUrl + '/api/auth/register', { username, password });
      if (res.statusCode !== 201) {
        console.error('\n\x1b[31mError:\x1b[0m ' + ((res.data && res.data.error) || 'Registration failed'));
        rl.close();
        process.exit(1);
      }
    } else if (res.statusCode !== 200) {
      console.error('\n\x1b[31mError:\x1b[0m ' + ((res.data && res.data.error) || 'Login failed (HTTP ' + res.statusCode + ')'));
      rl.close();
      process.exit(1);
    }

    // Save credentials
    Registry.setToken(res.data.token);
    Registry.setUsername(res.data.username);

    console.log('\n\x1b[32m✓\x1b[0m Logged in as \x1b[1m' + res.data.username + '\x1b[0m\n');
    console.log('  You can now publish packages with \x1b[36melyx publish\x1b[0m');
    console.log('');

    rl.close();
  } catch (err) {
    rl.close();
    console.error('\n\x1b[31mError:\x1b[0m ' + err.message);
    console.log('  Make sure curl is installed and the registry is reachable: ' + Registry.getRegistryUrl());
    process.exit(1);
  }
}

module.exports = { login };
