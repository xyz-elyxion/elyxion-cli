// File System Example
'use strict';

const fs = require('fs');
const path = require('path');

console.log('File System Example');
console.log('===================\n');

// List current directory
const files = fs.readdirSync('.');
console.log('Files in current directory:');
files.forEach(file => {
  const stats = fs.statSync(file);
  const type = stats.isDirectory() ? '[DIR] ' : '[FILE]';
  console.log(`  ${type} ${file}`);
});

// Create a test file
const testFile = path.join(__dirname, 'test-output.txt');
const content = `Created by Elyxion at ${new Date().toISOString()}\n`;
fs.writeFileSync(testFile, content);
console.log(`\nCreated file: ${testFile}`);

// Read the file back
const readContent = fs.readFileSync(testFile, 'utf-8');
console.log('File content:');
console.log(readContent);

// Clean up
fs.unlinkSync(testFile);
console.log('Cleaned up test file');

// Path operations
console.log('\nPath operations:');
console.log('  join:', path.join('/foo', 'bar', 'baz'));
console.log('  dirname:', path.dirname('/foo/bar/baz.txt'));
console.log('  basename:', path.basename('/foo/bar/baz.txt'));
console.log('  extname:', path.extname('file.txt'));
console.log('  resolve:', path.resolve('foo', 'bar'));
