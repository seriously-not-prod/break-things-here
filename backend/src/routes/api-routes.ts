import { Router } from 'express';
import * as authController from '../controllers/auth-controller.js';
import * as profileController from '../controllers/profile-controller.js';
import * as usersController from '../controllers/users-controller.js';
import * as rbacController from '../controllers/rbac-controller.js';
import * as passwordResetController from '../controllers/password-reset-controller.js';
import * as eventController from '../controllers/event-controller.js';
import * as taskController from '../controllers/task-controller.js';
import * as tasksController from '../controllers/tasks-controller.js';
import * as legacyRsvpController from '../controllers/rsvp-controller.js';
import * as rsvpController from '../controllers/rsvps-controller.js';
import * as eventMembersController from '../controllers/event-members-controller.js';
import * as adminController from '../controllers/admin-controller.js';
import * as gdprController from '../controllers/gdpr-controller.js';
import * as announcementController from '../controllers/announcement-controller.js';
import * as budgetController from '../controllers/budget-controller.js';
import * as guestGroupsController from '../controllers/guest-groups-controller.js';
import * as eventDocumentsController from '../controllers/event-documents-controller.js';
import * as analyticsController from '../controllers/analytics-controller.js';
import * as notificationsController from '../controllers/notifications-controller.js';
import * as activityFeedController from '../controllers/activity-feed-controller.js';
import * as vendorsController from '../controllers/vendors-controller.js';
import * as shoppingController from '../controllers/shopping-controller.js';
import * as timelineController from '../controllers/timeline-controller.js';
import * as seatingController from '../controllers/seating-controller.js';
import * as communicationController from '../controllers/guest-communication-controller.js';
import * as galleryController from '../controllers/gallery-controller.js';
import * as aiController from '../controllers/ai-controller.js';
import * as messagesController from '../controllers/messages-controller.js';
import * as eventTemplatesController from '../controllers/event-templates-controller.js';
import * as eventBulkController from '../controllers/event-bulk-controller.js';
import * as eventFilterPresetsController from '../controllers/event-filter-presets-controller.js';
import * as budgetTemplatesController from '../controllers/budget-templates-controller.js';
import * as taskDepsController from '../controllers/task-dependencies-controller.js';
import * as taskTemplatesController from '../controllers/task-templates-controller.js';
import * as workloadController from '../controllers/workload-controller.js';
import * as shoppingBudgetSyncController from '../controllers/shopping-budget-sync-controller.js';
import * as vendorCommController from '../controllers/vendor-communication-controller.js';
import * as vendorPerfController from '../controllers/vendor-performance-controller.js';
import * as storeSuggestionsController from '../controllers/store-suggestions-controller.js';
import * as entraAuthController from '../controllers/entra-auth-controller.js';
import * as trackingController from '../controllers/tracking-controller.js';
import * as guestMergeController from '../controllers/guest-merge-controller.js';
import * as rsvpConfirmationController from '../controllers/rsvp-confirmation-controller.js';
import * as rsvpTokenController from '../controllers/rsvp-token-controller.js';
import * as waitlistController from '../controllers/waitlist-controller.js';
import * as rsvpQuestionsController from '../controllers/rsvp-questions-controller.js';
import * as currencyController from '../controllers/currency-controller.js';
import * as budgetForecastController from '../controllers/budget-forecast-controller.js';
import * as eventCustomFieldsController from '../controllers/event-custom-fields-controller.js';
import * as galleryPermissionsController from '../controllers/gallery-permissions-controller.js';
import * as gallerySharesController from '../controllers/gallery-shares-controller.js';
import * as galleryCommentsController from '../controllers/gallery-comments-controller.js';
import * as galleryDownloadsController from '../controllers/gallery-downloads-controller.js';
import * as reportsController from '../controllers/reports-controller.js';
import * as globalSearchController from '../controllers/global-search-controller.js';
import * as taskMultiAssigneeController from '../controllers/task-multi-assignee-controller.js';
import * as timelineTemplatesController from '../controllers/timeline-templates-controller.js';
import * as collaborationController from '../controllers/collaboration-controller.js';
import * as eventChatController from '../controllers/event-chat-controller.js';
import * as entityVersionsController from '../controllers/entity-versions-controller.js';
import * as guestExportController from '../controllers/guest-export-controller.js';
import * as mealOptionsController from '../controllers/meal-options-controller.js';
import * as commTemplatesController from '../controllers/communication-templates-controller.js';
import * as unsubscribeController from '../controllers/unsubscribe-controller.js';
import * as qrCheckinController from '../controllers/qr-checkin-controller.js';
import * as attendanceBoardController from '../controllers/attendance-board-controller.js';
import * as seatingGroupsController from '../controllers/seating-groups-controller.js';
import { authenticateToken, authorizeRole, authorizePermission } from '../middleware/auth.js';
import { apiLimiter, createAuthLimiter, publicLimiter, trackingLimiter, gdprLimiter } from '../middleware/rate-limit.js';
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

const VENDOR_CONTRACTS_DIR = path.resolve('uploads/vendor-contracts');
if (!fs.existsSync(VENDOR_CONTRACTS_DIR)) fs.mkdirSync(VENDOR_CONTRACTS_DIR, { recursive: true });

// In-memory multer for CSV imports (no disk write needed)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// Configure multer for profile photo uploads
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'profile-' + uniqueSuffix + ext);
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — spec requirement
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, PNG, and WebP files are accepted'));
    }
  },
});

const contractStorage = multer.diskStorage({
  destination: VENDOR_CONTRACTS_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'contract-' + uniqueSuffix + ext);
  },
});

