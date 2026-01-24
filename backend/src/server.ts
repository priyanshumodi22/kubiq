// Load environment variables FIRST before any imports
import dotenv from 'dotenv';
import path from 'path';

// Determine which .env file to load based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
const envPath = path.resolve(process.cwd(), envFile);

dotenv.config({ path: envPath, override: true });

console.log(`📋 Loading environment from: ${envFile}`);

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { servicesRouter } from './routes/services';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import authWebAuthnRouter from './routes/auth-webauthn';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { ServiceMonitor } from './services/ServiceMonitor';
import { NotificationManager } from './services/NotificationManager';

import { createServer } from 'http';
import { Server } from 'socket.io';
import { LogStreamService } from './services/LogStreamService';

const app: Express = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;
const BACKEND_CONTEXT_PATH = process.env.BACKEND_CONTEXT_PATH || '';
const FRONTEND_CONTEXT_PATH = process.env.FRONTEND_CONTEXT_PATH || '';

// Socket.IO Setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_DNS || process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ["GET", "POST"],
    credentials: true
  },
  path: `${BACKEND_CONTEXT_PATH}/socket.io` // Use context path if set
});

// Extract Origin (Domain) from KEYCLOAK_URL for CSP
// We want to allow the whole domain (e.g. https://demo.cloud-tcshobs.com), not just /auth path
let KEYCLOAK_ORIGIN = '';
if (process.env.KEYCLOAK_URL) {
  try {
    KEYCLOAK_ORIGIN = new URL(process.env.KEYCLOAK_URL).origin;
  } catch (e) {
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
        scriptSrc: ["'self'", "'unsafe-inline'", "'sha256-Ufh4gFF+3wijVQyJo86U1jiXhiwxTNfKBjPqBWLdvEY='"], // Allow inline scripts for Keycloak silent-check-sso.html
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...(KEYCLOAK_ORIGIN ? [KEYCLOAK_ORIGIN] : [])],
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
      if (!requestOrigin) return callback(null, true);
      
      // In development, allow any localhost or local IP
      if (process.env.NODE_ENV !== 'production') {
         return callback(null, true);
      }

      // Production: Strict check against CORS_ORIGIN
      const allowedOrigin = process.env.FRONTEND_DNS || process.env.CORS_ORIGIN || 'http://localhost:3000';
      if (requestOrigin === allowedOrigin) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Required for cookies/sessions
  })
);
app.use(compression()); // Enable gzip compression
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import { publicStatusRouter } from './routes/publicStatus';
import { notificationsRouter } from './routes/notifications';
import { usersRouter } from './routes/users';
import { systemRouter } from './routes/system';
import { logRouter } from './routes/logs';
import { DatabaseFactory } from './database/DatabaseFactory';

// Public routes
app.use(`${BACKEND_CONTEXT_PATH}/api/health`, healthRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/auth`, authRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/auth/webauthn`, authWebAuthnRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/public`, publicStatusRouter);

// Protected routes (with optional Keycloak auth)
app.use(`${BACKEND_CONTEXT_PATH}/api/services`, authMiddleware, servicesRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/notifications`, authMiddleware, notificationsRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/users`, authMiddleware, usersRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/system`, authMiddleware, systemRouter); 
app.use(`${BACKEND_CONTEXT_PATH}/api/logs`, authMiddleware, logRouter); // Log Management

// Serve frontend static files
const frontendPath = path.join(__dirname, '../public');
app.use(`${FRONTEND_CONTEXT_PATH}`, express.static(frontendPath));

// Fallback to index.html for client-side routing (Express 5 regex syntax)
app.get(
  new RegExp(`^${FRONTEND_CONTEXT_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*`),
  (req: Request, res: Response) => {
    // Don't override API routes
    if (req.path.startsWith(`${BACKEND_CONTEXT_PATH}/api`)) {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
);

// Error handling
app.use(errorHandler);

// Initialize Service Monitor
const serviceMonitor = ServiceMonitor.getInstance();
const notificationManager = NotificationManager.getInstance();
import { SystemMonitorService } from './services/SystemMonitorService'; // Lazy import to avoid circular dependency issues if any

const startServer = async () => {
    try {
        await serviceMonitor.initialize();
        await notificationManager.initialize();
        // Initialize User Repository (triggers DB connection)
        await DatabaseFactory.getUserRepository();
        
        // Start server
        // app.listen Replaced by httpServer.listen for Socket.IO support
        httpServer.listen(PORT, () => {
          console.log(`🚀 Kubiq Backend running on port ${PORT}`);
          console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
          
          // Initialize Log Stream Service with Socket.IO
          const logStreamService = LogStreamService.getInstance();
          logStreamService.initialize(io);
          console.log('📡 Socket.IO Server Initialized for Log Streaming');
        
          // Start monitoring services
          serviceMonitor.start();

          // Start System Monitoring (Snapshot every 30 minutes)
          const systemMonitor = SystemMonitorService.getInstance();
          // Take one snapshot immediately (delayed slightly to ensure DB ready)
          setTimeout(() => systemMonitor.snapshot().catch(err => console.error('System Snapshot Error:', err)), 10000);
          
          setInterval(() => {
              systemMonitor.snapshot().catch(err => console.error('System Snapshot Error:', err));
          }, 30 * 60 * 1000); // 30 mins
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  serviceMonitor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  serviceMonitor.stop();
  process.exit(0);
});

export default app;
