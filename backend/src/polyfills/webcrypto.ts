/**
 * WebCrypto Polyfill for pkg binaries
 * This MUST be imported before any other modules that use crypto
 */

// Force polyfill in production as pkg binaries have incomplete crypto.subtle implementation
if (process.env.NODE_ENV === 'production') {
    const { Crypto } = require('@peculiar/webcrypto');
    globalThis.crypto = new Crypto();
    console.log('✅ WebCrypto polyfill loaded (production mode)');
} else if (!globalThis.crypto || !globalThis.crypto.subtle) {
    const { Crypto } = require('@peculiar/webcrypto');
    globalThis.crypto = new Crypto();
    console.log('✅ WebCrypto polyfill loaded (fallback)');
}
