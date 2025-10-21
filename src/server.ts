import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { supabase } from './services/supabase';

// Import routes
import authRouter from './routes/auth';
import taskRouter from './routes/tasks';
import userRouter from './routes/users';
import chatRouter from './routes/chat';
import uploadRouter from './routes/upload';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';

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
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(limiter);
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || 'http://localhost:3000',
      'http://192.168.0.128:3000',
      'http://localhost:19006',
      'http://192.168.0.128:19006',
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/tasks', authMiddleware, taskRouter);
app.use('/api/users', authMiddleware, userRouter);
app.use('/api/chats', authMiddleware, chatRouter);
app.use('/api/upload', authMiddleware, uploadRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: 'Not Found' });
});

// Error handling middleware
app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected');

  // Join room for a specific chat
  socket.on('join_chat', (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`User joined chat: ${chatId}`);
  });

  // Handle new messages
  socket.on('send_message', async (data) => {
    try {
      const { chatId, message, senderId } = data;

      // Save message to database
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: senderId,
          content: message.content,
          type: message.type || 'TEXT',
        })
        .select()
        .single();

      if (error) throw error;

      // Broadcast to all clients in the chat room
      io.to(`chat_${chatId}`).emit('new_message', newMessage);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Handle task updates
  socket.on('task_updated', (task) => {
    io.emit('task_update', task);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const { data, error } = await supabase.from('tasks').select('*').limit(1);
    
    if (error) {
      console.error('Error connecting to Supabase:', error);
      process.exit(1);
    }

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Rejection:', err);
  // Close server & exit process
  server.close(() => process.exit(1));
});

export { app, server };
