const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Private
 */
router.post('/', authenticateToken, [
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .isIn(['SHOPPING', 'CLEANING', 'BARBING', 'WRITING', 'DELIVERY', 'REPAIRS', 'OTHER'])
    .withMessage('Invalid category'),
  body('budget')
    .isInt({ min: 100 })
    .withMessage('Budget must be at least ₦1 (100 kobo)'),
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

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
      images,
      priority
    } = req.body;

    const task = await prisma.task.create({
      data: {
        title,
        description,
        category,
        budget: parseInt(budget),
        deadline: deadline ? new Date(deadline) : null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        address,
        city,
        state,
        images: images || [],
        priority: priority || 'NORMAL',
        posterId: req.user.userId
      },
      include: {
        poster: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rating: true,
            avatar: true
          }
        }
      }
    });

    // Create notification for nearby hustlers (implement later)
    // await notifyNearbyHustlers(task);

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create task'
    });
  }
});

/**
 * @route   GET /api/tasks
 * @desc    Get tasks with filters
 * @access  Public
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('category').optional().isIn(['SHOPPING', 'CLEANING', 'BARBING', 'WRITING', 'DELIVERY', 'REPAIRS', 'OTHER']),
  query('status').optional().isIn(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  query('latitude').optional().isFloat({ min: -90, max: 90 }),
  query('longitude').optional().isFloat({ min: -180, max: 180 }),
  query('radius').optional().isFloat({ min: 0.1, max: 100 }).withMessage('Radius must be between 0.1 and 100 km')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      category,
      status = 'OPEN',
      latitude,
      longitude,
      radius = 10,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = {
      status: status.toUpperCase()
    };

    if (category) {
      where.category = category.toUpperCase();
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // For location-based filtering, we'll use a simple bounding box
    // In production, consider using PostGIS for more accurate distance calculations
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const radiusInDegrees = parseFloat(radius) / 111; // Rough conversion: 1 degree ≈ 111 km

      where.latitude = {
        gte: lat - radiusInDegrees,
        lte: lat + radiusInDegrees
      };
      where.longitude = {
        gte: lng - radiusInDegrees,
        lte: lng + radiusInDegrees
      };
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ],
        include: {
          poster: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rating: true,
              avatar: true
            }
          },
          _count: {
            select: {
              reviews: true
            }
          }
        }
      }),
      prisma.task.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks'
    });
  }
});

/**
 * @route   GET /api/tasks/:id
 * @desc    Get single task by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        poster: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rating: true,
            avatar: true,
            tasksCompleted: true
          }
        },
        hustler: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rating: true,
            avatar: true
          }
        },
        reviews: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true
              }
            }
          }
        }
      }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.json({
      success: true,
      data: task
    });

  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch task'
    });
  }
});

/**
 * @route   PUT /api/tasks/:id/assign
 * @desc    Assign task to hustler
 * @access  Private
 */
router.put('/:id/assign', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const hustlerId = req.user.userId;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { poster: true }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    if (task.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Task is not available for assignment'
      });
    }

    if (task.posterId === hustlerId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot assign your own task'
      });
    }

    // Update task and create chat
    const [updatedTask, chat] = await prisma.$transaction([
      prisma.task.update({
        where: { id },
        data: {
          status: 'ASSIGNED',
          hustlerId
        },
        include: {
          poster: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          },
          hustler: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          }
        }
      }),
      prisma.chat.create({
        data: {
          taskId: id,
          members: {
            create: [
              { userId: task.posterId },
              { userId: hustlerId }
            ]
          }
        }
      })
    ]);

    // Send notification to task poster
    await prisma.notification.create({
      data: {
        title: 'Task Assigned',
        message: `Your task "${task.title}" has been assigned to a hustler`,
        type: 'TASK_ASSIGNED',
        userId: task.posterId,
        taskId: id
      }
    });

    res.json({
      success: true,
      message: 'Task assigned successfully',
      data: updatedTask
    });

  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign task'
    });
  }
});

/**
 * @route   PUT /api/tasks/:id/status
 * @desc    Update task status
 * @access  Private
 */
router.put('/:id/status', authenticateToken, [
  body('status')
    .isIn(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
    .withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { poster: true, hustler: true }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check permissions
    const canUpdate = task.posterId === userId || task.hustlerId === userId;
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this task'
      });
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: { status },
      include: {
        poster: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        },
        hustler: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      }
    });

    // Update user stats if task completed
    if (status === 'COMPLETED' && task.hustlerId) {
      await prisma.user.update({
        where: { id: task.hustlerId },
        data: {
          tasksCompleted: { increment: 1 },
          totalEarnings: { increment: task.budget }
        }
      });
    }

    res.json({
      success: true,
      message: 'Task status updated successfully',
      data: updatedTask
    });

  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update task status'
    });
  }
});

/**
 * @route   GET /api/tasks/user/posted
 * @desc    Get user's posted tasks
 * @access  Private
 */
router.get('/user/posted', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { posterId: userId };
    if (status) {
      where.status = status.toUpperCase();
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          hustler: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rating: true,
              avatar: true
            }
          },
          _count: {
            select: { reviews: true }
          }
        }
      }),
      prisma.task.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get posted tasks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch posted tasks'
    });
  }
});

/**
 * @route   GET /api/tasks/user/assigned
 * @desc    Get user's assigned tasks
 * @access  Private
 */
router.get('/user/assigned', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { hustlerId: userId };
    if (status) {
      where.status = status.toUpperCase();
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          poster: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rating: true,
              avatar: true
            }
          },
          _count: {
            select: { reviews: true }
          }
        }
      }),
      prisma.task.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get assigned tasks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned tasks'
    });
  }
});

module.exports = router;
