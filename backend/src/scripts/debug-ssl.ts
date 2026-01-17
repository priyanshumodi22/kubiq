
import https from 'https';
import axios from 'axios';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

console.log('Environment loaded.');
console.log('HTTP_PROXY:', process.env.HTTP_PROXY || 'Not Set');
console.log('HTTPS_PROXY:', process.env.HTTPS_PROXY || 'Not Set');


const targets = [
    { name: 'Circuit-UI', url: 'https://demo.cloud-tcshobs.com/circuit-ui' },
    { name: 'Fabricator', url: 'https://demo.cloud-tcshobs.com/fabricator' }
];

async function checkSite(name: string, url: string) {
    console.log(`\n---------------------------------------------------`);
    console.log(`🔍 Checking ${name} (${url})`);
    console.log(`---------------------------------------------------`);

    // Test 1: Strict SSL (rejectUnauthorized: true)
    try {
        console.log('Test 1: Normal Connection (Strict SSL)...');
        const agent = new https.Agent({ 
            rejectUnauthorized: true,
            keepAlive: false 
        });
        
        const res = await axios.get(url, { 
            httpsAgent: agent, 
            timeout: 15000, 
            headers: { 'User-Agent': 'Kubiq-Debug-Script/1.0' },
            maxRedirects: 0, // Match ServiceMonitor behavior
            validateStatus: () => true 
        });
        
        console.log(`✅ Status: ${res.status}`);
        printCert(res);
    } catch (e: any) {
        console.log(`❌ Strict Connection Failed: ${e.message}`);
        if (e.code) console.log(`   Code: ${e.code}`);
    }

    // Test 2: Ignore SSL (rejectUnauthorized: false)
    try {
        console.log('\nTest 2: Ignored SSL (rejectUnauthorized: false)...');
        const agent = new https.Agent({ 
            rejectUnauthorized: false,
            keepAlive: false 
        });
        
        const res = await axios.get(url, { 
            httpsAgent: agent, 
            timeout: 15000, 
            headers: { 'User-Agent': 'Kubiq-Debug-Script/1.0' },
            maxRedirects: 0, // Match ServiceMonitor behavior
            validateStatus: () => true 
        });
        
        console.log(`✅ Status: ${res.status}`);
        printCert(res);
    } catch (e: any) {
        console.log(`❌ Ignore SSL Connection Failed: ${e.message}`);
    }

    // Test 3: Raw TLS Connect (Robustness Check)
    try {
        console.log('\nTest 3: Raw TLS Socket Connect...');
        await checkTlsRaw(url);
    } catch (e: any) {
        console.log(`❌ TLS Raw Failed: ${e.message}`);
    }
}

import tls from 'tls';
import { URL } from 'url';

function checkTlsRaw(urlStr: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const port = u.port ? parseInt(u.port, 10) : 443;
        const options = {
            host: u.hostname,
            port: port,
            servername: u.hostname,
            rejectUnauthorized: false // Just get the cert, don't fail
        };

        const socket = tls.connect(options, () => {
            console.log('   ✅ TLS Handshake Complete');
            const cert = socket.getPeerCertificate();
            if (cert && Object.keys(cert).length > 0) {
                 console.log(`   📜 Certificate Found (Raw TLS):`);
                 console.log(`      - Valid To: ${cert.valid_to}`);
                 // console.log(`      - Subject: ${cert.subject.CN}`);
            } else {
                 console.log('   ⚠️  No Cert in Raw TLS?');
            }
            socket.end();
            resolve();
        });

        socket.on('error', (err) => {
            reject(err);
        });
        
        socket.setTimeout(5000, () => {
            socket.destroy();
            reject(new Error('TLS Timeout'));
        });
    });

}

function printCert(res: any) {
    const cert = res.request?.res?.socket?.getPeerCertificate();
    if (cert && Object.keys(cert).length > 0) {
        console.log(`📜 Certificate Found:`);
        console.log(`   - Subject: ${cert.subject.CN}`);
        console.log(`   - Issuer:  ${cert.issuer.CN}`);
        console.log(`   - Valid To: ${cert.valid_to}`);
        
        const days = Math.ceil((new Date(cert.valid_to).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        console.log(`   - Days Left: ${days}`);
    } else {
        console.log(`⚠️  No Certificate Data returned!`);
        console.log(`   (Socket reused? ${res.request?.res?.socket?.wasReused})`);
    }
}

async function run() {
    for (const t of targets) {
        await checkSite(t.name, t.url);
    }
}

run();
