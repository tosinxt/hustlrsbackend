import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Initialize Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: false, // We'll handle session persistence in the client
    },
  }
);

// Re-export Supabase types for convenience
export type { User } from '@supabase/supabase-js';

// Helper function to handle Supabase errors
const handleError = (error: any) => {
  console.error('Supabase error:', error);
  throw new Error(error.message || 'An error occurred');
};

// User operations
export const userService = {
  // Get user profile
  getProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) handleError(error);
    return data;
  },

  // Update user profile
  updateProfile: async (userId: string, updates: any) => {
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
  createTask: async (taskData: any) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single();
    
    if (error) handleError(error);
    return data;
  },

  // Get tasks with filters
  getTasks: async (filters: any = {}) => {
    let query = supabase
      .from('tasks')
      .select('*');
    
    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        query = query.eq(key, value);
      }
    });
    
    const { data, error } = await query;
    if (error) handleError(error);
    return data;
  },

  // Update a task
  updateTask: async (taskId: string, updates: any) => {
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
  getOrCreateChat: async (taskId: string, userId: string) => {
    // First try to get existing chat
    const { data: existingChat } = await supabase
      .from('chats')
      .select('*')
      .eq('task_id', taskId)
      .single();
    
    if (existingChat) return existingChat;
    
    // Create new chat if it doesn't exist
    const { data: newChat, error } = await supabase
      .from('chats')
      .insert({ task_id: taskId })
      .select()
      .single();
    
    if (error) handleError(error);
    
    // Add task poster to chat
    await supabase
      .from('chat_members')
      .insert({ chat_id: newChat.id, user_id: userId });
    
    return newChat;
  },

  // Send message
  sendMessage: async (chatId: string, senderId: string, content: string, type = 'TEXT') => {
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
  getMessages: async (chatId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    
    if (error) handleError(error);
    return data;
  },
};

// Review operations
export const reviewService = {
  // Create a review
  createReview: async (reviewData: any) => {
    const { data, error } = await supabase
      .from('reviews')
      .insert(reviewData)
      .select()
      .single();
    
    if (error) handleError(error);
    
    // Update user's rating
    await supabase.rpc('update_user_rating', {
      user_id: reviewData.target_id,
    });
    
    return data;
  },

  // Get reviews for a user
  getUserReviews: async (userId: string) => {
    const { data, error } = await supabase
      .from('reviews')
      .select('*, author:users!reviews_author_id_fkey(*)')
      .eq('target_id', userId);
    
    if (error) handleError(error);
    return data;
  },
};

// Real-time subscriptions
export const realtimeService = {
  // Subscribe to task updates
  subscribeToTask: (taskId: string, callback: (payload: any) => void) => {
    return supabase
      .channel('task-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        (payload) => callback(payload)
      )
      .subscribe();
  },

  // Subscribe to chat messages
  subscribeToChat: (chatId: string, callback: (payload: any) => void) => {
    return supabase
      .channel('chat-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => callback(payload)
      )
      .subscribe();
  },
};

// Storage operations
export const storageService = {
  // Upload file to storage
  uploadFile: async (bucket: string, path: string, file: File | Blob) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file);
    
    if (error) handleError(error);
    return data;
  },

  // Get public URL for a file
  getPublicUrl: (bucket: string, path: string) => {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    
    return data.publicUrl;
  },

  // Delete a file
  deleteFile: async (bucket: string, path: string) => {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);
    
    if (error) handleError(error);
  },
};

// Export all services for easy importing
export default {
  supabase,
  userService,
  taskService,
  chatService,
  reviewService,
  realtimeService,
  storageService,
};
