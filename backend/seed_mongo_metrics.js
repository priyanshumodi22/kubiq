const mongoose = require('mongoose');

// --- CONFIG ---
const MONGO_URI = 'mongodb+srv://haxterpm:Haxter%40%402024@cluster0.vtjm3hl.mongodb.net/kubiq'; // Adjust if needed
const MOUNT_POINT = '/mnt/e';  // The disk to fill up
const TOTAL_SIZE = 100 * 1024 * 1024 * 1024; // 100 GB
const START_USAGE = 60 * 1024 * 1024 * 1024; // 60 GB
const DAILY_GROWTH = 2 * 1024 * 1024 * 1024; // 2 GB per day (Will fill 40GB in 20 days -> CRITICAL)
const DAYS_HISTORY = 30;

// Need a minimal Schema to write to the collection
// Matches SystemMetricsSchema.ts
const MetricSchema = new mongoose.Schema({
    cpuLoad: { type: Number, required: true },
    memoryUsed: { type: Number, required: true },
    memoryTotal: { type: Number, required: true },
    diskUsage: { type: mongoose.Schema.Types.Mixed, required: true },
    timestamp: { type: Date, default: Date.now, index: true }
});

const MetricModel = mongoose.model('SystemMetrics', MetricSchema);
const ConfigModel = mongoose.model('SystemPreferences', new mongoose.Schema({
    key: String,
    value: mongoose.Schema.Types.Mixed
}));

async function seed() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    console.log('🧹 Clearing existing metrics...');
    // Optional: Keep this commented to append, or uncomment to reset
    await MetricModel.deleteMany({}); 

    console.log(`🌱 Generating ${DAYS_HISTORY} days of growing data for ${MOUNT_POINT}...`);

    const batch = [];
    const now = new Date();

    for (let i = DAYS_HISTORY; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i); // Go back 'i' days

        const currentUsed = START_USAGE + (DAILY_GROWTH * (DAYS_HISTORY - i)); // Linear growth
        
        // Ensure cap
        const used = Math.min(currentUsed, TOTAL_SIZE);

        batch.push({
            cpuLoad: 10 + Math.random() * 50, // Random CPU
            memoryUsed: 4000000000,
            memoryTotal: 8000000000,
            diskUsage: [
                {
                    fs: 'ext4',
                    type: 'overlay', // Matches typical docker/linux root
                    size: TOTAL_SIZE,
                    used: used,
                    use: (used / TOTAL_SIZE) * 100,
                    mount: MOUNT_POINT
                }
            ],
            timestamp: date
        });
    }

    await MetricModel.insertMany(batch);
    console.log(`✅ Inserted ${batch.length} records.`);

    // Also ensure this disk is 'Monitored' in config
    console.log('⚙️  Ensuring disk is monitored in config...');
    await ConfigModel.findOneAndUpdate(
        { key: 'storage_prefs' },
        { 
            key: 'storage_prefs', 
            value: { allowedMounts: [MOUNT_POINT] } 
        },
        { upsert: true }
    );
    console.log('✅ Config updated.');

    await mongoose.disconnect();
    console.log('👋 Done. Restart backend to see predictions!');
}

seed().catch(console.error);
