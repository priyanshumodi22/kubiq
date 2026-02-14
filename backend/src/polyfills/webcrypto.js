/**
 * WebCrypto Polyfill for pkg binaries
 * This MUST be loaded before @simplewebauthn/server
 */

// Always load polyfill - pkg binaries have incomplete crypto.subtle
const { Crypto } = require('@peculiar/webcrypto');
const crypto = new Crypto();

// Override global crypto
Object.defineProperty(globalThis, 'crypto', {
    value: crypto,
    writable: false,
    configurable: true
});

console.log('✅ WebCrypto polyfill loaded');

module.exports = {};
