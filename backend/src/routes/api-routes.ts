import { Router } from 'express';
import * as authController from '../controllers/auth-controller.js';
import * as profileController from '../controllers/profile-controller.js';
import * as usersController from '../controllers/users-controller.js';
import * as rbacController from '../controllers/rbac-controller.js';
import * as passwordResetController from '../controllers/password-reset-controller.js';
import * as eventController from '../controllers/event-controller.js';
import * as eventsStatsController from '../controllers/events-controller.js';
import * as taskController from '../controllers/task-controller.js';
import * as rsvpController from '../controllers/rsvps-controller.js';
import * as eventMembersController from '../controllers/event-members-controller.js';
import * as eventDocumentsController from '../controllers/event-documents-controller.js';
import * as photosController from '../controllers/photos-controller.js';
import * as albumsController from '../controllers/albums-controller.js';
import * as mediaStatsController from '../controllers/media-stats-controller.js';
import * as publicShareController from '../controllers/public-share-controller.js';
import { authenticateToken, authorizeRole, authorizePermission } from '../middleware/auth.js';
import { apiLimiter, createAuthLimiter } from '../middleware/rate-limit.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { hashPassword } from '../utils/auth-helpers.js';
import { getDatabase } from '../db/database.js';

const router = Router();

// Apply rate limiting to all API routes
router.use(apiLimiter);

// Ensure uploads directory exists outside web root
const UPLOADS_DIR = path.resolve('uploads/profile-photos');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DOCUMENTS_DIR = path.resolve('uploads/event-documents');
if (!fs.existsSync(DOCUMENTS_DIR)) fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });

const PHOTOS_DIR = path.resolve('uploads/event-photos');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

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

const documentStorage = multer.diskStorage({
  destination: DOCUMENTS_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'document-' + uniqueSuffix + ext);
  },
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/csv',
      'application/zip',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported document type'));
    }
  },
});

const photoStorage = multer.diskStorage({
  destination: PHOTOS_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'photo-' + uniqueSuffix + ext);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB each
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported image type'));
  },
});

// ============ AUTH ROUTES ============
router.post('/auth/register', createAuthLimiter(), authController.register);
router.post('/auth/verify-email', authController.verifyEmail);
router.post('/auth/login', createAuthLimiter(), authController.login);
router.post('/auth/logout', authenticateToken, authController.logout);
router.get('/auth/me', authenticateToken, authController.getCurrentUser);


// ============ PUBLIC RSVP ROUTES ==========
router.get('/public/events/:eventId', rsvpController.getPublicRsvpContext);
// Token refresh and heartbeat
router.post('/auth/refresh', authController.refreshTokenEndpoint);
router.post('/auth/session/heartbeat', authenticateToken, authController.sessionHeartbeat);

// Password reset routes
router.post('/auth/forgot-password', createAuthLimiter(), passwordResetController.forgotPassword);
router.post('/auth/reset-password', passwordResetController.resetPassword);

// Profile email-change confirmation and account deletion
router.post('/profile/confirm-email-change', profileController.confirmEmailChange);
router.delete('/profile/account', authenticateToken, profileController.deleteAccount);

// ============ USER (self-service) ROUTES — issues #36, #39 ============
router.get('/users/me', authenticateToken, usersController.getMe);
router.patch('/users/me', authenticateToken, usersController.updateMe);
router.get('/events/:eventId/rsvps', authenticateToken, rsvpController.listRsvps);
router.post('/events/:eventId/rsvps', rsvpController.createRsvp);
router.patch('/events/:eventId/rsvps/:id', authenticateToken, rsvpController.updateRsvp);
router.delete('/events/:eventId/rsvps/:id', authenticateToken, rsvpController.deleteRsvp);
router.get('/events/:eventId/rsvps/export', authenticateToken, rsvpController.exportRsvpsCsv);

// ============ EVENT MEMBERS ROUTES ==========
router.get('/events/:eventId/members', authenticateToken, eventMembersController.listMembers);
router.post('/events/:eventId/members', authenticateToken, eventMembersController.addMember);
router.delete('/events/:eventId/members/:userId', authenticateToken, eventMembersController.removeMember);
router.delete('/users/me', authenticateToken, usersController.deleteMe);

// ============ PROFILE ROUTES (extended data) ============
router.get('/profile', authenticateToken, profileController.getUserProfile);
router.put('/profile', authenticateToken, profileController.updateUserProfile);
router.post('/profile/photo', authenticateToken, upload.single('photo'), profileController.uploadProfilePhoto);
router.delete('/profile/photo', authenticateToken, profileController.deleteProfilePhoto);
router.get('/uploads/profile-photos/:filename', authenticateToken, profileController.getProfilePhoto);
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
router.get('/events/stats', authenticateToken, eventsStatsController.getEventStats);
router.get('/events/:id', authenticateToken, eventController.getEventById);
router.post('/events', authenticateToken, eventController.createEvent);
router.put('/events/:id', authenticateToken, eventController.updateEvent);
router.delete('/events/:id', authenticateToken, eventController.deleteEvent);
router.post('/events/:id/restore', authenticateToken, eventController.restoreEvent);
router.get('/events/:eventId/documents', authenticateToken, eventDocumentsController.listEventDocuments);
router.post('/events/:eventId/documents', authenticateToken, documentUpload.single('document'), eventDocumentsController.uploadEventDocument);
router.patch('/events/:eventId/documents/:id', authenticateToken, eventDocumentsController.updateEventDocument);
router.get('/events/:eventId/documents/:id', authenticateToken, eventDocumentsController.downloadEventDocument);
router.delete('/events/:eventId/documents/:id', authenticateToken, eventDocumentsController.deleteEventDocument);

// Media stats and recent items
router.get('/events/:eventId/media/stats', authenticateToken, mediaStatsController.getMediaStats);
router.get('/events/:eventId/media/recent-documents', authenticateToken, mediaStatsController.recentDocuments);
router.get('/events/:eventId/media/recent-photos', authenticateToken, mediaStatsController.recentPhotos);

// Photo routes
router.get('/events/:eventId/photos', authenticateToken, photosController.listEventPhotos);
router.post('/events/:eventId/photos', authenticateToken, photoUpload.array('photos', 20), photosController.uploadEventPhotos);
router.patch('/events/:eventId/photos/:photoId', authenticateToken, photosController.updateEventPhoto);
router.get('/events/:eventId/photos/:photoId/download', authenticateToken, photosController.downloadEventPhoto);
router.post('/events/:eventId/photos/:photoId/share', authenticateToken, photosController.sharePhoto);
router.delete('/events/:eventId/photos/:photoId', authenticateToken, photosController.deleteEventPhoto);

// Albums
router.get('/events/:eventId/albums', authenticateToken, albumsController.listAlbums);
router.post('/events/:eventId/albums', authenticateToken, albumsController.createAlbum);
router.patch('/events/:eventId/albums/:albumId', authenticateToken, albumsController.renameAlbum);
router.delete('/events/:eventId/albums/:albumId', authenticateToken, albumsController.deleteAlbum);

// Public share route (no auth)
router.get('/share/photo/:token', publicShareController.publicPhotoView);

// ============ TASK ROUTES ============
router.get('/tasks', authenticateToken, taskController.getAllTasks);
router.get('/tasks/:id', authenticateToken, taskController.getTaskById);
router.post('/tasks', authenticateToken, taskController.createTask);
router.put('/tasks/:id', authenticateToken, taskController.updateTask);
router.delete('/tasks/:id', authenticateToken, taskController.deleteTask);
router.post('/tasks/:id/toggle', authenticateToken, taskController.toggleTaskStatus);

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
