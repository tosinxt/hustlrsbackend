import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { supabase } from '../services/supabase';
import { authMiddleware } from '../middleware/auth';

interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  poster_id: string;
  hustler_id?: string;
  deadline?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  city?: string;
  state?: string;
  image_urls?: string[];
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
  rating?: number;
  user_type: 'CUSTOMER' | 'HUSTLER' | 'BOTH';
}

// Extend the Express Request type to include our custom properties
declare global {
  namespace Express {
    // This matches the existing user type from the auth middleware
    interface Request {
      user?: {
        id: string;
        email: string;
        user_type: string;
      };
    }
  }
}

interface TaskRequestBody {
  title?: string;
  description?: string;
  category?: string;
  budget?: number;
  status?: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  hustlerId?: string;
  deadline?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  city?: string;
  state?: string;
  imageUrls?: string[];
}

interface TaskQueryParams {
  status?: string;
  category?: string;
  minBudget?: string;
  maxBudget?: string;
  [key: string]: string | undefined;
}

export const router = Router();

// Apply auth middleware to all task routes
router.use(authMiddleware);

// Get all tasks with optional filters
router.get<{}, any, any, TaskQueryParams>('/', async (req: Request, res: Response) => {
  try {
    const { status, category, minBudget, maxBudget } = req.query as TaskQueryParams;
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const userId = user.id;

    let query = supabase
      .from('tasks')
      .select('*, poster:users!tasks_poster_id_fkey(id, first_name, last_name, avatar_url, rating)');

    // Apply filters
    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (minBudget) query = query.gte('budget', minBudget);
    if (maxBudget) query = query.lte('budget', maxBudget);

    // Don't show user's own tasks in the feed
    query = query.neq('poster_id', userId);

    // Only show open tasks in the main feed
    if (!status) {
      query = query.eq('status', 'OPEN');
    }

    const { data: tasks, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json(tasks);
  } catch (error: any) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while fetching tasks',
    });
  }
});

// Get a single task by ID
router.get<{ id: string }>(
  '/:id',
  [param('id').isUUID()],
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      const { data: task, error } = await supabase
        .from('tasks')
        .select('*, poster:users!tasks_poster_id_fkey(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      res.json(task);
    } catch (error: any) {
      console.error('Get task error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while fetching the task',
      });
    }
  }
);

// Create a new task
router.post<{}, any, TaskRequestBody>(
  '/',
  [
    body('title').isString().trim().notEmpty(),
    body('description').isString().trim().notEmpty(),
    body('category').isString().notEmpty(),
    body('budget').isInt({ min: 0 }),
    body('deadline').optional().isISO8601(),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('address').optional().isString(),
    body('city').optional().isString(),
    body('state').optional().isString(),
    body('imageUrls').optional().isArray(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const userId = user.id;
      const {
        title,
        description,
        category,
        budget,
        deadline,
        latitude,
        longitude,
        address,
        city,
        state,
        imageUrls = [],
      } = req.body as TaskRequestBody;

      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          title,
          description,
          category,
          budget,
          deadline,
          latitude,
          longitude,
          address,
          city,
          state,
          poster_id: userId,
          image_urls: imageUrls,
          status: 'OPEN',
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json(task);
    } catch (error: any) {
      console.error('Create task error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while creating the task',
      });
    }
  }
);

// Update a task
router.put<{ id: string }, any, TaskRequestBody>(
  '/:id',
  [
    param('id').isUUID(),
    body('title').optional().isString().trim().notEmpty(),
    body('description').optional().isString().trim().notEmpty(),
    body('status').optional().isIn(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    body('hustlerId').optional().isUUID(),
  ],
  async (req: Request<{ id: string }, any, TaskRequestBody>, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const id = req.params.id as string;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const userId = user.id;
      const updates = { ...req.body };

      // Only the task poster can update the task
      const { data: existingTask, error: fetchError } = await supabase
        .from('tasks')
        .select('poster_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!existingTask) {
        return res.status(404).json({ message: 'Task not found' });
      }
      if (existingTask.poster_id !== userId) {
        return res.status(403).json({ message: 'Not authorized to update this task' });
      }

      // If assigning a hustler, verify they exist and are a hustler
      if (updates.hustlerId) {
        const { data: hustler, error: hustlerError } = await supabase
          .from('users')
          .select('user_type')
          .eq('id', updates.hustlerId)
          .single();

        if (hustlerError) throw hustlerError;
        if (!['HUSTLER', 'BOTH'].includes(hustler.user_type)) {
          return res.status(400).json({ message: 'Assigned user is not a hustler' });
        }

        updates.status = 'ASSIGNED';
      }

      const { data: task, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json(task);
    } catch (error: any) {
      console.error('Update task error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while updating the task',
      });
    }
  }
);

// Delete a task
router.delete<{ id: string }>(
  '/:id',
  [param('id').isUUID()],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const userId = user.id;

      // Only the task poster can delete the task
      const { data: existingTask, error: fetchError } = await supabase
        .from('tasks')
        .select('poster_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!existingTask) {
        return res.status(404).json({ message: 'Task not found' });
      }
      if (existingTask.poster_id !== userId) {
        return res.status(403).json({ message: 'Not authorized to delete this task' });
      }

      // Delete the task
      const { error } = await supabase.from('tasks').delete().eq('id', id);

      if (error) throw error;

      res.json({ message: 'Task deleted successfully' });
    } catch (error: any) {
      console.error('Delete task error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while deleting the task',
      });
    }
  }
);

// Get tasks posted by the current user
router.get('/my/tasks', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const userId = user.id;

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('poster_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(tasks);
  } catch (error: any) {
    console.error('Get my tasks error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while fetching your tasks',
    });
  }
});

// Get tasks assigned to the current user
router.get('/my/assigned', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const userId = user.id;

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('hustler_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(tasks);
  } catch (error: any) {
    console.error('Get assigned tasks error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while fetching assigned tasks',
    });
  }
});

export default router;
