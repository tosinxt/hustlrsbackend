import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      flowType: 'pkce',
    },
  }
);

// Initialize Admin client for server-side operations
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Helper function to handle Supabase errors
const handleError = (error) => {
  console.error('Supabase error:', error);
  throw new Error(error.message || 'An error occurred');
};

// User operations
export const userService = {
  // Get user profile
  getProfile: async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) handleError(error);
    return data;
  },

  // Update user profile
  updateProfile: async (userId, updates) => {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) handleError(error);
    return data;
  },
};

// Task operations
export const taskService = {
  // Create a new task
  createTask: async (taskData) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single();
    
    if (error) handleError(error);
    return data;
  },

  // Get tasks with filters
  getTasks: async (filters = {}) => {
    let query = supabase.from('tasks').select('*');
    
    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });
    
    const { data, error } = await query;
    if (error) handleError(error);
    return data || [];
  },

  // Update a task
  updateTask: async (taskId, updates) => {
    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single();
    
    if (error) handleError(error);
    return data;
  },
};

// Chat operations
export const chatService = {
  // Create or get chat for a task
  getOrCreateChat: async (taskId, userId) => {
    // Check if chat already exists
    const { data: existingChat, error: findError } = await supabase
      .from('chats')
      .select('*')
      .eq('task_id', taskId)
      .single();

    if (findError && findError.code !== 'PGRST116') { // PGRST116 = not found
      handleError(findError);
    }

    if (existingChat) return existingChat;

    // Create new chat if not exists
    const { data: newChat, error: createError } = await supabase
      .from('chats')
      .insert({
        task_id: taskId,
        created_by: userId,
      })
      .select()
      .single();

    if (createError) handleError(createError);
    return newChat;
  },

  // Send message
  sendMessage: async (chatId, senderId, content, type = 'TEXT') => {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: senderId,
        content,
        type,
      })
      .select()
      .single();
    
    if (error) handleError(error);
    return data;
  },

  // Get messages for a chat
  getMessages: async (chatId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    
    if (error) handleError(error);
    return data || [];
  },
};

// Review operations
export const reviewService = {
  // Create a review
  createReview: async (reviewData) => {
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        task_id: reviewData.taskId,
        reviewer_id: reviewData.reviewerId,
        reviewee_id: reviewData.revieweeId,
        rating: reviewData.rating,
        comment: reviewData.comment,
      })
      .select()
      .single();
    
    if (error) handleError(error);
    return data;
  },

  // Get reviews for a user
  getUserReviews: async (userId) => {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('reviewee_id', userId);
    
    if (error) handleError(error);
    return data || [];
  },
};

// Real-time subscriptions
export const realtimeService = {
  // Subscribe to task updates
  subscribeToTask: (taskId, callback) => {
    const subscription = supabase
      .channel(`task:${taskId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `id=eq.${taskId}`,
      }, callback)
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  },

  // Subscribe to chat messages
  subscribeToChat: (chatId, callback) => {
    const subscription = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      }, callback)
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  },
};

// Storage operations
export const storageService = {
  // Upload file to storage
  uploadFile: async (bucket, path, file) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file);
    
    if (error) handleError(error);
    return data;
  },

  // Get public URL for a file
  getPublicUrl: (bucket, path) => {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    
    return data.publicUrl;
  },

  // Delete a file
  deleteFile: async (bucket, path) => {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);
    
    if (error) handleError(error);
    return true;
  },
};

// Export all services for easy importing
export default {
  supabase,
  supabaseAdmin,
  userService,
  taskService,
  chatService,
  reviewService,
  realtimeService,
  storageService,
};
