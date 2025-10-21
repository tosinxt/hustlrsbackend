import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { supabase } from '../services/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Apply auth middleware to all chat routes
router.use(authMiddleware);

// Get all chats for the current user
router.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const userId = req.user.id;

    // Get all chats where the user is a member
    const { data: chats, error } = await supabase
      .from('chat_members')
      .select('chat:chats(*, task:tasks(*, poster:users(id, first_name, last_name, avatar_url)))')
      .eq('user_id', userId);

    if (error) throw error;

    // Format the response
    const formattedChats = chats.map(chatMember => ({
      id: chatMember.chat.id,
      task: chatMember.chat.task,
      createdAt: chatMember.chat.created_at,
      updatedAt: chatMember.chat.updated_at,
    }));

    res.json(formattedChats);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while fetching chats',
    });
  }
});

// Get a single chat with messages
router.get(
  '/:chatId',
  [param('chatId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { chatId } = req.params;
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const userId = req.user.id;

      // Verify the user is a member of this chat
      const { data: chatMember, error: memberError } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .single();

      if (memberError || !chatMember) {
        return res.status(403).json({ message: 'Not authorized to view this chat' });
      }

      // Get chat details with messages
      const { data: chat, error: chatError } = await supabase
        .from('chats')
        .select(`
          *,
          task:tasks(*, poster:users(*)),
          messages:messages(*, sender:users(id, first_name, last_name, avatar_url))
        `)
        .eq('id', chatId)
        .single();

      if (chatError) throw chatError;
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }

      res.json(chat);
    } catch (error) {
      console.error('Get chat error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while fetching the chat',
      });
    }
  }
);

// Send a message in a chat
router.post(
  '/:chatId/messages',
  [
    param('chatId').isUUID(),
    body('content').isString().trim().notEmpty(),
    body('type').optional().isIn(['TEXT', 'IMAGE', 'SYSTEM']).default('TEXT'),
  ],
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { chatId } = req.params;
      const { content, type = 'TEXT' } = req.body;
      const userId = req.user.id;

      // Verify the user is a member of this chat
      const { data: chatMember, error: memberError } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .single();

      if (memberError || !chatMember) {
        return res.status(403).json({ message: 'Not authorized to send messages in this chat' });
      }

      // Create the message
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: userId,
          content,
          type,
        })
        .select('*, sender:users(id, first_name, last_name, avatar_url)')
        .single();

      if (messageError) throw messageError;

      // Update chat's updated_at timestamp
      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);

      // Emit real-time event
      req.app.get('io').to(`chat_${chatId}`).emit('new_message', message);

      res.status(201).json(message);
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while sending the message',
      });
    }
  }
);

// Get chat messages with pagination
router.get(
  '/:chatId/messages',
  [
    param('chatId').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }).default(50),
    query('offset').optional().isInt({ min: 0 }).default(0),
  ],
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { chatId } = req.params;
      // Convert limit and offset to numbers with default values
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
      const userId = req.user.id;

      // Verify the user is a member of this chat
      const { data: chatMember, error: memberError } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .single();

      if (memberError || !chatMember) {
        return res.status(403).json({ message: 'Not authorized to view this chat' });
      }

      // Get messages with pagination
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*, sender:users(id, first_name, last_name, avatar_url)')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (messagesError) throw messagesError;

      res.json(messages.reverse()); // Return oldest first
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while fetching messages',
      });
    }
  }
);

// Mark messages as read
router.post(
  '/:chatId/messages/read',
  [param('chatId').isUUID()],
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { chatId } = req.params;
      const userId = req.user.id;

      // Mark all messages in this chat as read for the current user
      const { error: updateError } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('chat_id', chatId)
        .neq('sender_id', userId);

      if (updateError) throw updateError;

      res.json({ success: true });
    } catch (error) {
      console.error('Mark messages as read error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while marking messages as read',
      });
    }
  }
);

export default router;
