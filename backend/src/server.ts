

// Load environment variables SECOND
import dotenv from 'dotenv';
import path from 'node:path';

// Determine which .env file to load based on NODE_ENV. KUBIQ_ENV_FILE is an
// explicit local/test override so an operator can exercise the backend with a
// securely retrieved deployment environment without replacing .env or .env.local.
const envFile = process.env.KUBIQ_ENV_FILE?.trim() || (process.env.NODE_ENV === 'production' ? '.env' : '.env.local');
const envPath = path.resolve(process.cwd(), envFile);

// Production loads its mounted .env as before. Local production-equivalent tests can
// supply the effective k3s environment in memory without writing live secrets to disk.
if (process.env.KUBIQ_LOAD_DOTENV !== 'false') {
  dotenv.config({ path: envPath, override: true });
}

console.log(`📋 Loading environment from: ${envFile}`);

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { startTracing, traceRequest } from 'kubiq-apm/runtime';
import { requestTracing } from './middleware/requestTracing';
import { shutdownRuntime } from './utils/runtimeShutdown';
import { IngestionBufferService } from './services/IngestionBufferService';
import { servicesRouter } from './routes/services';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import authWebAuthnRouter from './routes/auth-webauthn';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware, requirePermission } from './middleware/auth';
import { ServiceMonitor } from './services/ServiceMonitor';
import { NotificationManager } from './services/NotificationManager';

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { LogStreamService } from './services/LogStreamService';
import { KubeLogStreamService } from './services/KubeLogStreamService';
import { KubeTerminalStreamService } from './services/KubeTerminalStreamService';

const app: Express = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;
const BACKEND_CONTEXT_PATH = process.env.BACKEND_CONTEXT_PATH || '';
const FRONTEND_CONTEXT_PATH = process.env.FRONTEND_CONTEXT_PATH || '';
const apmEnabled = process.env.APM_ENABLED === 'true';
const k8sMetricsHistoryEnabled = process.env.K8S_METRICS_HISTORY_ENABLED === 'true';
const systemMetricsEnabled = process.env.SYSTEM_METRICS_ENABLED !== 'false';
const k8sTerminalEnabled = process.env.K8S_TERMINAL_ENABLED === 'true';
const tracing = startTracing({ profile: 'kubiq', serviceName: 'kubiq-backend' });
const activeResponses = new Set<Response>();
let shuttingDown = false;

app.use((req, res, next) => {
  // Keep authenticated ingestion reachable for the final loopback export while draining.
  const telemetry = req.path.startsWith(BACKEND_CONTEXT_PATH + '/api/apm/') || req.path.startsWith(BACKEND_CONTEXT_PATH + '/api/telemetry/');
  if (shuttingDown && !telemetry) return res.status(503).json({ error: 'Server is shutting down' });
  if (!telemetry) {
    activeResponses.add(res);
    const finished = () => { activeResponses.delete(res); };
    res.once('finish', finished);
    res.once('close', finished);
  }
  next();
});
if (tracing.enabled) app.use(requestTracing(traceRequest, BACKEND_CONTEXT_PATH));

// Socket.IO Setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_DNS || process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ["GET", "POST"],
    credentials: false
  },
  path: `${BACKEND_CONTEXT_PATH}/socket.io` // Use context path if set
});

// Extract Origin (Domain) from KEYCLOAK_URL for CSP
// We want to allow the whole domain (e.g. https://priyanshumodi.in), not just /auth path
let KEYCLOAK_ORIGIN = '';
if (process.env.KEYCLOAK_URL) {
  try {
    KEYCLOAK_ORIGIN = new URL(process.env.KEYCLOAK_URL).origin;
  } catch {
    console.warn('⚠️ Invalid KEYCLOAK_URL format for CSP extraction:', process.env.KEYCLOAK_URL);
    KEYCLOAK_ORIGIN = process.env.KEYCLOAK_URL; // Fallback to full string if parse fails
  }
}

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com", "'sha256-Ufh4gFF+3wijVQyJo86U1jiXhiwxTNfKBjPqBWLdvEY='"], // Allow inline scripts for Keycloak and Cloudflare Insights
        scriptSrcElem: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com", "'sha256-Ufh4gFF+3wijVQyJo86U1jiXhiwxTNfKBjPqBWLdvEY='"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", "https://cloudflareinsights.com", "https://static.cloudflareinsights.com", ...(KEYCLOAK_ORIGIN ? [KEYCLOAK_ORIGIN] : [])],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'", ...(KEYCLOAK_ORIGIN ? [KEYCLOAK_ORIGIN] : [])], // Allow Keycloak iframes
      },
    },
  })
);
app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      // Also allow "null" origin which can happen during corporate proxy redirects (e.g., Smoothwall)
      if (!requestOrigin || requestOrigin === 'null') return callback(null, true);

      // In development, allow any localhost or local IP
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // Production: Strict check against CORS_ORIGIN
      const allowedOriginsStr = process.env.CORS_ORIGIN || process.env.FRONTEND_DNS || 'http://localhost:3000';
      const allowedOrigins = allowedOriginsStr.split(',').map(o => o.trim().replace(/\/$/, ''));
      // Always allow local development origins to connect for easier debugging
      allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174');

      const cleanRequestOrigin = requestOrigin.replace(/\/$/, '');

      if (allowedOrigins.includes(cleanRequestOrigin)) {
        return callback(null, true);
      } else {
        console.error(`[CORS] Blocked request from origin: "${requestOrigin}"`);
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: false, // Disabled to allow flexible origins (*) behind corporate proxies
  })
);
app.use(compression()); // Enable gzip compression
// Request diagnostics must not copy URLs, query credentials, client addresses or headers.
app.use(morgan(':method :status :res[content-length] :response-time ms', {
  skip: (req) => req.url === '/auth/health/ready' || req.originalUrl === '/auth/health/ready'
}));
// A bounded default prevents any unauthenticated or authenticated route from
// allocating arbitrarily large JSON documents. Operators may raise this only
// when a known integration requires it.
const httpBodyLimit = process.env.HTTP_JSON_BODY_LIMIT || '2mb';
app.use(express.json({ limit: httpBodyLimit }));
app.use(express.urlencoded({ limit: httpBodyLimit, extended: true }));

