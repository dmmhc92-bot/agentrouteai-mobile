#!/usr/bin/env node

// Preflight check for Expo environment
const requiredEnvVars = [
  'EXPO_TUNNEL_SUBDOMAIN',
  'EXPO_PACKAGER_HOSTNAME',
  'EXPO_PUBLIC_BACKEND_URL'
];

let hasErrors = false;

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    hasErrors = true;
  } else {
    console.log(`${varName} is set`);
  }
});

if (hasErrors) {
  console.error('\nPreflight check failed. Please set all required environment variables.');
  process.exit(1);
}

console.log('\nPreflight check passed!');
process.exit(0);
