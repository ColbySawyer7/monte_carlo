#!/usr/bin/env node
/**
 * Cross-platform build script dispatcher for native Rust addons (N-API)
 * Detects the platform and calls the appropriate script:
 *   - Windows: build-wasm.ps1 (PowerShell)
 *   - Mac/Linux: build-wasm.sh (Bash)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPT_DIR = __dirname;
const isWindows = process.platform === 'win32';

// Determine which script to run
let scriptPath;
let command;

if (isWindows) {
  // Windows: Use PowerShell script
  scriptPath = path.join(SCRIPT_DIR, 'build-wasm.ps1');
  if (!fs.existsSync(scriptPath)) {
    console.error(`Error: PowerShell script not found: ${scriptPath}`);
    process.exit(1);
  }
  // Use PowerShell to execute the script
  command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`;
} else {
  // Mac/Linux: Use Bash script
  scriptPath = path.join(SCRIPT_DIR, 'build-wasm.sh');
  if (!fs.existsSync(scriptPath)) {
    console.error(`Error: Bash script not found: ${scriptPath}`);
    process.exit(1);
  }
  // Make sure script is executable
  try {
    fs.chmodSync(scriptPath, '755');
  } catch (e) {
    // Ignore chmod errors (might not have permissions, but script might still work)
  }
  command = `bash "${scriptPath}"`;
}

// Execute the appropriate script
try {
  execSync(command, {
    stdio: 'inherit',
    cwd: SCRIPT_DIR
  });
} catch (error) {
  console.error(`Build script failed with exit code ${error.status || 1}`);
  process.exit(error.status || 1);
}

