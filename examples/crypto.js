// Crypto Example
'use strict';

const crypto = require('crypto');

console.log('Crypto Example');
console.log('==============\n');

// Hash
console.log('1. SHA-256 Hash:');
const hash = crypto.createHash('sha256');
hash.update('Hello, World!');
console.log('   Input: "Hello, World!"');
console.log('   Hash:', hash.digest('hex'));

// HMAC
console.log('\n2. HMAC:');
const hmac = crypto.createHmac('sha256', 'secret-key');
hmac.update('Hello, World!');
console.log('   Input: "Hello, World!"');
console.log('   Key: "secret-key"');
console.log('   HMAC:', hmac.digest('hex'));

// Random bytes
console.log('\n3. Random Bytes:');
const randomBytes = crypto.randomBytes(16);
console.log('   16 random bytes:', randomBytes.toString('hex'));

// Random integers
console.log('\n4. Random Integers:');
for (let i = 0; i < 3; i++) {
  const num = crypto.randomInt(1, 100);
  console.log(`   Random ${i + 1}:`, num);
}

// Timing safe comparison
console.log('\n5. Timing Safe Comparison:');
const a = Buffer.from('hello');
const b = Buffer.from('hello');
const c = Buffer.from('world');
console.log('   "hello" === "hello":', crypto.timingSafeEqual(a, b));
console.log('   "hello" === "world":', crypto.timingSafeEqual(a, c));

// Available algorithms
console.log('\n6. Available Hashes:');
console.log('   ', crypto.getHashes().join(', '));

console.log('\n7. Available Ciphers:');
console.log('   ', crypto.getCiphers().join(', '));
