#!/usr/bin/env node
/**
 * Expo/EAS Preflight Check Script
 * Validates environment before Expo commands run
 * 
 * Checks:
 * 1. EXPO_TOKEN presence for CI authentication
 * 2. Required environment variables
 * 3. Expo CLI availability
 * 4. Project configuration validity
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load .env file if exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const REQUIRED_ENV_VARS = [
  'EXPO_PUBLIC_BACKEND_URL',
];

const CI_REQUIRED_VARS = [
  'EXPO_TOKEN',
];

const OPTIONAL_VARS = [
  'EXPO_TUNNEL_SUBDOMAIN',
  'EXPO_PACKAGER_HOSTNAME',
];

function log(message, type = 'info') {
  const prefix = {
    info: '✅',
    warn: '⚠️',
    error: '❌',
    check: '🔍',
  }[type] || 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function checkEnvironmentVariables() {
  log('Checking environment variables...', 'check');
  
  let hasErrors = false;
  
  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      log(`Missing required environment variable: ${varName}`, 'error');
      hasErrors = true;
    } else {
      log(`${varName} is set`);
    }
  }
  
  // Check CI-specific variables
  const isCI = process.env.CI === 'true' || process.env.CI === '1';
  if (isCI) {
    log('CI environment detected', 'info');
    
    if (!process.env.EXPO_TOKEN) {
      log('EXPO_TOKEN is not set - Expo authentication may fail in CI', 'warn');
      log('Set EXPO_TOKEN for non-interactive Expo/EAS commands', 'warn');
      // Don't fail - let Expo handle auth errors
    } else {
      log('EXPO_TOKEN is configured for CI authentication');
    }
  }
  
  // Log optional variables status
  for (const varName of OPTIONAL_CI_VARS) {
    if (process.env[varName]) {
      log(`${varName} is configured`);
    }
  }
  
  return !hasErrors;
}

function checkExpoConfig() {
  log('Checking Expo configuration...', 'check');
  
  const appJsonPath = path.join(__dirname, '..', 'app.json');
  
  if (!fs.existsSync(appJsonPath)) {
    log('app.json not found', 'error');
    return false;
  }
  
  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const expo = appJson.expo;
    
    if (!expo) {
      log('Missing "expo" key in app.json', 'error');
      return false;
    }
    
    // Check required fields
    const requiredFields = ['name', 'slug', 'version'];
    for (const field of requiredFields) {
      if (!expo[field]) {
        log(`Missing required field: expo.${field}`, 'error');
        return false;
      }
    }
    
    log(`App: ${expo.name} (${expo.slug})`);
    log(`Version: ${expo.version}`);
    
    if (expo.owner) {
      log(`Owner: ${expo.owner}`);
    }
    
    if (expo.ios?.bundleIdentifier) {
      log(`iOS Bundle ID: ${expo.ios.bundleIdentifier}`);
    }
    
    if (expo.android?.package) {
      log(`Android Package: ${expo.android.package}`);
    }
    
    // Check EAS config
    if (expo.extra?.eas?.projectId) {
      log(`EAS Project ID: ${expo.extra.eas.projectId}`);
    } else {
      log('EAS Project ID not configured in app.json', 'warn');
    }
    
    return true;
  } catch (error) {
    log(`Error reading app.json: ${error.message}`, 'error');
    return false;
  }
}

function checkExpoAuth() {
  log('Checking Expo authentication...', 'check');
  
  try {
    const result = execSync('npx expo whoami 2>&1', { 
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env }
    });
    
    if (result.includes('Not logged in')) {
      if (process.env.EXPO_TOKEN) {
        log('EXPO_TOKEN is set - authentication should work via token');
        return true;
      } else if (process.env.CI === 'true') {
        log('Not logged in to Expo and no EXPO_TOKEN in CI environment', 'warn');
        return true; // Don't fail - let the actual command handle it
      } else {
        log('Not logged in to Expo (run: npx expo login)', 'warn');
        return true; // Don't fail for local dev
      }
    } else {
      log(`Logged in as: ${result.trim()}`);
      return true;
    }
  } catch (error) {
    // whoami command might fail in various ways
    if (process.env.EXPO_TOKEN) {
      log('EXPO_TOKEN is configured for authentication');
      return true;
    }
    log('Could not verify Expo auth status', 'warn');
    return true; // Don't fail
  }
}

function checkEasConfig() {
  log('Checking EAS configuration...', 'check');
  
  const easJsonPath = path.join(__dirname, '..', 'eas.json');
  
  if (!fs.existsSync(easJsonPath)) {
    log('eas.json not found - EAS builds may not work', 'warn');
    return true;
  }
  
  try {
    const easJson = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
    
    if (easJson.build) {
      const profiles = Object.keys(easJson.build);
      log(`EAS build profiles: ${profiles.join(', ')}`);
    }
    
    return true;
  } catch (error) {
    log(`Error reading eas.json: ${error.message}`, 'warn');
    return true;
  }
}

function main() {
  console.log('\n========================================');
  console.log('  Expo/EAS Preflight Check');
  console.log('========================================\n');
  
  let allPassed = true;
  
  // Run checks
  if (!checkEnvironmentVariables()) allPassed = false;
  console.log('');
  
  if (!checkExpoConfig()) allPassed = false;
  console.log('');
  
  checkExpoAuth(); // Don't fail on auth issues
  console.log('');
  
  checkEasConfig();
  console.log('');
  
  // Summary
  console.log('========================================');
  if (allPassed) {
    log('Preflight check passed!', 'info');
    console.log('========================================\n');
    process.exit(0);
  } else {
    log('Preflight check failed - see errors above', 'error');
    console.log('========================================\n');
    process.exit(1);
  }
}

main();