import { publicStatusRouter } from './routes/publicStatus';
import { notificationsRouter } from './routes/notifications';
import { usersRouter } from './routes/users';
import { systemRouter } from './routes/system';
import { logRouter } from './routes/logs';
import { apmIngestRouter, apmAnalyticsRouter } from './routes/apm';
import { kubernetesRouter } from './routes/kubernetes';
import { telemetryRouter } from './routes/telemetry';
import { auditLogRouter } from './routes/auditLogs';
import { kubiRouter } from './routes/kubi';
import { rbacRouter } from './routes/rbac';
import { requireKubiAccess } from './middleware/kubiAccess';

import { KubernetesService } from './services/KubernetesService';
import { DatabaseFactory } from './database/DatabaseFactory';

// Public routes
app.use(`${BACKEND_CONTEXT_PATH}/api/health`, healthRouter);
app.use('/health', healthRouter);
app.use('/healthz', healthRouter);
if (FRONTEND_CONTEXT_PATH && FRONTEND_CONTEXT_PATH !== '') {
  app.use(`${FRONTEND_CONTEXT_PATH}/healthz`, healthRouter);
  app.use(`${FRONTEND_CONTEXT_PATH}/health`, healthRouter);
}
app.use(`${BACKEND_CONTEXT_PATH}/api/auth`, authRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/auth/webauthn`, authWebAuthnRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/public`, publicStatusRouter);
if (apmEnabled) {
  app.use(`${BACKEND_CONTEXT_PATH}/api/apm`, apmIngestRouter); // Authenticated OTLP ingestion
}
app.use(`${BACKEND_CONTEXT_PATH}/api/telemetry`, telemetryRouter); // Authenticated agent telemetry ingestion
if (apmEnabled) {
  app.use(`${BACKEND_CONTEXT_PATH}/api/apm`, authMiddleware, apmAnalyticsRouter); // Protected analytics routes
}

// Protected routes (with optional Keycloak auth)
app.use(`${BACKEND_CONTEXT_PATH}/api/services`, authMiddleware, servicesRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/notifications`, authMiddleware, notificationsRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/users`, authMiddleware, usersRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/system`, authMiddleware, systemRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/rbac`, authMiddleware, rbacRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/logs`, authMiddleware, logRouter); // Log Management
app.use(`${BACKEND_CONTEXT_PATH}/api/kubernetes`, authMiddleware, kubernetesRouter); // Kubernetes Monitoring
app.use(`${BACKEND_CONTEXT_PATH}/api/audit-logs`, authMiddleware, requirePermission('audit.read'), auditLogRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/kubi`, authMiddleware, requirePermission('kubi.use'), requireKubiAccess, kubiRouter);


// Serve frontend static files
const frontendPath = path.join(process.cwd(), 'public');
app.use(`${FRONTEND_CONTEXT_PATH}`, express.static(frontendPath));

// Fallback to index.html for client-side routing (Express 5 regex syntax)
const escapedFrontendContextPath = FRONTEND_CONTEXT_PATH.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
app.get(
  new RegExp(`^${escapedFrontendContextPath}/.*`),
  (req: Request, res: Response, next: express.NextFunction) => {
    // Don't override API routes or static files like favicon
    if (req.path.startsWith(`${BACKEND_CONTEXT_PATH}/api`) ||
      req.path.includes('.')) {
      return next(); // Let the final 404 handler catch it
    }

    const indexFile = path.join(frontendPath, 'index.html');
    res.sendFile(indexFile, (err) => {
      if (err) {
        next(); // If index.html is missing (like during dev), push to next error handler
      }
    });
  }
);

