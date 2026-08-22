# Contributing to Elyxion CLI

Thank you for your interest in contributing to Elyxion CLI! This document provides guidelines and information for contributors.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Contributing Guidelines](#contributing-guidelines)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/elyxion-cli.git
   cd elyxion-cli
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/xyz-elyxion/elyxion-cli.git
   ```

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- C++ compiler (for native addon)
- Python 3 (for node-gyp)

### Installation

```bash
# Install dependencies
npm install

# Build the native addon
npm run build

# Run tests
npm test
```

### Running Locally

```bash
# Start the REPL
./bin/elyxion --repl

# Run a script
./bin/elyxion examples/hello.js

# Use the package manager
./bin/elyx init
./bin/elyx install lodash
```

## Project Structure

```
elyxion-cli/
├── bin/                    # CLI entry points
│   ├── elyxion            # Runtime CLI
│   └── elyx               # Package manager CLI
├── src/                    # C++ source code
│   ├── core/              # V8 bindings and environment
│   │   ├── elyxion.cc     # Main entry point
│   │   ├── environment.cc # JS environment setup
│   │   └── *.h            # Header files
│   └── loop/              # libuv event loop integration
│       └── event_loop.cc  # Event loop implementation
├── lib/                    # JavaScript runtime
│   ├── index.js           # Main entry point
│   ├── bootstrap.js       # Runtime initialization
│   ├── cli/               # CLI interface
│   │   ├── index.js       # CLI main
│   │   ├── args.js        # Argument parser
│   │   └── repl.js        # REPL implementation
│   ├── modules/           # Core modules
│   │   ├── fs.js          # File system
│   │   ├── path.js        # Path utilities
│   │   ├── http.js        # HTTP client/server
│   │   ├── net.js         # TCP networking
│   │   ├── events.js      # Event emitter
│   │   ├── stream.js      # Streams
│   │   ├── buffer.js      # Buffer
│   │   ├── crypto.js      # Cryptography
│   │   ├── os.js          # OS info
│   │   ├── url.js         # URL parsing
│   │   ├── util.js        # Utilities
│   │   └── child_process.js # Child processes
│   └── pkg/               # Package manager
│       ├── cli.js         # Package manager CLI
│       ├── commands/      # Command implementations
│       └── utils/         # Utilities
├── test/                   # Test files
└── examples/               # Example scripts
```

## Contributing Guidelines

### Types of Contributions

1. **Bug Fixes** - Fix issues in existing functionality
2. **New Features** - Add new capabilities
3. **Documentation** - Improve or add documentation
4. **Tests** - Add or improve test coverage
5. **Refactoring** - Improve code quality without changing behavior

### Before Contributing

1. **Check existing issues** - See if someone is already working on it
2. **Open an issue** - For large changes, discuss first
3. **Read the code** - Understand the existing patterns

## Code Style

### JavaScript

- Use 2-space indentation
- Use single quotes for strings
- Use `const` and `let`, avoid `var`
- Use arrow functions when appropriate
- Add JSDoc comments for public APIs
- Follow ESLint rules

```javascript
// Good
const calculateTotal = (items) => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

// Bad
var calculateTotal = function(items) {
  return items.reduce(function(sum, item) {
    return sum + item.price;
  }, 0);
};
```

### C++

- Use 2-space indentation
- Follow Google C++ Style Guide
- Use meaningful variable names
- Add comments for complex logic
- Use RAII for resource management

```cpp
// Good
class Environment {
 public:
  explicit Environment(v8::Isolate* isolate);
  ~Environment();

 private:
  v8::Isolate* isolate_;
};

// Bad
class Environment {
 public:
  Environment(v8::Isolate* i) { isolate = i; }
  ~Environment() {}

  v8::Isolate* isolate;
};
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node test/basic.test.js

# Run with coverage (if configured)
npm run test:coverage
```

### Writing Tests

- Place tests in the `test/` directory
- Name files as `<module>.test.js`
- Use descriptive test names
- Test both success and error cases

```javascript
// test/my-module.test.js
const assert = require('assert');
const { TestRunner } = require('./runner');

const runner = new TestRunner();

runner.describe('My Module', () => {
  runner.it('should do something', () => {
    const result = myModule.doSomething();
    assert.strictEqual(result, expected);
  });

  runner.it('should handle errors', () => {
    assert.throws(() => {
      myModule.doSomethingInvalid();
    }, Error);
  });
});

runner.run();
```

## Pull Request Process

### 1. Create a Branch

```bash
git checkout -b feature/my-feature
# or
git checkout -b fix/my-bugfix
```

### 2. Make Changes

- Write code following the style guide
- Add tests for new functionality
- Update documentation if needed

### 3. Test Your Changes

```bash
npm test
npm run build  # If you modified C++ code
```

### 4. Commit

Write clear, descriptive commit messages:

```bash
git commit -m "Add support for XYZ feature

- Implemented ABC functionality
- Added tests for new feature
- Updated documentation

Closes #123"
```

### 5. Push and Create PR

```bash
git push origin feature/my-feature
```

Then create a Pull Request on GitHub with:

- Clear title describing the change
- Description of what was changed and why
- Reference to any related issues
- Screenshots (if applicable)

### 6. Code Review

- Respond to feedback
- Make requested changes
- Ensure CI passes

## Reporting Bugs

When reporting bugs, please include:

1. **Environment**: OS, Node.js version, Elyxion version
2. **Steps to reproduce**: Minimal code to reproduce the issue
3. **Expected behavior**: What you expected to happen
4. **Actual behavior**: What actually happened
5. **Error messages**: Full error output if any

Example:

```markdown
**Environment:**
- OS: Ubuntu 22.04
- Node.js: v20.0.0
- Elyxion: v1.0.0

**Steps to reproduce:**
```javascript
const elyxion = require('elyxion-cli');
elyxion.doSomething();
```

**Expected:** Works correctly
**Actual:** Throws error: "Not implemented"
```

## Requesting Features

When requesting features, please include:

1. **Use case**: Why do you need this feature?
2. **Proposed solution**: How should it work?
3. **Alternatives considered**: Other ways to solve the problem
4. **Additional context**: Any other relevant information

## Questions?

If you have questions:

1. Check existing issues and documentation
2. Open a discussion issue
3. Join our community (if available)

Thank you for contributing!
