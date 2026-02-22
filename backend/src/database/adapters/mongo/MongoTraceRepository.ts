import mongoose from 'mongoose';
import { ITraceRepository, ISpan, IServiceMetrics } from '../../interfaces/ITraceRepository';
import { ApmSpanModel } from '../../schemas/ApmSpanSchema';

export class MongoTraceRepository implements ITraceRepository {
    private isInitialized = false;

    async initialize(): Promise<void> {
        if (this.isInitialized || mongoose.connection.readyState === 1) {
            return;
        }

        // Logic for connection is already handled generally in the app via user/system repos
        // We just mark it initialized. Mongoose binds models globally.
        this.isInitialized = true;
        console.log('MongoDB Trace Repository Initialized');
    }

    async insertSpans(spans: ISpan[]): Promise<void> {
        if (!spans || spans.length === 0) return;

        // Map our ISpan interface to the Mongoose document structure
        const docs = spans.map(span => ({
            ...span,
            // Create a Date object from the nano timestamp for standard MongoDB time-series queries
            timestamp: new Date(span.startTimeUnixNano / 1000000)
        }));

        // Use insertMany for high-throughput batch insertion.
        // ordered: false ensures that if one span fails (e.g. duplicate spanId), the rest still insert.
        try {
            console.log(`[MongoTraceRepository] Attempting insert. Mongoose ReadyState: ${mongoose.connection.readyState}`);
            console.log(`[MongoTraceRepository] Sample doc to insert:`, JSON.stringify(docs[0]).substring(0, 500));
            // Bypass Mongoose validation/casting with native driver
            const result = await ApmSpanModel.collection.insertMany(docs, { ordered: false });
            console.log(`[MongoTraceRepository] Native Insert SUCCESS. Inserted ${result.insertedCount} docs.`);
        } catch (err: any) {
            // Log ALL errors for debugging to see why spans are not saving
            console.error('Failed to batch insert spans into MongoDB:', err.message);
            if (err.writeErrors) {
                console.error(`First write error:`, err.writeErrors[0]);
            }
            if (err.code !== 11000) {
                throw err;
            }
        }
    }

    async getServiceMetrics(timeRangeMs: number): Promise<IServiceMetrics[]> {
        const since = new Date(Date.now() - timeRangeMs);

        const pipeline = [
            { $match: { timestamp: { $gte: since } } },
            {
                $group: {
                    _id: '$serviceName',
                    requestCount: { $sum: 1 },
                    errorCount: { $sum: { $cond: [{ $eq: ['$statusCode', 2] }, 1, 0] } }, // Assuming 2 = Error in OTel
                    avgDurationMs: { $avg: '$durationMs' },
                    durations: { $push: '$durationMs' } // Collect durations for p95 calculation
                }
            },
            {
                $project: {
                    _id: 0,
                    serviceName: '$_id',
                    requestCount: 1,
                    errorCount: 1,
                    avgDurationMs: 1,
                    // Sort the array of durations and pick the 95th percentile
                    // Note: In Mongo 5.2+ we could use $percentile, but for wide compatibility we sort here
                    // We'll calculate p95 in the JS layer for safety if MongoDB version is unknown
                    durations: 1
                }
            }
        ];

        const results = await ApmSpanModel.aggregate(pipeline);

        return results.map(res => {
            // Manual p95 Calculation for compatibility with older MongoDBs
            const sorted = res.durations.sort((a: number, b: number) => a - b);
            const index = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
            const p95 = sorted.length > 0 ? sorted[index] : 0;

            return {
                serviceName: res.serviceName,
                requestCount: res.requestCount,
                errorCount: res.errorCount,
                avgDurationMs: res.avgDurationMs || 0,
                p95DurationMs: p95
            };
        });
    }

    async getTraceDetails(traceId: string): Promise<ISpan[]> {
        // Return all spans for a trace sorted by start time
        const spans = await ApmSpanModel.find({ traceId }).sort({ startTimeUnixNano: 1 }).lean();
        return spans as unknown as ISpan[];
    }

    async getServiceDependencies(timeRangeMs: number): Promise<import('../../interfaces/ITraceRepository').IServiceDependency[]> {
        const since = new Date(Date.now() - timeRangeMs);

        const pipeline = [
            // 1. Filter to recent traffic
            { $match: { timestamp: { $gte: since } } },

            // 2. Perform a self-join to find the parent span for each child span
            {
                $lookup: {
                    from: 'apmspans',
                    localField: 'parentSpanId',
                    foreignField: 'spanId',
                    as: 'parentSpan'
                }
            },

            // 3. Unwind the joined array so each child has exactly one parent object
            { $unwind: '$parentSpan' },

            // 4. Filter out self-calls (internal functions) so we only get network hops between different services
            {
                $match: {
                    $expr: { $ne: ['$serviceName', '$parentSpan.serviceName'] }
                }
            },

            // 5. Group by Caller (Parent) -> Callee (Child) and count the frequency and errors
            {
                $group: {
                    _id: {
                        source: '$parentSpan.serviceName',
                        target: '$serviceName'
                    },
                    callCount: { $sum: 1 },
                    // OpenTelemetry statusCode === 2 means Error
                    errorCount: {
                        $sum: { $cond: [{ $eq: ['$statusCode', 2] }, 1, 0] }
                    }
                }
            },

            // 6. Project into the IServiceDependency structure
            {
                $project: {
                    _id: 0,
                    source: '$_id.source',
                    target: '$_id.target',
                    callCount: 1,
                    errorCount: 1
                }
            }
        ];

        const results = await ApmSpanModel.aggregate(pipeline);
        return results;
    }

    async getRecentTraceIdForService(serviceName: string): Promise<string | null> {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

        const recentSpan = await ApmSpanModel.findOne({
            serviceName: serviceName,
            timestamp: { $gte: twelveHoursAgo }
        })
            .sort({ timestamp: -1 })
            .select('traceId')
            .lean()
            .exec();

        return recentSpan ? recentSpan.traceId : null;
    }

    async getRecentTraceIdForEdge(source: string, target: string): Promise<string | null> {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

        const result = await ApmSpanModel.aggregate([
            { $match: { serviceName: target, timestamp: { $gte: twelveHoursAgo } } },
            {
                $lookup: {
                    from: 'apmspans',
                    localField: 'parentSpanId',
                    foreignField: 'spanId',
                    as: 'parentSpan'
                }
            },
            { $unwind: '$parentSpan' },
            { $match: { 'parentSpan.serviceName': source } },
            { $sort: { timestamp: -1 } },
            { $limit: 1 },
            { $project: { traceId: 1 } }
        ]);

        return result.length > 0 ? result[0].traceId : null;
    }
}
