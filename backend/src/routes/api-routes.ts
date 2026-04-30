import { Router } from 'express';
import * as authController from '../controllers/auth-controller.js';
import * as profileController from '../controllers/profile-controller.js';
import * as usersController from '../controllers/users-controller.js';
import * as rbacController from '../controllers/rbac-controller.js';
import * as passwordResetController from '../controllers/password-reset-controller.js';
import * as eventController from '../controllers/event-controller.js';
import * as taskController from '../controllers/task-controller.js';
import * as rsvpController from '../controllers/rsvp-controller.js';
import { authenticateToken, authorizeRole, authorizePermission } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { hashPassword } from '../utils/auth-helpers.js';
import { getDatabase } from '../db/database.js';

const apiLimiter = rateLimit({ windowMs: 60_000, max: 100 });

const router = Router();

// Apply rate limiting to all API routes
router.use(apiLimiter);

// Ensure uploads directory exists outside web root
const UPLOADS_DIR = path.resolve('uploads/profile-photos');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Configure multer for profile photo uploads
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'profile-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — issue #38
  fileFilter: (req, file, cb) => {
    // Validate by MIME type (not just extension) — issue #38
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are accepted'));
    }
  },
});

// ============ AUTH ROUTES ============
router.post('/auth/register', authController.register);
router.post('/auth/verify-email', authController.verifyEmail);
router.post('/auth/login', authController.login);
router.post('/auth/logout', authenticateToken, authController.logout);
router.get('/auth/me', authenticateToken, authController.getCurrentUser);

// Token refresh and heartbeat
router.post('/auth/refresh', authController.refreshTokenEndpoint);
router.post('/auth/session/heartbeat', authenticateToken, authController.sessionHeartbeat);

// Password reset routes
router.post('/auth/forgot-password', passwordResetController.forgotPassword);
router.post('/auth/reset-password', passwordResetController.resetPassword);

// Profile email-change confirmation and account deletion
router.post('/profile/confirm-email-change', profileController.confirmEmailChange);
router.delete('/profile/account', authenticateToken, profileController.deleteAccount);

// ============ USER (self-service) ROUTES — issues #36, #39 ============
router.get('/users/me', authenticateToken, usersController.getMe);
router.patch('/users/me', authenticateToken, usersController.updateMe);
router.delete('/users/me', authenticateToken, usersController.deleteMe);

// ============ PROFILE ROUTES (extended data) ============
router.get('/profile', authenticateToken, profileController.getUserProfile);
router.put('/profile', authenticateToken, profileController.updateUserProfile);
router.post('/profile/photo', authenticateToken, upload.single('photo'), profileController.uploadProfilePhoto);
router.delete('/profile/photo', authenticateToken, profileController.deleteProfilePhoto);
router.post('/profile/change-email', authenticateToken, profileController.changeEmail);

// ============ RBAC ROUTES ============
router.get('/roles', authenticateToken, rbacController.getAllRoles);
router.get('/roles/:roleId', authenticateToken, rbacController.getRoleWithPermissions);
router.post('/roles', authenticateToken, authorizeRole(['Admin']), rbacController.createRole);

router.post(
  '/roles/assign-role',
  authenticateToken,
  authorizePermission('roles.manage'),
  rbacController.assignRoleToUser,
);

router.post(
  '/roles/add-permission',
  authenticateToken,
  authorizePermission('roles.manage'),
  rbacController.addPermissionToRole,
);

router.post(
  '/roles/remove-permission',
  authenticateToken,
  authorizePermission('roles.manage'),
  rbacController.removePermissionFromRole,
);

router.get(
  '/permissions',
  authenticateToken,
  authorizePermission('roles.manage'),
  rbacController.getAllPermissions,
);

router.get('/user/role-permissions', authenticateToken, rbacController.getUserRoleAndPermissions);

// ============ EVENT ROUTES ============
router.get('/events', authenticateToken, eventController.getAllEvents);
router.get('/events/:id', authenticateToken, eventController.getEventById);
router.post('/events', authenticateToken, eventController.createEvent);
router.put('/events/:id', authenticateToken, eventController.updateEvent);
router.delete('/events/:id', authenticateToken, eventController.deleteEvent);
router.post('/events/:id/restore', authenticateToken, eventController.restoreEvent);

// ============ TASK ROUTES ============
router.get('/tasks', authenticateToken, taskController.getAllTasks);
router.get('/tasks/:id', authenticateToken, taskController.getTaskById);
router.post('/tasks', authenticateToken, taskController.createTask);
router.put('/tasks/:id', authenticateToken, taskController.updateTask);
router.delete('/tasks/:id', authenticateToken, taskController.deleteTask);
router.post('/tasks/:id/toggle', authenticateToken, taskController.toggleTaskStatus);

// ============ RSVP ROUTES ============
router.get('/rsvps', authenticateToken, rsvpController.getAllRsvps);
router.get('/rsvps/:id', authenticateToken, rsvpController.getRsvpById);
router.post('/rsvps', rsvpController.submitRsvp); // Public endpoint
router.put('/rsvps/:id', authenticateToken, rsvpController.updateRsvp);
router.delete('/rsvps/:id', authenticateToken, rsvpController.deleteRsvp);

export default router;

// Development-only: seed a verified demo user for local testing
if (process.env.NODE_ENV !== 'production') {
  router.post('/__dev/seed-user', async (req, res) => {
    try {
      const { email, password, displayName } = req.body ?? {};
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });
      const db = getDatabase();
      const passwordHash = await hashPassword(password);
      await db.run(
        `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           display_name = EXCLUDED.display_name,
           updated_at = CURRENT_TIMESTAMP`,
        [email.trim().toLowerCase(), passwordHash, displayName || email.split('@')[0]],
      );
      return res.status(201).json({ message: 'Demo user seeded' });
    } catch (err) {
      console.error('Dev seed user failed', err);
      return res.status(500).json({ error: 'seed failed' });
    }
  });
}
