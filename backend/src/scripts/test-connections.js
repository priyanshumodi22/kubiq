
const net = require('net');
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

async function checkTcp(host, port) {
    console.log(`\n--- Checking TCP: ${host}:${port} ---`);
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const start = Date.now();
        
        socket.setTimeout(5000); // 5s timeout

        socket.connect(port, host, () => {
            const time = Date.now() - start;
            console.log(`✅ Success! Connected to ${host}:${port} in ${time}ms`);
            socket.destroy();
            resolve();
        });

        socket.on('timeout', () => {
            console.error(`❌ Timeout after 5000ms`);
            socket.destroy();
            resolve(); 
        });

        socket.on('error', (err) => {
            console.error(`❌ Error: ${err.message}`);
            resolve();
        });
    });
}

async function checkMysql(connectionString) {
    console.log(`\n--- Checking MySQL: ${connectionString.replace(/:[^:]*@/, ':****@')} ---`);
    let connection;
    try {
        connection = await mysql.createConnection(connectionString);
        await connection.ping();
        console.log(`✅ Success! Ping successful.`);
    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
    } finally {
        if (connection) await connection.end();
    }
}

async function checkMongo(connectionString) {
    console.log(`\n--- Checking MongoDB: ${connectionString.replace(/:[^:]*@/, ':****@')} ---`);
    try {
        const conn = await mongoose.createConnection(connectionString, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000
        }).asPromise();
        console.log(`✅ Success! Connected to MongoDB.`);
        await conn.close();
    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
    }
}

async function run() {
    console.log('Starting connectivity tests (JS Mode)...');
    
    // Kafka test
    await checkTcp('kafka', 9092);
    
    // MySQL test
    await checkMysql('mysql://hobsread:hobsread@hobsdbhost:3306');

    // MongoDB test
    await checkMongo('mongodb+srv://haxterpm:Haxter%40%402024@cluster0.vtjm3hl.mongodb.net/kubiq');
}

run().catch(console.error);
