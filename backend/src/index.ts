import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { testConnection } from './config/database';
import { env, validateRuntimeEnv } from './config/env';
import { errorHandler } from './middleware/errorHandler';

// Import route modules
import authRoutes from './modules/auth/auth.routes';
import teacherRoutes from './modules/teacher/teacher.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import assessmentRoutes from './modules/assessments/assessment.routes';
import publicRoutes from './modules/public/public.routes';
import adminRoutes from './modules/admin/admin.routes';
import studentRoutes from './modules/student/student.routes';
import librarianRoutes from './modules/librarian/librarian.routes';
import registrarRoutes from './modules/registrar/registrar.routes';
import parentRoutes from './modules/parent/parent.routes';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

validateRuntimeEnv();

const app = express();
const PORT = env.PORT;
const allowedOrigins = env.CORS_ORIGINS;

app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  }
}));

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  credentials: true
}));

app.use((req, res, next) => express.json({
  limit: req.method === 'POST' && req.path === '/api/v1/admin/students' ? '28mb' : '8mb'
})(req, res, next));

// Request tracking ID
app.use((req, _res, next) => {
  req.requestId = (req.headers['x-request-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  next();
});

// Health check endpoint
app.get('/api/v1/health', async (_req, res) => {
  const dbOk = await testConnection();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'degraded',
    database: dbOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Mount Module Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/teacher', teacherRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/assessments', assessmentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/student', studentRoutes);
app.use('/api/v1/librarian', librarianRoutes);
app.use('/api/v1/registrar', registrarRoutes);
app.use('/api/v1/parent', parentRoutes);

// Global Error Handler
app.use(errorHandler);

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`===============================================`);
    console.log(`🚀 HSPSMS Backend running on http://localhost:${PORT}`);
    console.log(`📡 API Mounted at http://localhost:${PORT}/api/v1`);
    const dbOk = await testConnection();
    console.log(`🗄️  Database Status: ${dbOk ? 'CONNECTED (MySQL 8)' : 'FAILED TO CONNECT'}`);
    console.log(`===============================================`);
  });
}

export default app;
