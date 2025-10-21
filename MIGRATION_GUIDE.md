# Supabase Migration Guide

This guide will help you migrate your existing backend to Supabase.

## Prerequisites

1. Create a new Supabase project at [https://app.supabase.com](https://app.supabase.com)
2. Install the Supabase CLI: `npm install -g supabase`
3. Install the Supabase client library in your frontend: `npm install @supabase/supabase-js`

## Migration Steps

### 1. Database Setup

1. Run the SQL migration script from `supabase/migrations/20241001000000_initial_schema.sql` in your Supabase SQL editor
2. Set up storage buckets for user avatars and task images in the Supabase Storage section

### 2. Environment Variables

Add these environment variables to your frontend:

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-project-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Authentication

Replace your current authentication system with Supabase Auth:

```typescript
import { supabase } from './lib/supabase';

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    data: {
      first_name: 'John',
      last_name: 'Doe',
      phone_number: '+1234567890',
    },
  },
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password',
});

// Sign out
await supabase.auth.signOut();

// Get current user
const { data: { user } } = await supabase.auth.getUser();
```

### 4. Data Access

Replace your API calls with Supabase client calls:

```typescript
// Get tasks
const { data: tasks, error } = await supabase
  .from('tasks')
  .select('*')
  .eq('status', 'OPEN')
  .order('created_at', { ascending: false });

// Create task
const { data: task, error } = await supabase
  .from('tasks')
  .insert({
    title: 'Task title',
    description: 'Task description',
    category: 'CLEANING',
    budget: 5000, // in kobo
    poster_id: user.id,
  })
  .select()
  .single();
```

### 5. Real-time Subscriptions

Set up real-time subscriptions for chat and notifications:

```typescript
// Subscribe to task updates
const subscription = supabase
  .channel('task-updates')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'tasks',
      filter: 'hustler_id=eq.' + user.id,
    },
    (payload) => {
      console.log('Task update:', payload);
    }
  )
  .subscribe();

// Unsubscribe when done
subscription.unsubscribe();
```

### 6. Storage

Handle file uploads with Supabase Storage:

```typescript
// Upload file
const { data: uploadData, error: uploadError } = await supabase.storage
  .from('task-images')
  .upload(`task-${taskId}/${Date.now()}.jpg', file);

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('task-images')
  .getPublicUrl(uploadData.path);
```

## Next Steps

1. Test all authentication flows
2. Verify data consistency between old and new systems
3. Set up database backups in Supabase
4. Monitor performance and adjust RLS policies as needed

## Troubleshooting

- **Authentication issues**: Check your Supabase project's authentication settings and CORS configuration
- **RLS errors**: Verify your Row Level Security policies in the Supabase dashboard
- **Connection issues**: Ensure your network allows connections to Supabase's servers
