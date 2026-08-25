// Elyxion Package Installer
'use strict';

const fs = require('fs');
const path = require('path');
const { Resolver } = require('./resolver');
const { Registry } = require('./registry');

const ELYX_MODULES = 'elyx_modules';
const ELYX_LOCK = 'elyx-lock.json';

class Installer {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.resolver = new Resolver(options);
    this.elyxModulesPath = path.join(this.cwd, ELYX_MODULES);
    this.packageJsonPath = path.join(this.cwd, 'package.json');
    this.lockFilePath = path.join(this.cwd, ELYX_LOCK);
  }

  async install(packages = {}) {
    const startTime = Date.now();
    
    console.log('\x1b[36mInstalling packages...\x1b[0m\n');

    // Ensure elyx_modules exists
    if (!fs.existsSync(this.elyxModulesPath)) {
      fs.mkdirSync(this.elyxModulesPath, { recursive: true });
    }

    // Read existing package.json
    let packageJson = {};
    if (fs.existsSync(this.packageJsonPath)) {
      packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf-8'));
    }

    // Merge packages to install
    const dependencies = {
      ...packageJson.dependencies,
      ...packages
    };

    // Resolve and install each package
    const installed = [];
    
    for (const [name, version] of Object.entries(dependencies)) {
      try {
        console.log(`  \x1b[32mInstalling\x1b[0m ${name}@${version}`);
        await this.installPackage(name, version);
        installed.push({ name, version });
      } catch (err) {
        console.error(`  \x1b[31mFailed to install\x1b[0m ${name}: ${err.message}`);
      }
    }

    // Update package.json
    packageJson.dependencies = dependencies;
    fs.writeFileSync(this.packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Create/update lock file
    await this.createLockFile(installed);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n\x1b[32m✓\x1b[0m ${installed.length} packages installed in ${duration}s\n`);
    
    return installed;
  }

  async installPackage(name, version) {
    // Resolve package
    const pkg = await this.resolver.resolvePackage(name, version);
    
    // Create package directory
    const pkgDir = path.join(this.elyxModulesPath, name);
    
    if (fs.existsSync(pkgDir)) {
      // Remove existing
      this.removeDir(pkgDir);
    }
    
    fs.mkdirSync(pkgDir, { recursive: true });

    // Write the package metadata + placeholder entry point
    await this.createPackageFiles(pkg, pkgDir);

    // If the registry published a tarball, fetch it too (best-effort)
    if (pkg.tarball) {
      try {
        await this.downloadTarball(pkg.tarball, pkgDir);
      } catch (_) {
        // Non-fatal — the package.json is already in place
      }
    }

    // Install dependencies
    if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
      for (const [depName, depVersion] of Object.entries(pkg.dependencies)) {
        const depDir = path.join(this.elyxModulesPath, depName);
        
        if (!fs.existsSync(depDir)) {
          await this.installPackage(depName, depVersion);
        }
      }
    }
  }

  async downloadTarball(tarballUrl, destDir) {
    // Fetch the tarball with curl (the runtime has no outbound TLS yet)
    const { execSync } = require('child_process');
    const dest = path.join(destDir, 'package.tgz');
    execSync('curl -fsSL --max-time 60 ' + JSON.stringify(tarballUrl) + ' -o ' + JSON.stringify(dest));
  }

  async createPackageFiles(pkg, destDir) {
    // Writes the package.json metadata from the registry plus a
    // placeholder entry point (the runtime has no tar extractor yet,
    // so installed packages resolve like any local module would).
    
    const packageJson = {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      main: pkg.main
    };
    
    fs.writeFileSync(
      path.join(destDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create placeholder index.js
    fs.writeFileSync(
      path.join(destDir, pkg.main || 'index.js'),
      `// ${pkg.name} v${pkg.version}\nmodule.exports = {};\n`
    );
  }

  async createLockFile(installed) {
    const lockFile = {
      name: 'elyxion-cli-lockfile',
      version: '1.0.0',
      lockfileVersion: 1,
      packages: {}
    };

    for (const pkg of installed) {
      const pkgDir = path.join(this.elyxModulesPath, pkg.name);
      const pkgJsonPath = path.join(pkgDir, 'package.json');
      
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        lockFile.packages[pkg.name] = {
          version: pkgJson.version,
          resolved: `${Registry.getRegistryUrl()}/api/packages/${pkg.name}`
        };
      }
    }

    fs.writeFileSync(this.lockFilePath, JSON.stringify(lockFile, null, 2));
  }

  removeDir(dirPath) {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach((file) => {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          this.removeDir(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(dirPath);
    }
  }

  async uninstall(packages) {
    console.log('\n\x1b[36mUninstalling packages...\x1b[0m\n');

    for (const name of packages) {
      const pkgDir = path.join(this.elyxModulesPath, name);
      
      if (fs.existsSync(pkgDir)) {
        this.removeDir(pkgDir);
        console.log(`  \x1b[32m✓\x1b[0m ${name} removed`);
      } else {
        console.log(`  \x1b[33m⚠\x1b[0m ${name} not found`);
      }
    }

    // Update package.json
    if (fs.existsSync(this.packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf-8'));
      for (const name of packages) {
        delete packageJson.dependencies?.[name];
      }
      fs.writeFileSync(this.packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
  }

  async update(packages) {
    console.log('\n\x1b[36mUpdating packages...\x1b[0m\n');

    // If no packages specified, update all
    if (packages.length === 0) {
      if (fs.existsSync(this.packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf-8'));
        packages = Object.keys(packageJson.dependencies || {});
      }
    }

    for (const name of packages) {
      try {
        console.log(`  \x1b[32mUpdating\x1b[0m ${name}`);
        await this.installPackage(name, 'latest');
      } catch (err) {
        console.error(`  \x1b[31mFailed to update\x1b[0m ${name}: ${err.message}`);
      }
    }
  }

  list() {
    if (!fs.existsSync(this.elyxModulesPath)) {
      console.log('\x1b[33mNo packages installed\x1b[0m');
      return [];
    }

    const packages = fs.readdirSync(this.elyxModulesPath);
    console.log('\n\x1b[36mInstalled packages:\x1b[0m\n');
    
    for (const name of packages) {
      const pkgJsonPath = path.join(this.elyxModulesPath, name, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        console.log(`  ${name}@${pkgJson.version}`);
      }
    }
    
    return packages;
  }
}

module.exports = { Installer };
