const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * @route   GET /api/chat/user-chats
 * @desc    Get all chats for authenticated user
 * @access  Private
 */
router.get('/user-chats', async (req, res) => {
  try {
    const userId = req.user.userId;

    const chats = await prisma.chat.findMany({
      where: {
        members: {
          some: {
            userId: userId
          }
        }
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            budget: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true
              }
            }
          }
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            id: true,
            content: true,
            type: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Format response to include other user info
    const formattedChats = chats.map(chat => {
      const otherMember = chat.members.find(member => member.userId !== userId);
      const lastMessage = chat.messages[0] || null;

      return {
        id: chat.id,
        taskId: chat.taskId,
        task: chat.task,
        otherUser: otherMember ? otherMember.user : null,
        lastMessage,
        updatedAt: chat.updatedAt
      };
    });

    res.json({
      success: true,
      data: formattedChats
    });

  } catch (error) {
    console.error('Get user chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chats'
    });
  }
});

/**
 * @route   GET /api/chat/:chatId/messages
 * @desc    Get messages for a specific chat
 * @access  Private
 */
router.get('/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;
    const { page = 1, limit = 50 } = req.query;

    // Check if user is member of this chat
    const chatMember = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId
      }
    });

    if (!chatMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this chat'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { chatId },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          }
        }
      }),
      prisma.message.count({ where: { chatId } })
    ]);

    // Reverse to show oldest first
    const reversedMessages = messages.reverse();

    res.json({
      success: true,
      data: {
        messages: reversedMessages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
});

/**
 * @route   POST /api/chat/:chatId/messages
 * @desc    Send a message in a chat
 * @access  Private
 */
router.post('/:chatId/messages', [
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message content must be between 1 and 1000 characters'),
  body('type')
    .optional()
    .isIn(['TEXT', 'IMAGE', 'LOCATION'])
    .withMessage('Invalid message type')
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

    const { chatId } = req.params;
    const { content, type = 'TEXT', imageUrl } = req.body;
    const userId = req.user.userId;

    // Check if user is member of this chat
    const chatMember = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId
      }
    });

    if (!chatMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this chat'
      });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        content,
        type,
        imageUrl,
        chatId,
        senderId: userId
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      }
    });

    // Update chat's updatedAt
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    });

    // Get other chat members for notifications
    const otherMembers = await prisma.chatMember.findMany({
      where: {
        chatId,
        userId: { not: userId }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Create notifications for other members
    const notifications = otherMembers.map(member => ({
      title: 'New Message',
      message: `${req.user.firstName || 'Someone'} sent you a message`,
      type: 'NEW_MESSAGE',
      userId: member.userId,
      chatId
    }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({
        data: notifications
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

/**
 * @route   GET /api/chat/:chatId
 * @desc    Get chat details
 * @access  Private
 */
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;

    // Check if user is member of this chat
    const chatMember = await prisma.chatMember.findFirst({
      where: {
        chatId,
        userId
      }
    });

    if (!chatMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this chat'
      });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            budget: true,
            category: true,
            deadline: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                rating: true,
                tasksCompleted: true
              }
            }
          }
        }
      }
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Get other user info
    const otherMember = chat.members.find(member => member.userId !== userId);

    res.json({
      success: true,
      data: {
        id: chat.id,
        taskId: chat.taskId,
        task: chat.task,
        otherUser: otherMember ? otherMember.user : null,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }
    });

  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat'
    });
  }
});

module.exports = router;
