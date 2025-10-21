import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { supabase } from '../services/supabase';
import { authMiddleware, isHustler, isCustomer } from '../middleware/auth';

export const router = Router();

// Apply auth middleware to all user routes
router.use(authMiddleware);

// Get current user profile
router.get('/me', async (req: any, res) => {
  try {
    const userId = req.user.id;

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Remove sensitive data
    const { password_hash, ...userData } = user;

    res.json(userData);
  } catch (error: any) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while fetching your profile',
    });
  }
});

// Update current user profile
router.put(
  '/me',
  [
    body('firstName').optional().isString().trim().notEmpty(),
    body('lastName').optional().isString().trim().notEmpty(),
    body('email').optional().isEmail(),
    body('phoneNumber').optional().isString().trim(),
    body('bio').optional().isString(),
    body('skills').optional().isArray(),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('address').optional().isString(),
    body('city').optional().isString(),
    body('state').optional().isString(),
    body('country').optional().isString(),
    body('avatarUrl').optional().isString(),
  ],
  async (req: any, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const updates = { ...req.body };

      // Map request body to database fields
      const mappedUpdates: any = {};
      if (updates.firstName) mappedUpdates.first_name = updates.firstName;
      if (updates.lastName) mappedUpdates.last_name = updates.lastName;
      if (updates.email) mappedUpdates.email = updates.email;
      if (updates.phoneNumber) mappedUpdates.phone_number = updates.phoneNumber;
      if (updates.bio) mappedUpdates.bio = updates.bio;
      if (updates.skills) mappedUpdates.skills = updates.skills;
      if (updates.latitude) mappedUpdates.latitude = updates.latitude;
      if (updates.longitude) mappedUpdates.longitude = updates.longitude;
      if (updates.address) mappedUpdates.address = updates.address;
      if (updates.city) mappedUpdates.city = updates.city;
      if (updates.state) mappedUpdates.state = updates.state;
      if (updates.country) mappedUpdates.country = updates.country;
      if (updates.avatarUrl) mappedUpdates.avatar_url = updates.avatarUrl;

      // Update user in the database
      const { data: user, error } = await supabase
        .from('users')
        .update(mappedUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      // Remove sensitive data
      const { password_hash, ...userData } = user;

      res.json(userData);
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while updating your profile',
      });
    }
  }
);

// Update user password
router.put(
  '/me/password',
  [
    body('currentPassword').isString().notEmpty(),
    body('newPassword').isString().min(6),
  ],
  async (req: any, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      // Get user with password hash
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError) throw fetchError;
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Verify current password
      const { data: authUser, error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (authError) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      res.json({ message: 'Password updated successfully' });
    } catch (error: any) {
      console.error('Update password error:', error);
      res.status(500).json({
        message: error.message || 'An error occurred while updating your password',
      });
    }
  }
);

// Get user by ID (public profile)
router.get('/:id', [param('id').isUUID()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, avatar_url, bio, skills, rating, total_rating, tasks_completed, created_at')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while fetching the user',
    });
  }
});

// Get user reviews
router.get('/:id/reviews', [param('id').isUUID()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('*, author:users!reviews_author_id_fkey(id, first_name, last_name, avatar_url)')
      .eq('target_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(reviews);
  } catch (error: any) {
    console.error('Get user reviews error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while fetching user reviews',
    });
  }
});

// Upload user avatar
router.post('/me/avatar', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { file } = req.files || {};

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload file to Supabase Storage
    const fileExt = file.originalname.split('.').pop();
    const fileName = `avatars/${userId}-${Date.now()}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('user-avatars')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('user-avatars')
      .getPublicUrl(fileName);

    // Update user's avatar URL
    const { data: user, error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Remove sensitive data
    const { password_hash, ...userData } = user;

    res.json(userData);
  } catch (error: any) {
    console.error('Upload avatar error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while uploading your avatar',
    });
  }
});

// Delete user account
router.delete('/me', async (req: any, res) => {
  try {
    const userId = req.user.id;

    // Delete user from auth
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) throw authError;

    // Delete user from database
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (deleteError) throw deleteError;

    res.json({ message: 'Account deleted successfully' });
  } catch (error: any) {
    console.error('Delete account error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while deleting your account',
    });
  }
});

export default router;
