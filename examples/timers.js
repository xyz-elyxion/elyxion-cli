// Timers Example
'use strict';

console.log('Timers Example');
console.log('==============\n');

// setTimeout
console.log('1. setTimeout:');
setTimeout(() => {
  console.log('   This message appears after 1 second');
}, 1000);

// setInterval (we'll clear it after a few seconds)
console.log('2. setInterval:');
let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log(`   Tick ${counter}`);
  if (counter >= 3) {
    clearInterval(interval);
    console.log('   Interval cleared\n');
  }
}, 500);

// setImmediate
console.log('3. setImmediate:');
setImmediate(() => {
  console.log('   This runs on next event loop iteration');
});

// Promise chain
console.log('4. Promise chain:');
Promise.resolve(1)
  .then(value => {
    console.log(`   Step 1: ${value}`);
    return value + 1;
  })
  .then(value => {
    console.log(`   Step 2: ${value}`);
    return value + 1;
  })
  .then(value => {
    console.log(`   Step 3: ${value}`);
  });

console.log('\nOutput will continue...');
