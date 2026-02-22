// Dummy service mimicking a billing API
const express = require('express');
const app = express();

const PORT = process.env.PORT || 4000;

app.get('/api/billing/status', (req, res) => {
    // Simulate some work
    setTimeout(() => {
        res.json({ status: 'active', balance: 150.50 });
    }, Math.random() * 200 + 50); // Random latency 50-250ms
});

app.post('/api/billing/charge', (req, res) => {
    setTimeout(() => {
        // 10% chance to fail
        if (Math.random() < 0.1) {
            res.status(500).json({ error: 'Payment gateway timeout' });
            return;
        }
        res.json({ success: true, transactionId: 'txn_' + Date.now() });
    }, Math.random() * 500 + 100);
});

// Endpoint that calls itself to generate multiple spans
app.get('/api/billing/simulate-traffic', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;

        // Make 5 random requests to ourselves to generate traces
        for (let i = 0; i < 5; i++) {
            if (Math.random() > 0.5) {
                await fetch(`http://localhost:${PORT}/api/billing/status`);
            } else {
                await fetch(`http://localhost:${PORT}/api/billing/charge`, { method: 'POST' });
            }
        }
        res.json({ message: 'Traffic simulated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Simulation failed' });
    }
});

app.listen(PORT, () => {
    console.log(`Dummy Billing Service running on port ${PORT}`);

    // Constantly simulate traffic every 5 seconds
    setInterval(async () => {
        const fetch = (await import('node-fetch')).default;
        fetch(`http://localhost:${PORT}/api/billing/simulate-traffic`).catch(() => { });
    }, 5000);
});
