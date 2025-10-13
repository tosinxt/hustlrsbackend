# Hustlrs Backend API

Backend API for Hustlrs - A task marketplace like Uber for any service. Built with Node.js, Express, Prisma, and PostgreSQL.

## 🚀 Features

- **Authentication**: Phone number-based SMS verification
- **Task Management**: Create, browse, assign, and complete tasks
- **Real-time Chat**: Socket.IO powered messaging system
- **File Uploads**: Cloudinary integration for images
- **Location Services**: GPS-based task matching
- **Push Notifications**: Real-time updates
- **Rating System**: User reviews and ratings
- **Payment Integration**: Ready for Paystack/Flutterwave

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT tokens
- **Real-time**: Socket.IO
- **File Storage**: Cloudinary
- **SMS**: Twilio
- **Validation**: express-validator
- **Security**: Helmet, CORS, Rate limiting

## 📋 Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- Twilio account (for SMS)
- Cloudinary account (for images)

## 🔧 Installation

1. **Clone and navigate to backend directory**
   ```bash
   cd hustlrs-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

4. **Set up database**
   ```bash
   # Generate Prisma client
   npm run generate
   
   # Run database migrations
   npm run migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:5000`

## 📚 API Documentation

### Authentication Endpoints

- `POST /api/auth/send-code` - Send SMS verification code
- `POST /api/auth/verify-code` - Verify code and login/register
- `POST /api/auth/refresh-token` - Refresh JWT token
- `POST /api/auth/logout` - Logout user

### Task Endpoints

- `GET /api/tasks` - Get tasks with filters
- `POST /api/tasks` - Create new task
- `GET /api/tasks/:id` - Get single task
- `PUT /api/tasks/:id/assign` - Assign task to hustler
- `PUT /api/tasks/:id/status` - Update task status
- `GET /api/tasks/user/posted` - Get user's posted tasks
- `GET /api/tasks/user/assigned` - Get user's assigned tasks

### User Endpoints

- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/:id` - Get user by ID
- `GET /api/users/notifications` - Get user notifications
- `PUT /api/users/notifications/:id/read` - Mark notification as read
- `GET /api/users/stats` - Get user statistics

### Chat Endpoints

- `GET /api/chat/user-chats` - Get user's chats
- `GET /api/chat/:chatId/messages` - Get chat messages
- `POST /api/chat/:chatId/messages` - Send message
- `GET /api/chat/:chatId` - Get chat details

### Upload Endpoints

- `POST /api/upload/image` - Upload single image
- `POST /api/upload/multiple` - Upload multiple images
- `POST /api/upload/avatar` - Upload user avatar
- `DELETE /api/upload/image/:publicId` - Delete image

## 🔐 Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## 📱 Socket.IO Events

### Client to Server
- `join_chat` - Join a chat room
- `send_message` - Send a message
- `task_update` - Update task status

### Server to Client
- `new_message` - Receive new message
- `task_status_changed` - Task status updated

## 🗄️ Database Schema

The database includes the following main entities:

- **Users**: User profiles and authentication
- **Tasks**: Task postings and assignments
- **Chats**: Chat rooms for task coordination
- **Messages**: Chat messages
- **Reviews**: User ratings and reviews
- **Notifications**: Push notifications

## 🚀 Deployment

### Environment Variables for Production

```bash
NODE_ENV=production
DATABASE_URL=your_production_database_url
JWT_SECRET=your_production_jwt_secret
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

### Deploy to Railway/Heroku

1. **Set up database**
   ```bash
   npm run migrate
   ```

2. **Build and start**
   ```bash
   npm start
   ```

## 📊 API Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    // Validation errors (if any)
  ]
}
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm run migrate` - Run database migrations
- `npm run generate` - Generate Prisma client
- `npm run studio` - Open Prisma Studio
- `npm test` - Run tests

### Code Structure

```
src/
├── routes/          # API route handlers
├── middleware/      # Express middleware
├── utils/          # Utility functions
└── server.js       # Main server file

prisma/
├── schema.prisma   # Database schema
└── migrations/     # Database migrations
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, email support@hustlrs.com or create an issue in the repository.

---

Built with ❤️ for the Nigerian tech ecosystem
