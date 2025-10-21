import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../services/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Apply auth middleware to all upload routes
router.use(authMiddleware);

// Upload task images
router.post('/task', upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const userId = req.user.id;
    const uploadedFiles = [];

    // Process each uploaded file
    for (const file of req.files) {
      const fileExt = file.originalname.split('.').pop();
      const fileName = `tasks/${userId}/${uuidv4()}.${fileExt}`;
      
      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('task-images')
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        continue; // Skip this file and continue with others
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('task-images')
        .getPublicUrl(fileName);

      uploadedFiles.push({
        url: publicUrl,
        fileName,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      });
    }

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ message: 'Failed to upload files' });
    }

    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while uploading files',
    });
  }
});

// Delete a file from storage
router.delete('/:bucket/:fileName', async (req, res) => {
  try {
    const { bucket, fileName } = req.params;
    const userId = req.user.id;

    // Validate bucket name
    if (!['task-images', 'user-avatars'].includes(bucket)) {
      return res.status(400).json({ message: 'Invalid bucket name' });
    }

    // For security, verify the user has permission to delete this file
    // For user avatars, check if the file belongs to the user
    if (bucket === 'user-avatars' && !fileName.startsWith(`avatars/${userId}-`)) {
      return res.status(403).json({ message: 'Not authorized to delete this file' });
    }

    // For task images, check if the task belongs to the user
    if (bucket === 'task-images' && fileName.startsWith(`tasks/${userId}/`)) {
      return res.status(403).json({ message: 'Not authorized to delete this file' });
    }

    // Delete the file
    const { error } = await supabase.storage
      .from(bucket)
      .remove([fileName]);

    if (error) throw error;

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while deleting the file',
    });
  }
});

// Get a signed URL for direct uploads
router.post('/signed-url', async (req, res) => {
  try {
    const { fileName, contentType, bucket = 'task-images' } = req.body;
    const userId = req.user.id;

    if (!fileName || !contentType) {
      return res.status(400).json({ message: 'File name and content type are required' });
    }

    // Validate bucket name
    if (!['task-images', 'user-avatars'].includes(bucket)) {
      return res.status(400).json({ message: 'Invalid bucket name' });
    }

    // Generate a unique file name
    const fileExt = fileName.split('.').pop();
    const uniqueFileName = `${bucket === 'user-avatars' ? 'avatars' : 'tasks'}/${userId}/${uuidv4()}.${fileExt}`;

    // Generate a signed URL for direct upload
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(uniqueFileName);

    if (error) throw error;

    res.json({
      signedUrl: data.signedUrl,
      path: uniqueFileName,
      publicUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${uniqueFileName}`,
    });
  } catch (error) {
    console.error('Generate signed URL error:', error);
    res.status(500).json({
      message: error.message || 'An error occurred while generating signed URL',
    });
  }
});

export default router;