// Error handling
app.use(errorHandler);

// Initialize Service Monitor
const serviceMonitor = ServiceMonitor.getInstance();
const notificationManager = NotificationManager.getInstance();
import { SystemMonitorService } from './services/SystemMonitorService'; // Lazy import to avoid circular dependency issues if any
import { clickhouseService } from './services/ClickhouseService';
import { stopRetentionSweeps } from './utils/RetentionScheduler';
import { kubernetesMetricsScraper } from './services/KubernetesMetricsScraper';

const startServer = async () => {
  try {
    await serviceMonitor.initialize();
    await notificationManager.initialize();

    // Initialize Kubernetes Service in the background — never blocks startup.
    // Routes already guard with k8sService.available before doing anything.
    KubernetesService.getInstance().initialize().catch(error => console.warn('Background Kubernetes initialization failed.', error));

    // Initialize User Repository (triggers DB connection)
    await DatabaseFactory.getUserRepository();

    // Ensure ALL tables are created on startup
    await DatabaseFactory.getPasskeyRepository();
    await DatabaseFactory.getSystemRepository();
    await DatabaseFactory.getAuditLogRepository();
    await DatabaseFactory.getKubiConversationRepository();

    // Verify retention for every enabled telemetry adapter before accepting ingestion.
    const databaseType = (process.env.DB_TYPE || '').toLowerCase();
    if (clickhouseService.isConfigured()) {
      await clickhouseService.initialize();
      await DatabaseFactory.getTraceRepository();
      await DatabaseFactory.getLogRepository();
    } else if (['mongo', 'mongodb'].includes(databaseType)) {
      await DatabaseFactory.getTraceRepository();
      await DatabaseFactory.getLogRepository();
    } else if (['mysql', 'mariadb'].includes(databaseType)) {
      await DatabaseFactory.getTraceRepository();
    }

    // Start server
    // app.listen Replaced by httpServer.listen for Socket.IO support
    httpServer.listen(PORT, () => {
      console.log(`🚀 kubiq Backend running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

      // Initialize Log Stream Service with Socket.IO
      const logStreamService = LogStreamService.getInstance();
      logStreamService.initialize(io);
      console.log('📡 Socket.IO Server Initialized for Log Streaming');

      // Initialize Kubernetes Log Stream Service with Socket.IO
      const k8sService = KubernetesService.getInstance();
      const kubeLogStreamService = KubeLogStreamService.getInstance();
      kubeLogStreamService.initialize(io, k8sService.getKubeConfig());
      console.log('☸️  Socket.IO Server Initialized for K8s Pod Log Streaming');

      // Initialize Kubernetes Terminal Stream Service with Socket.IO

      const kubeTerminalStreamService = KubeTerminalStreamService.getInstance();
      kubeTerminalStreamService.initialize(io, k8sService.getKubeConfig(), k8sTerminalEnabled);
      if (k8sTerminalEnabled) {
        console.log('☸️  Socket.IO Server Initialized for K8s Pod Terminal Execution');
      } else {
        console.log('☸️  K8s Pod Terminal Execution is disabled via feature flag');
      }
      // Start monitoring services
      serviceMonitor.start();

      // Initialize Clickhouse and start K8s metrics scraper
      if (k8sMetricsHistoryEnabled && clickhouseService.isConfigured()) {
        clickhouseService.initialize().then(() => {
          kubernetesMetricsScraper.start();
        }).catch(err => console.error('Failed to initialize Clickhouse:', err));
      }

      // Start System Monitoring (Snapshot every 30 minutes)
      if (systemMetricsEnabled) {
        const systemMonitor = SystemMonitorService.getInstance();
        // Take one snapshot immediately (delayed slightly to ensure DB ready)
        setTimeout(() => systemMonitor.snapshot().catch(err => console.error('System Snapshot Error:', err)), 10000);

        setInterval(() => {
          systemMonitor.snapshot().catch(err => console.error('System Snapshot Error:', err));
        }, 30 * 60 * 1000); // 30 mins
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const completed = await shutdownRuntime({
    responses: activeResponses,
    stopBackground: () => { stopRetentionSweeps(); serviceMonitor.stop(); kubernetesMetricsScraper.stop(); },
    stopStreams: () => { io.disconnectSockets(true); },
    ingestion: IngestionBufferService.getInstance(),
    tracing,
    server: httpServer,
  });
  console.log('[shutdown]', { completed, ...tracing.diagnostics() });
  process.exit(completed ? 0 : 1);
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  shutdown().catch(() => { console.error('[shutdown] failed'); process.exit(1); });
});

export default app;
