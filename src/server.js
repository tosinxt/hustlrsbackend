import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { supabase } from './services/supabase.js';

// Import routes
import authRouter from './routes/auth.js';
import taskRouter from './routes/tasks.js';
import userRouter from './routes/users.js';
import chatRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

dotenv.config();

const app = express();
const server = createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: [
      process.env.CLIENT_URL || 'http://localhost:3000',
      'http://192.168.0.128:3000',
      'http://localhost:19006',
      'http://192.168.0.128:19006',
    ],
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 5000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  trustProxy: true, // Trust the X-Forwarded-For header
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Trust first proxy (Render's load balancer)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://192.168.0.128:3000',
    'http://localhost:19006',
    'http://192.168.0.128:19006',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(morgan('dev'));
app.use(limiter);

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`User joined room: ${roomId}`);
  });

  socket.on('send_message', (data) => {
    io.to(data.roomId).emit('receive_message', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Make io accessible to routes
app.set('io', io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/tasks', authMiddleware, taskRouter);
app.use('/api/users', authMiddleware, userRouter);
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/upload', authMiddleware, uploadRouter);

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to Hustlrs API',
    documentation: 'https://hustlrsbackend.onrender.com/api-docs',
    status: 'operational',
    version: '1.0.0'
  });
});

// 404 handler
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
});

// Error handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Test database connection
    await supabase.from('users').select('*').limit(1);
    console.log('Connected to Supabase');

    server.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`API documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1);
  }
}

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err);
  process.exit(1);
});
