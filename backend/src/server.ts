// Load environment variables FIRST before any imports
import dotenv from 'dotenv';
import path from 'path';

// Determine which .env file to load based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
const envPath = path.resolve(process.cwd(), envFile);

dotenv.config({ path: envPath });

console.log(`📋 Loading environment from: ${envFile}`);

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { servicesRouter } from './routes/services';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { ServiceMonitor } from './services/ServiceMonitor';

const app: Express = express();
const PORT = process.env.PORT || 3001;
const BACKEND_CONTEXT_PATH = process.env.BACKEND_CONTEXT_PATH || '';
const FRONTEND_CONTEXT_PATH = process.env.FRONTEND_CONTEXT_PATH || '';

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for Keycloak silent-check-sso.html
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://demo.cloud-tcshobs.com'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'", 'https://demo.cloud-tcshobs.com'], // Allow Keycloak iframes
      },
    },
  })
);
app.use(
  cors({
    origin: process.env.FRONTEND_DNS || process.env.CORS_ORIGIN || 'http://localhost:3000',
  })
);
app.use(compression()); // Enable gzip compression
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import { publicStatusRouter } from './routes/publicStatus';

// Public routes
app.use(`${BACKEND_CONTEXT_PATH}/api/health`, healthRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/auth`, authRouter);
app.use(`${BACKEND_CONTEXT_PATH}/api/public`, publicStatusRouter);

// Protected routes (with optional Keycloak auth)
app.use(`${BACKEND_CONTEXT_PATH}/api/services`, authMiddleware, servicesRouter);

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Kubiq Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start monitoring services
  serviceMonitor.start();
});

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
