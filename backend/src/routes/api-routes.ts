import { Router } from 'express';
import * as authController from '../controllers/auth-controller.js';
import * as profileController from '../controllers/profile-controller.js';
import * as usersController from '../controllers/users-controller.js';
import * as rbacController from '../controllers/rbac-controller.js';
import * as passwordResetController from '../controllers/password-reset-controller.js';
import { authenticateToken, authorizeRole, authorizePermission } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const apiLimiter = rateLimit({ windowMs: 60_000, max: 100 });

// Stricter per-IP rate limit for login endpoint — issue #31
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15-minute window (matches lockout duration)
  max: 10,                    // max 10 login attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP, please try again later.' },
});

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
router.post('/auth/login', loginLimiter, authController.login);
router.post('/auth/refresh', authController.refreshTokenEndpoint);
router.post('/auth/logout', authenticateToken, authController.logout);
router.post('/auth/session/heartbeat', authenticateToken, authController.sessionHeartbeat);
router.get('/auth/me', authenticateToken, authController.getCurrentUser);

// Password reset routes (issues #77, #79)
router.post('/auth/reset-password', passwordResetController.resetPassword);

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

export default router;
