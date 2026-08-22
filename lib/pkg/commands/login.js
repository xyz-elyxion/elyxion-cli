// Elyxion Package Manager - Login Command
'use strict';

const readline = require('readline');
const { Registry } = require('../utils/registry');

async function login(args) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  try {
    console.log('\n\x1b[36mGitHub Authentication\x1b[0m\n');
    console.log('To publish packages, you need a GitHub personal access token.');
    console.log('Create one at: https://github.com/settings/tokens\n');
    console.log('Required scopes: \x1b[33mrepo\x1b[0m (Full control of private repositories)\n');

    const token = await question('GitHub token: ');

    if (!token.trim()) {
      console.error('\n\x1b[31mError:\x1b[0m Token is required');
      rl.close();
      process.exit(1);
    }

    // Validate token
    console.log('\n\x1b[36mValidating token...\x1b[0m');

    const https = require('https');
    
    const validatePromise = new Promise((resolve, reject) => {
      https.get('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'Elyxion-Package-Manager/1.0.0'
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error('Invalid token'));
          }
        });
      }).on('error', reject);
    });

    const user = await validatePromise;
    
    // Save token
    Registry.setToken(token);
    
    console.log('\n\x1b[32m✓\x1b[0m Logged in as \x1b[1m' + user.login + '\x1b[0m\n');
    
    rl.close();
  } catch (err) {
    rl.close();
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

module.exports = { login };
