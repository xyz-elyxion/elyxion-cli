// Elyxion Test Runner
'use strict';

const path = require('path');
const fs = require('fs');

class TestRunner {
  constructor() {
    this.tests = [];
    this.suites = [];
    this.currentSuite = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };
  }

  describe(name, fn) {
    this.currentSuite = { name, tests: [] };
    this.suites.push(this.currentSuite);
    fn();
    this.currentSuite = null;
  }

  it(name, fn) {
    if (this.currentSuite) {
      this.currentSuite.tests.push({ name, fn });
    }
  }

  async run() {
    console.log('\x1b[1mRunning tests...\x1b[0m\n');

    for (const suite of this.suites) {
      console.log(`\x1b[36m${suite.name}\x1b[0m`);

      for (const test of suite.tests) {
        try {
          await test.fn();
          this.results.passed++;
          console.log(`  \x1b[32m✓\x1b[0m ${test.name}`);
        } catch (err) {
          this.results.failed++;
          this.results.errors.push({ suite: suite.name, test: test.name, error: err });
          console.log(`  \x1b[31m✗\x1b[0m ${test.name}`);
          console.log(`    \x1b[31m${err.message}\x1b[0m`);
        }
      }
    }

    this.printSummary();
    return this.results;
  }

  printSummary() {
    const total = this.results.passed + this.results.failed + this.results.skipped;
    console.log('\n' + '='.repeat(50));
    console.log(`\x1b[1mTest Results:\x1b[0m`);
    console.log(`  \x1b[32mPassed:\x1b[0m  ${this.results.passed}`);
    console.log(`  \x1b[31mFailed:\x1b[0m  ${this.results.failed}`);
    console.log(`  \x1b[33mSkipped:\x1b[0m ${this.results.skipped}`);
    console.log(`  \x1b[36mTotal:\x1b[0m   ${total}`);
    console.log('='.repeat(50) + '\n');
  }
}

// Export for use
module.exports = { TestRunner };

// Run tests if this file is executed directly
if (require.main === module) {
  const runner = new TestRunner();

  // Load test files
  const testDir = __dirname;
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));

  for (const file of files) {
    require(path.join(testDir, file));
  }

  runner.run().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}
