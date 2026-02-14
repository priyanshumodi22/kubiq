#!/usr/bin/env node

/**
 * Patch @simplewebauthn/server to use @peculiar/webcrypto in pkg binaries
 * This runs at build time, before pkg creates the snapshot
 */

const fs = require('fs');
const path = require('path');

const targetFile = path.join(
    __dirname,
    '../node_modules/@simplewebauthn/server/script/helpers/iso/isoCrypto/getWebCrypto.js'
);

console.log('🔧 Patching @simplewebauthn/server for pkg compatibility...');

if (!fs.existsSync(targetFile)) {
    console.error('❌ Target file not found:', targetFile);
    process.exit(1);
}

const originalContent = fs.readFileSync(targetFile, 'utf8');

// Inject polyfill at the top of the file
const patchedContent = `// PKG COMPATIBILITY PATCH - Injected at build time
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  try {
    const { Crypto } = require('@peculiar/webcrypto');
    globalThis.crypto = new Crypto();
    console.log('✅ WebCrypto polyfill loaded via build-time patch');
  } catch (e) {
    console.error('❌ Failed to load WebCrypto polyfill:', e);
  }
}

${originalContent}`;

fs.writeFileSync(targetFile, patchedContent, 'utf8');

console.log('✅ Successfully patched @simplewebauthn/server');