const contractUpload = multer({
  storage: contractStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted for contracts'));
    }
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — spec requirement (BRD/FRD)
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
router.post('/auth/register', createAuthLimiter(), authController.register);
router.post('/auth/verify-email', authController.verifyEmail);
router.post('/auth/login', createAuthLimiter(), authController.login);

// ── Entra ID auth routes (#468, #469, #470) ────────────────────────────────
// Feature-flagged: only functional when ENTRA_AUTH_ENABLED=true
router.get('/auth/entra/config', entraAuthController.getEntraStatus);
router.get('/auth/entra/login', entraAuthController.initiateEntraLogin);
router.post('/auth/entra/callback', createAuthLimiter(), entraAuthController.handleEntraCallback);
router.post('/auth/logout', authenticateToken, authController.logout);
router.get('/auth/me', authenticateToken, authController.getCurrentUser);
router.post('/ai/suggest', authenticateToken, aiController.getSuggestion);


// ============ PUBLIC RSVP ROUTES ==========
// All unauthenticated public endpoints share a tighter per-IP limiter
// (publicLimiter) on top of the global apiLimiter so a single attacker IP
// can't enumerate tokens or hammer webhooks even within the global budget.
router.get('/public/events/:eventId', publicLimiter, rsvpController.getPublicRsvpContext);

// Tracking endpoints (#465 open pixel, #466 click redirect) — intentionally unauthenticated.
// Tokens are HMAC-signed; see backend/src/utils/tracking-token.ts.
// Uses trackingLimiter (much higher cap) rather than publicLimiter because
// email opens burst from shared corporate / mobile-carrier egress IPs.
router.get('/tracking/open/:token', trackingLimiter, trackingController.recordOpen);
router.get('/tracking/click/:token', trackingLimiter, trackingController.recordClick);

// ── Public gallery share resolution (#619) — unauthenticated, token-gated ──
router.get('/public/gallery/:token', publicLimiter, gallerySharesController.resolveShareLink);
router.post('/public/gallery/:token', publicLimiter, gallerySharesController.resolveShareLink);

// Public RSVP token lookup (#411, #437) — guest-facing, unauthenticated.
router.get('/public/rsvp/:token', publicLimiter, rsvpTokenController.lookupRsvpByToken);
router.post('/public/rsvp/:token/responses', publicLimiter, rsvpQuestionsController.submitResponses);

// Public unsubscribe endpoint (#545, #590) — unauthenticated, token-gated.
// Resubscribe is NOT public — re-opt-in by anyone except the original guest
// would violate CAN-SPAM/GDPR. The route is registered below under the
// authenticated section and requires the actor to be the event owner/admin.
router.get('/public/unsubscribe/:token', publicLimiter, unsubscribeController.getUnsubscribe);
router.post('/public/unsubscribe/:token', publicLimiter, unsubscribeController.postUnsubscribe);
router.post('/unsubscribe/:token/resubscribe', authenticateToken, unsubscribeController.resubscribe);
// Token refresh and heartbeat
router.post('/auth/refresh', authController.refreshTokenEndpoint);
router.post('/auth/session/heartbeat', authenticateToken, authController.sessionHeartbeat);
router.post('/auth/resend-verification', authController.resendVerification);
router.post('/auth/entra/backchannel-logout', authController.entraBackchannelLogout);

// Password reset routes
router.post('/auth/forgot-password', createAuthLimiter(), passwordResetController.forgotPassword);
router.post('/auth/reset-password', passwordResetController.resetPassword);

// Profile email-change confirmation and account deletion
router.post('/profile/confirm-email-change', profileController.confirmEmailChange);
router.delete('/profile/account', authenticateToken, profileController.deleteAccount);

// ============ USER (self-service) ROUTES — issues #36, #39 ============
router.get('/users/me', authenticateToken, usersController.getMe);
router.patch('/users/me', authenticateToken, usersController.updateMe);
router.get('/rsvps', authenticateToken, legacyRsvpController.getAllRsvps);
router.get('/rsvps/:id', authenticateToken, legacyRsvpController.getRsvpById);
router.post('/rsvps', legacyRsvpController.submitRsvp);
router.put('/rsvps/:id', authenticateToken, legacyRsvpController.updateRsvp);
router.delete('/rsvps/:id', authenticateToken, legacyRsvpController.deleteRsvp);
router.get('/events/:eventId/rsvps', authenticateToken, rsvpController.listRsvps);
router.post('/events/:eventId/rsvps', rsvpController.createRsvp);
// Specific sub-paths must be registered BEFORE /:id parameterized routes
router.get('/events/:eventId/rsvps/export', authenticateToken, rsvpController.exportRsvpsCsv);
router.get('/events/:eventId/rsvps/import/template.csv', authenticateToken, rsvpController.exportRsvpsImportTemplateCsv);
router.get('/events/:eventId/rsvps/export.xlsx', authenticateToken, guestExportController.exportRsvpsXlsx);
router.get('/events/:eventId/rsvps/export.pdf', authenticateToken, guestExportController.exportRsvpsPdfData);
router.post('/events/:eventId/rsvps/import', authenticateToken, csvUpload.single('file'), rsvpController.importCsv);
router.get('/events/:eventId/rsvps/duplicates', authenticateToken, guestMergeController.listDuplicates);
router.get('/events/:eventId/rsvps/lookup', authenticateToken, guestMergeController.lookupRsvpsByEmail);
router.get('/events/:eventId/guest-merges', authenticateToken, guestMergeController.listMergeAudit);
router.post('/events/:eventId/rsvps/:id/merge', authenticateToken, guestMergeController.mergeGuests);
router.post('/events/:eventId/rsvps/:id/send-confirmation', authenticateToken, rsvpConfirmationController.sendRsvpConfirmation);
router.get('/events/:eventId/rsvps/:id/ics', authenticateToken, rsvpConfirmationController.downloadRsvpIcs);
router.get('/events/:eventId/rsvps/:id/qr.svg', authenticateToken, rsvpConfirmationController.getRsvpQr);
router.post('/events/:eventId/rsvps/:id/token', authenticateToken, rsvpTokenController.issueRsvpToken);
router.patch('/events/:eventId/rsvps/:id', authenticateToken, rsvpController.updateRsvp);
router.patch('/events/:eventId/rsvps/:id/checkin', authenticateToken, rsvpController.checkInGuest);
// Planner-side unsubscribe toggle (#444)
router.patch('/events/:eventId/rsvps/:id/unsubscribe', authenticateToken, rsvpController.setUnsubscribed);
router.delete('/events/:eventId/rsvps/:id', authenticateToken, rsvpController.deleteRsvp);

// ============ WAITLIST ROUTES — #413, #442 ============
router.get('/events/:eventId/waitlist', authenticateToken, waitlistController.listWaitlist);
router.post('/events/:eventId/waitlist', authenticateToken, waitlistController.addRsvpToWaitlist);
router.post('/events/:eventId/waitlist/promote', authenticateToken, waitlistController.promoteWaitlist);
router.delete('/events/:eventId/waitlist/:id', authenticateToken, waitlistController.removeFromWaitlist);

// ============ CUSTOM RSVP QUESTIONS — #413, #443 ============
router.get('/events/:eventId/rsvp-questions', authenticateToken, rsvpQuestionsController.listQuestions);
router.post('/events/:eventId/rsvp-questions', authenticateToken, rsvpQuestionsController.createQuestion);
router.patch('/events/:eventId/rsvp-questions/:id', authenticateToken, rsvpQuestionsController.updateQuestion);
router.delete('/events/:eventId/rsvp-questions/:id', authenticateToken, rsvpQuestionsController.deleteQuestion);
router.get('/events/:eventId/rsvp-questions/responses', authenticateToken, rsvpQuestionsController.listResponses);

// ============ CURRENCY & EXCHANGE RATES — #418, #461 ============
router.get('/currency/supported', currencyController.listSupportedCurrencies);
router.get('/currency/rates', authenticateToken, currencyController.listRates);
router.put('/currency/rates', authenticateToken, currencyController.setRate);
router.delete('/currency/rates/:base/:quote', authenticateToken, currencyController.deleteRate);

// ============ BUDGET FORECAST — #418, #462 ============
router.get('/events/:eventId/budget/forecast', authenticateToken, budgetForecastController.getBudgetForecast);

// ============ GUEST COMMUNICATION ROUTES ============
router.get('/events/:eventId/communication', authenticateToken, communicationController.listCommunicationLog);
router.post('/events/:eventId/communication/invite', authenticateToken, communicationController.bulkSendInvitation);
router.post('/events/:eventId/communication/reminder', authenticateToken, communicationController.sendReminder);
// Post-event thank-you send (#444)
router.post('/events/:eventId/communication/thank-you', authenticateToken, communicationController.sendThankYou);

// ============ COMMUNICATION TEMPLATES (#545, #587, #590) ============
router.get('/events/:eventId/communication/templates', authenticateToken, commTemplatesController.listTemplates);
router.post('/events/:eventId/communication/templates', authenticateToken, commTemplatesController.createTemplate);
router.patch('/events/:eventId/communication/templates/:id', authenticateToken, commTemplatesController.updateTemplate);
router.delete('/events/:eventId/communication/templates/:id', authenticateToken, commTemplatesController.deleteTemplate);
router.post('/events/:eventId/communication/templates/:id/preview', authenticateToken, commTemplatesController.previewTemplate);

// ============ MEAL OPTIONS (#591) ============
router.get('/events/:eventId/meal-options', authenticateToken, mealOptionsController.listMealOptions);
router.post('/events/:eventId/meal-options', authenticateToken, mealOptionsController.createMealOption);
router.patch('/events/:eventId/meal-options/:id', authenticateToken, mealOptionsController.updateMealOption);
router.delete('/events/:eventId/meal-options/:id', authenticateToken, mealOptionsController.deleteMealOption);

// ============ QR CHECK-IN + ATTENDANCE BOARD (#546, #589, #594, #595) ============
router.post('/events/:eventId/checkin/scan', authenticateToken, qrCheckinController.scanQr);
router.post('/events/:eventId/checkin/:rsvpId/undo', authenticateToken, qrCheckinController.undoCheckin);
router.post('/events/:eventId/checkin/mark-no-show', authenticateToken, qrCheckinController.markNoShow);
router.get('/events/:eventId/attendance/summary', authenticateToken, attendanceBoardController.getAttendanceSummary);
router.get('/events/:eventId/attendance/recent', authenticateToken, attendanceBoardController.listRecentAttendanceEvents);
// SSE stream — EventSource cannot set Authorization headers, so auth flows
// through the HttpOnly `accessToken` cookie that `authenticateToken` already
// supports (see backend/src/middleware/auth.ts). Unauthenticated subscribers
// are rejected with 401 before any SSE headers are written.
router.get('/events/:eventId/attendance/stream', authenticateToken, attendanceBoardController.streamAttendance);

// ============ SEATING GROUPS (#593) ============
router.get('/events/:eventId/seating/groups', authenticateToken, seatingGroupsController.listGroups);
router.post('/events/:eventId/seating/groups', authenticateToken, seatingGroupsController.createGroup);
router.patch('/events/:eventId/seating/groups/:id', authenticateToken, seatingGroupsController.updateGroup);
router.delete('/events/:eventId/seating/groups/:id', authenticateToken, seatingGroupsController.deleteGroup);
router.post('/events/:eventId/seating/groups/:id/members', authenticateToken, seatingGroupsController.setGroupMembers);
router.post('/events/:eventId/seating/groups/:id/seat', authenticateToken, seatingGroupsController.seatGroupAtTable);

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
router.get('/uploads/event-documents/:filename', authenticateToken, eventDocumentsController.getEventDocumentFile);
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

// ============ EVENT TEMPLATES ROUTES — story #410, task #432 ============
// Registered before /:id parameterized routes so they take precedence
router.get('/event-templates', authenticateToken, eventTemplatesController.listTemplates);
router.post('/event-templates', authenticateToken, eventTemplatesController.createTemplate);
router.get('/event-templates/:id', authenticateToken, eventTemplatesController.getTemplate);
router.patch('/event-templates/:id', authenticateToken, eventTemplatesController.updateTemplate);
router.delete('/event-templates/:id', authenticateToken, eventTemplatesController.deleteTemplate);
router.post('/event-templates/:id/apply', authenticateToken, eventTemplatesController.applyTemplate);
// Template depth (#579)
router.get('/event-templates/:id/sections', authenticateToken, eventTemplatesController.listTemplateSections);
router.put('/event-templates/:id/sections/:sectionKey', authenticateToken, eventTemplatesController.upsertTemplateSection);
router.delete('/event-templates/:id/sections/:sectionKey', authenticateToken, eventTemplatesController.deleteTemplateSection);

// ============ EVENT FILTER PRESETS — story #416, task #454 ============
router.get('/event-filter-presets', authenticateToken, eventFilterPresetsController.listPresets);
router.post('/event-filter-presets', authenticateToken, eventFilterPresetsController.createPreset);
router.put('/event-filter-presets/:id', authenticateToken, eventFilterPresetsController.updatePreset);
router.delete('/event-filter-presets/:id', authenticateToken, eventFilterPresetsController.deletePreset);

// ============ EVENT ROUTES ============
router.get('/events', authenticateToken, eventController.getAllEvents);
// Bulk action route — must be registered before /:id parameterized routes — task #433
router.post('/events/bulk', authenticateToken, eventBulkController.bulkEventAction);
router.get('/events/:id', authenticateToken, eventController.getEventById);
router.post('/events', authenticateToken, eventController.createEvent);
router.put('/events/:id', authenticateToken, eventController.updateEvent);
router.patch('/events/:id', authenticateToken, eventController.updateEvent);
router.delete('/events/:id', authenticateToken, eventController.deleteEvent);
router.post('/events/:id/clone', authenticateToken, eventController.cloneEvent);
router.patch('/events/:id/cover', authenticateToken, eventController.setCoverImage);
router.post('/events/:id/restore', authenticateToken, eventController.restoreEvent);
// BRD v2 (#540, #578) — true archive workflow distinct from soft-delete
router.post('/events/:id/archive', authenticateToken, eventController.archiveEvent);
router.post('/events/:id/unarchive', authenticateToken, eventController.unarchiveEvent);

// ── Event custom fields (#541, #577) ───────────────────────────────────────
router.get('/events/:eventId/custom-fields', authenticateToken, eventCustomFieldsController.listFields);
router.post('/events/:eventId/custom-fields', authenticateToken, eventCustomFieldsController.createField);
router.patch('/events/:eventId/custom-fields/:fieldId', authenticateToken, eventCustomFieldsController.updateField);
router.delete('/events/:eventId/custom-fields/:fieldId', authenticateToken, eventCustomFieldsController.deleteField);
router.get('/events/:eventId/feed', authenticateToken, activityFeedController.listFeed);
router.get('/events/:eventId/documents', authenticateToken, eventDocumentsController.listEventDocuments);
router.post('/events/:eventId/documents', authenticateToken, documentUpload.single('document'), eventDocumentsController.uploadEventDocument);
router.get('/events/:eventId/documents/:id', authenticateToken, eventDocumentsController.downloadEventDocument);
router.delete('/events/:eventId/documents/:id', authenticateToken, eventDocumentsController.deleteEventDocument);
router.get('/events/:eventId/gallery', authenticateToken, galleryController.listGallery);
router.delete('/events/:eventId/gallery/:id', authenticateToken, galleryController.deleteGalleryItem);
router.patch('/events/:eventId/gallery/:id', authenticateToken, galleryController.updateGalleryCaption);

// Gallery albums — #417, #459
router.get('/events/:eventId/gallery/albums', authenticateToken, galleryController.listAlbums);
router.post('/events/:eventId/gallery/albums', authenticateToken, galleryController.createAlbum);
router.patch('/events/:eventId/gallery/albums/:albumId', authenticateToken, galleryController.updateAlbum);
router.delete('/events/:eventId/gallery/albums/:albumId', authenticateToken, galleryController.deleteAlbum);
router.patch('/events/:eventId/gallery/:id/album', authenticateToken, galleryController.assignItemToAlbum);

// Gallery moderation queue — #417, #459
router.get('/events/:eventId/gallery/moderation', authenticateToken, galleryController.listModerationQueue);
router.patch('/events/:eventId/gallery/:id/moderate', authenticateToken, galleryController.moderateItem);
router.patch('/events/:eventId/gallery/:id/submit', authenticateToken, galleryController.submitGuestPhoto);

// Gallery slideshows — #417, #459
router.get('/events/:eventId/gallery/slideshows', authenticateToken, galleryController.listSlideshows);
router.post('/events/:eventId/gallery/slideshows', authenticateToken, galleryController.createSlideshow);
router.get('/events/:eventId/gallery/slideshows/:slideshowId/items', authenticateToken, galleryController.getSlideshowItems);
router.patch('/events/:eventId/gallery/slideshows/:slideshowId', authenticateToken, galleryController.updateSlideshow);
router.delete('/events/:eventId/gallery/slideshows/:slideshowId', authenticateToken, galleryController.deleteSlideshow);

// ── BRD v2 gallery permissions, share links, comments, downloads, quota ───
// #560 #618 — per-photo permission granularity
router.patch('/events/:eventId/gallery/:documentId/permissions', authenticateToken, galleryPermissionsController.updatePhotoPermissions);
router.post('/events/:eventId/gallery/:documentId/recompute-conversion', authenticateToken, galleryPermissionsController.recomputeConversion);
// #622 — storage quota reporting
router.get('/events/:eventId/gallery/storage', authenticateToken, galleryPermissionsController.getStorageUsage);
// #619 — public share-link controls
router.get('/events/:eventId/gallery/share-links', authenticateToken, gallerySharesController.listShareLinks);
router.post('/events/:eventId/gallery/share-links', authenticateToken, gallerySharesController.createShareLink);
router.delete('/events/:eventId/gallery/share-links/:id', authenticateToken, gallerySharesController.revokeShareLink);
// #621 — photo comments
router.get('/events/:eventId/gallery/:documentId/comments', authenticateToken, galleryCommentsController.listComments);
router.post('/events/:eventId/gallery/:documentId/comments', authenticateToken, galleryCommentsController.addComment);
router.patch('/events/:eventId/gallery/comments/:commentId', authenticateToken, galleryCommentsController.moderateComment);
router.delete('/events/:eventId/gallery/comments/:commentId', authenticateToken, galleryCommentsController.deleteComment);
// #620 — album / event download manifest
router.get('/events/:eventId/gallery/download', authenticateToken, galleryDownloadsController.getEventDownloadManifest);
router.get('/events/:eventId/gallery/albums/:albumId/download', authenticateToken, galleryDownloadsController.getAlbumDownloadManifest);

// ============ ADMIN ROUTES — issues #260 #279 ============
// All admin routes require authentication + Admin role
router.get('/admin/users', authenticateToken, authorizeRole(['Admin']), adminController.listUsers);
router.post('/admin/users', authenticateToken, authorizeRole(['Admin']), adminController.createUser);
router.put('/admin/users/:id', authenticateToken, authorizeRole(['Admin']), adminController.updateUser);
router.patch('/admin/users/:id/role', authenticateToken, authorizeRole(['Admin']), adminController.changeUserRole);
router.patch('/admin/users/:id/lock', authenticateToken, authorizeRole(['Admin']), adminController.toggleLock);
router.delete('/admin/users/:id', authenticateToken, authorizeRole(['Admin']), adminController.deleteUser);
router.post('/admin/users/:id/restore', authenticateToken, authorizeRole(['Admin']), adminController.restoreUser);
router.get('/admin/roles', authenticateToken, authorizeRole(['Admin']), adminController.listRoles);

// ============ ADMIN ROUTES — #665 #677 ============
router.get('/admin/audit-log', authenticateToken, authorizeRole(['Admin']), adminController.searchAuditLog);
router.get('/admin/audit-log/export', authenticateToken, authorizeRole(['Admin']), adminController.exportAuditLog);
router.post('/admin/users/:id/deactivate', authenticateToken, authorizeRole(['Admin']), adminController.deactivateUser);
router.post('/admin/users/:id/force-logout', authenticateToken, authorizeRole(['Admin']), adminController.forceLogoutUser);

// ============ LEGACY TASK ROUTES (backward compat) ============
router.get('/tasks', authenticateToken, taskController.getAllTasks);
router.get('/tasks/:id', authenticateToken, taskController.getTaskById);
router.post('/tasks', authenticateToken, taskController.createTask);
router.put('/tasks/:id', authenticateToken, taskController.updateTask);
router.delete('/tasks/:id', authenticateToken, taskController.deleteTask);
router.post('/tasks/:id/toggle', authenticateToken, taskController.toggleTaskStatus);

// ============ EVENT-SCOPED TASK ROUTES — BRD 3.5, issues #373 #374 ============
router.get('/events/:eventId/tasks', authenticateToken, tasksController.listTasks);
router.post('/events/:eventId/tasks', authenticateToken, tasksController.createTask);
router.put('/events/:eventId/tasks/:id', authenticateToken, tasksController.updateTask);
router.patch('/events/:eventId/tasks/:id', authenticateToken, tasksController.updateTask);
router.delete('/events/:eventId/tasks/:id', authenticateToken, tasksController.deleteTask);
// Multi-assignee task API (#523 B1.2)
router.get('/events/:eventId/tasks/:taskId/assignees', authenticateToken, tasksController.listAssignees);
router.post('/events/:eventId/tasks/:taskId/assignees', authenticateToken, tasksController.addAssignee);
router.delete('/events/:eventId/tasks/:taskId/assignees/:userId', authenticateToken, tasksController.removeAssignee);
router.get('/events/:eventId/tasks/:taskId/comments', authenticateToken, tasksController.listComments);
router.post('/events/:eventId/tasks/:taskId/comments', authenticateToken, tasksController.addComment);
router.post('/events/:eventId/tasks/:taskId/subtasks', authenticateToken, tasksController.addSubtask);
router.patch('/events/:eventId/tasks/:taskId/subtasks/:id', authenticateToken, tasksController.toggleSubtask);
router.delete('/events/:eventId/tasks/:taskId/subtasks/:id', authenticateToken, tasksController.deleteSubtask);

// ============ ANALYTICS ROUTES — BRD 3.10, 3.11 ============
router.get('/events/:eventId/analytics', authenticateToken, analyticsController.getEventSummary);
router.get('/analytics', authenticateToken, analyticsController.getGlobalAnalytics);
router.get('/events/:eventId/analytics/export', authenticateToken, analyticsController.exportEventReport);
router.get('/events/:eventId/analytics/communication', authenticateToken, analyticsController.getCommunicationMetrics);

// ============ NOTIFICATIONS ROUTES — BRD 3.11 ============
router.get('/notifications', authenticateToken, notificationsController.listNotifications);
router.patch('/notifications/:id', authenticateToken, notificationsController.markRead);
router.post('/notifications/mark-all-read', authenticateToken, notificationsController.markAllRead);
router.get('/notifications/digest', authenticateToken, notificationsController.getDueTaskAlerts);

// ============ VENDOR ROUTES — BRD 3.6 ============
// Static sub-paths must be registered BEFORE parameterised /:id routes
router.get('/events/:eventId/vendors', authenticateToken, vendorsController.listVendors);
router.post('/events/:eventId/vendors', authenticateToken, vendorsController.createVendor);
router.get('/events/:eventId/vendors/favorites', authenticateToken, vendorsController.listFavoriteVendors);
router.get('/events/:eventId/vendors/compare', authenticateToken, vendorCommController.compareVendors);
router.get('/events/:eventId/vendors/performance', authenticateToken, vendorPerfController.listVendorPerformance);
router.put('/events/:eventId/vendors/:id', authenticateToken, vendorsController.updateVendor);
router.delete('/events/:eventId/vendors/:id', authenticateToken, vendorsController.deleteVendor);
router.put('/events/:eventId/vendors/:id/favorite', authenticateToken, vendorsController.setVendorFavorite);
router.post('/events/:eventId/vendors/:id/contract', authenticateToken, contractUpload.single('file'), vendorsController.uploadContract);
router.get('/events/:eventId/vendors/:id/booking', authenticateToken, vendorsController.getVendorBooking);
router.put('/events/:eventId/vendors/:id/booking', authenticateToken, vendorsController.upsertVendorBooking);
router.get('/events/:eventId/vendors/:id/payment-schedules', authenticateToken, vendorsController.listVendorPaymentSchedules);
router.post('/events/:eventId/vendors/:id/payment-schedules', authenticateToken, vendorsController.createVendorPaymentSchedule);
router.get('/events/:eventId/vendors/:vendorId/communication', authenticateToken, vendorCommController.listVendorCommunication);
router.post('/events/:eventId/vendors/:vendorId/communication', authenticateToken, vendorCommController.addVendorCommunication);
router.delete('/events/:eventId/vendors/:vendorId/communication/:logId', authenticateToken, vendorCommController.deleteVendorCommunication);
router.get('/events/:eventId/vendors/:vendorId/performance', authenticateToken, vendorPerfController.getVendorPerformance);

// ============ SHOPPING LIST ROUTES — BRD 3.7 ============
router.get('/events/:eventId/shopping-lists', authenticateToken, shoppingController.listLists);
router.post('/events/:eventId/shopping-lists', authenticateToken, shoppingController.createList);
router.delete('/events/:eventId/shopping-lists/:listId', authenticateToken, shoppingController.deleteList);
router.get('/events/:eventId/shopping-lists/:listId/items', authenticateToken, shoppingController.listItems);
router.post('/events/:eventId/shopping-lists/:listId/items', authenticateToken, shoppingController.createItem);
router.put('/events/:eventId/shopping-lists/:listId/items/:itemId', authenticateToken, shoppingController.updateItem);
router.delete('/events/:eventId/shopping-lists/:listId/items/:itemId', authenticateToken, shoppingController.deleteItem);
// #552/#608 — price comparison endpoints
router.patch('/events/:eventId/shopping-lists/:listId/items/:itemId/price-data', authenticateToken, shoppingController.updateItemPriceData);
router.get('/events/:eventId/shopping-lists/:listId/price-comparison', authenticateToken, shoppingController.getListPriceComparison);
router.get('/events/:eventId/shopping/price-comparison', authenticateToken, shoppingController.getEventPriceComparison);

// ============ TIMELINE ROUTES — BRD 3.8 ============
// /conflicts and /comparison must be before /:id to avoid being swallowed by a future parameterised GET
router.get('/events/:eventId/timeline/conflicts', authenticateToken, timelineController.detectConflicts);
router.get('/events/:eventId/timeline/comparison', authenticateToken, timelineController.getTimelineComparison);
router.get('/events/:eventId/timeline', authenticateToken, timelineController.listActivities);
router.post('/events/:eventId/timeline', authenticateToken, timelineController.createActivity);
router.put('/events/:eventId/timeline/:id', authenticateToken, timelineController.updateActivity);
router.delete('/events/:eventId/timeline/:id', authenticateToken, timelineController.deleteActivity);

// ============ SEATING ROUTES — issues #386 #387 ============
router.get('/events/:eventId/seating/tables', authenticateToken, seatingController.listTables);
router.post('/events/:eventId/seating/tables', authenticateToken, seatingController.createTable);
router.patch('/events/:eventId/seating/tables/:tableId/layout', authenticateToken, seatingController.updateTableLayout);
router.delete('/events/:eventId/seating/tables/:tableId', authenticateToken, seatingController.deleteTable);
router.post('/events/:eventId/seating/tables/:tableId/assign/:rsvpId', authenticateToken, seatingController.assignGuest);
router.delete('/events/:eventId/seating/tables/:tableId/assign/:rsvpId', authenticateToken, seatingController.unassignGuest);

// ============ MESSAGES ROUTES — team conversation per event ============
router.get('/events/:eventId/messages', authenticateToken, messagesController.listMessages);
router.post('/events/:eventId/messages', authenticateToken, messagesController.postMessage);
router.patch('/events/:eventId/messages/:id', authenticateToken, messagesController.editMessage);
router.delete('/events/:eventId/messages/:id', authenticateToken, messagesController.deleteMessage);

// ============ BUDGET ROUTES — BRD 3.4, issue #374 ============
router.get('/events/:eventId/budget/categories', authenticateToken, budgetController.listCategories);
router.get('/events/:eventId/budget/compare', authenticateToken, budgetController.compareSimilarEvents);
router.post('/events/:eventId/budget/categories', authenticateToken, budgetController.createCategory);
router.put('/events/:eventId/budget/categories/:id', authenticateToken, budgetController.updateCategory);
router.delete('/events/:eventId/budget/categories/:id', authenticateToken, budgetController.deleteCategory);
router.get('/events/:eventId/expenses', authenticateToken, budgetController.listExpenses);
router.get('/events/:eventId/expenses/workflow-summary', authenticateToken, budgetController.getExpenseWorkflowSummary);
router.post('/events/:eventId/expenses', authenticateToken, budgetController.createExpense);
router.put('/events/:eventId/expenses/:id', authenticateToken, budgetController.updateExpense);
router.post('/events/:eventId/expenses/:id/ocr/extract', authenticateToken, budgetController.extractExpenseReceiptOcr);
router.post('/events/:eventId/expenses/:id/ocr/:ocrId/apply', authenticateToken, budgetController.applyExpenseReceiptOcr);
router.patch('/events/:eventId/expenses/:id/approval', authenticateToken, budgetController.reviewExpenseApproval);
router.post('/events/:eventId/expenses/:id/reimbursement-request', authenticateToken, budgetController.requestExpenseReimbursement);
router.patch('/events/:eventId/expenses/:id/reimbursement', authenticateToken, budgetController.resolveExpenseReimbursement);
router.delete('/events/:eventId/expenses/:id', authenticateToken, budgetController.deleteExpense);

// ============ BUDGET TEMPLATES — #438 ============
router.get('/budget-templates', authenticateToken, budgetTemplatesController.listTemplates);
router.get('/budget-templates/:id', authenticateToken, budgetTemplatesController.getTemplate);
router.post('/budget-templates', authenticateToken, budgetTemplatesController.createTemplate);
router.delete('/budget-templates/:id', authenticateToken, budgetTemplatesController.deleteTemplate);
router.post('/events/:eventId/budget/apply-template', authenticateToken, budgetTemplatesController.applyTemplate);

// ============ TASK DEPENDENCIES — #440 ============
router.get('/events/:eventId/tasks/:taskId/dependencies', authenticateToken, taskDepsController.listDependencies);
router.post('/events/:eventId/tasks/:taskId/dependencies', authenticateToken, taskDepsController.addDependency);
router.delete('/events/:eventId/tasks/:taskId/dependencies/:depId', authenticateToken, taskDepsController.removeDependency);

// ============ TASK TEMPLATES & TIME ENTRIES — #450 ============
router.get('/events/:eventId/task-templates', authenticateToken, taskTemplatesController.listTaskTemplates);
router.post('/events/:eventId/task-templates', authenticateToken, taskTemplatesController.createTaskTemplate);
router.delete('/events/:eventId/task-templates/:id', authenticateToken, taskTemplatesController.deleteTaskTemplate);
router.post('/events/:eventId/task-templates/:id/apply', authenticateToken, taskTemplatesController.applyTaskTemplate);
router.get('/events/:eventId/tasks/:taskId/time-entries', authenticateToken, taskTemplatesController.listTimeEntries);
router.post('/events/:eventId/tasks/:taskId/time-entries', authenticateToken, taskTemplatesController.addTimeEntry);
router.delete('/events/:eventId/tasks/:taskId/time-entries/:id', authenticateToken, taskTemplatesController.deleteTimeEntry);

// ============ WORKLOAD DASHBOARD — #451 ============
router.get('/events/:eventId/workload', authenticateToken, workloadController.getWorkload);

// ============ SHOPPING → BUDGET SYNC — #439 ============
router.post(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/sync-to-budget',
  authenticateToken,
  shoppingBudgetSyncController.syncItemToBudget,
);

// ============ VENDOR COMMUNICATION LOG & COMPARE — #452 (registered in vendor section above)

// ============ VENDOR PERFORMANCE METRICS — #463 (registered in vendor section above)

// ============ STORE SUGGESTIONS — #464
router.get('/events/:eventId/store-suggestions', authenticateToken, storeSuggestionsController.listStoreSuggestions);
router.post('/events/:eventId/store-suggestions', authenticateToken, storeSuggestionsController.createStoreSuggestion);
router.patch('/events/:eventId/store-suggestions/:id', authenticateToken, storeSuggestionsController.updateStoreSuggestionStatus);
router.delete('/events/:eventId/store-suggestions/:id', authenticateToken, storeSuggestionsController.deleteStoreSuggestion);
// #607 — store suggestion engine
router.get('/events/:eventId/store-suggestions/recommendations', authenticateToken, storeSuggestionsController.getStoreSuggestionRecommendations);
router.get('/events/:eventId/store-suggestions/categories', authenticateToken, storeSuggestionsController.listStoreSuggestionCategories);
router.post('/events/:eventId/store-suggestions/:id/select', authenticateToken, storeSuggestionsController.selectStoreSuggestion);

// ============ TIMELINE CONFLICT DETECTION — #441 (registered in timeline section above)

// ============ SCHEDULED REPORTS — #562 ============
router.get('/events/:eventId/reports', authenticateToken, reportsController.listReports);
router.post('/events/:eventId/reports', authenticateToken, reportsController.createReport);
router.patch('/events/:eventId/reports/:reportId', authenticateToken, reportsController.updateReport);
router.delete('/events/:eventId/reports/:reportId', authenticateToken, reportsController.deleteReport);
router.get('/events/:eventId/reports/:reportId/render', authenticateToken, reportsController.renderReport);
router.post('/events/:eventId/reports/:reportId/delivery', authenticateToken, reportsController.recordDelivery);
router.get('/admin/reports/due', authenticateToken, authorizeRole(['Admin']), reportsController.listDueReports);

// ============ POWER-USER GLOBAL SEARCH — #581 ============
router.get('/search', authenticateToken, globalSearchController.globalSearch);

// ============ #532 STORY: Tasks / Timeline / Collaboration / Notification Parity ============

// ── #603/#604/#605/#606: Multi-assignee, full status lifecycle, escalation, my tasks ──────
router.get('/tasks/my-tasks', authenticateToken, taskMultiAssigneeController.getMyTasks);
router.get('/tasks/capacity', authenticateToken, taskMultiAssigneeController.getCapacityPlanning);
router.get('/events/:eventId/tasks/:taskId/assignees', authenticateToken, taskMultiAssigneeController.listTaskAssignees);
router.post('/events/:eventId/tasks/:taskId/assignees', authenticateToken, taskMultiAssigneeController.addTaskAssignee);
router.delete('/events/:eventId/tasks/:taskId/assignees/:userId', authenticateToken, taskMultiAssigneeController.removeTaskAssignee);
router.patch('/events/:eventId/tasks/:taskId/status', authenticateToken, taskMultiAssigneeController.updateTaskStatus);
router.post('/events/:eventId/tasks/:taskId/verify', authenticateToken, taskMultiAssigneeController.verifyTaskCompletion);
router.get('/events/:eventId/escalation-policy', authenticateToken, taskMultiAssigneeController.getEscalationPolicy);
router.put('/events/:eventId/escalation-policy', authenticateToken, taskMultiAssigneeController.upsertEscalationPolicy);
router.post('/events/:eventId/tasks/escalate-overdue', authenticateToken, taskMultiAssigneeController.escalateOverdueTasks);

// ── #612/#613/#614/#615/#616: Timeline templates, buffer-time, reorder, execution ──────────
router.get('/timeline-templates', authenticateToken, timelineTemplatesController.listTimelineTemplates);
router.get('/timeline-templates/:id', authenticateToken, timelineTemplatesController.getTimelineTemplate);
router.post('/timeline-templates', authenticateToken, timelineTemplatesController.createTimelineTemplate);
router.delete('/timeline-templates/:id', authenticateToken, timelineTemplatesController.deleteTimelineTemplate);
router.post('/events/:eventId/timeline/apply-template', authenticateToken, timelineTemplatesController.applyTimelineTemplate);
router.patch('/events/:eventId/timeline/reorder', authenticateToken, timelineTemplatesController.reorderTimeline);
router.patch('/events/:eventId/timeline/:id/buffer', authenticateToken, timelineTemplatesController.updateActivityBuffer);
router.patch('/events/:eventId/timeline/:id/execution', authenticateToken, timelineTemplatesController.updateExecutionStatus);

// ── #623/#624: Notification preferences and batching ─────────────────────────────────────
router.get('/notifications/preferences', authenticateToken, notificationsController.listNotificationPreferences);
router.put('/notifications/preferences/:type', authenticateToken, notificationsController.upsertNotificationPreference);
router.get('/notifications/batch-rules', authenticateToken, notificationsController.listBatchRules);

// ── #625/#626/#627: Collaboration — presence and conflict resolution ──────────────────────
router.post('/presence', authenticateToken, collaborationController.heartbeatPresence);
router.get('/presence', authenticateToken, collaborationController.getPresence);
router.delete('/presence', authenticateToken, collaborationController.leavePresence);
router.get('/events/:eventId/presence', authenticateToken, collaborationController.getEventPresence);

// ── #628: Event team chat ─────────────────────────────────────────────────────────────────
router.get('/events/:eventId/chat', authenticateToken, eventChatController.listChatMessages);
router.post('/events/:eventId/chat', authenticateToken, eventChatController.postChatMessage);
router.patch('/events/:eventId/chat/:id', authenticateToken, eventChatController.editChatMessage);
router.delete('/events/:eventId/chat/:id', authenticateToken, eventChatController.deleteChatMessage);

// ── #629: Version history and rollback ───────────────────────────────────────────────────
router.get('/entity-versions/:id', authenticateToken, entityVersionsController.getEntityVersion);
router.get('/events/:eventId/tasks/:entityId/versions', authenticateToken, entityVersionsController.listEntityVersions);
router.get('/events/:eventId/timeline/:entityId/versions', authenticateToken, (req, res) => {
  req.query.entity_type = 'timeline_activity';
  return entityVersionsController.listEntityVersions(req, res);
});
router.post('/events/:eventId/tasks/:entityId/rollback', authenticateToken, entityVersionsController.rollbackEntityVersion);
router.post('/events/:eventId/timeline/:entityId/rollback', authenticateToken, (req, res) => {
  (req.body as Record<string, unknown>).entity_type = 'timeline_activity';
  return entityVersionsController.rollbackEntityVersion(req, res);
});

// ============ GUEST GROUPS & BULK OPS — #667 ============
router.get('/events/:eventId/guest-groups', authenticateToken, guestGroupsController.listGuestGroups);
router.post('/events/:eventId/guest-groups', authenticateToken, guestGroupsController.createGuestGroup);
router.put('/events/:eventId/guest-groups/:id', authenticateToken, guestGroupsController.updateGuestGroup);
router.delete('/events/:eventId/guest-groups/:id', authenticateToken, guestGroupsController.deleteGuestGroup);
router.post('/events/:eventId/guest-groups/:id/members', authenticateToken, guestGroupsController.addGroupMembers);
router.delete('/events/:eventId/guest-groups/:id/members', authenticateToken, guestGroupsController.removeGroupMembers);
router.post('/events/:eventId/guest-groups/csv-import', authenticateToken, guestGroupsController.csvImportGuests);
router.post('/events/:eventId/guest-groups/bulk-checkin', authenticateToken, guestGroupsController.bulkCheckIn);

// ============ GDPR — #680 ============
// Each call serialises (export) or cascade-deletes (erase) the caller's full
// data graph — expensive and seldom-used. gdprLimiter caps to 5/hr per IP so
// authenticated abuse can't be used to DoS the DB.
router.get('/profile/data-export', authenticateToken, gdprLimiter, gdprController.exportPersonalData);
router.delete('/profile/erase', authenticateToken, gdprLimiter, gdprController.erasePersonalData);
router.post('/admin/users/:id/erase', authenticateToken, authorizeRole(['Admin']), gdprLimiter, gdprController.adminErasePersonalData);

// ============ ANNOUNCEMENTS & EMAIL WEBHOOKS — #671 ============
router.post('/events/:eventId/announcements', authenticateToken, announcementController.sendAnnouncement);
router.get('/events/:eventId/communication/stats', authenticateToken, announcementController.getCommunicationStats);
// Bounce webhook is registered at the TOP LEVEL (see backend/src/index.ts)
// rather than under /api. The /api mount applies a double-submit CSRF check
// to every non-GET request, and external email providers cannot send our
// CSRF token. Mounting the webhook directly on the app bypasses that check;
// the HMAC signature verifier (verify-email-webhook.ts) is the real auth.

// ============ BUDGET EXTENSIONS — #668 ============
router.get('/events/:eventId/budget/expenses/export', authenticateToken, budgetController.exportExpensesAsCsv);
router.get('/events/:eventId/budget/fx-status', authenticateToken, budgetController.getFxStatus);

// ============ ADMIN EXTENSIONS — #677 ============
router.get('/admin/stats', authenticateToken, authorizeRole(['Admin']), adminController.getSystemStats);

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
         VALUES ($1, $2, $3, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
