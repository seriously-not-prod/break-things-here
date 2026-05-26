import { Router } from 'express';
import * as legacyRsvpController from '../controllers/rsvp-controller.js';
import * as rsvpController from '../controllers/rsvps-controller.js';
import * as guestMergeController from '../controllers/guest-merge-controller.js';
import * as rsvpConfirmationController from '../controllers/rsvp-confirmation-controller.js';
import * as rsvpTokenController from '../controllers/rsvp-token-controller.js';
import * as waitlistController from '../controllers/waitlist-controller.js';
import * as rsvpQuestionsController from '../controllers/rsvp-questions-controller.js';
import * as guestExportController from '../controllers/guest-export-controller.js';
import * as guestGroupsController from '../controllers/guest-groups-controller.js';
import * as guestsController from '../controllers/guests-controller.js';
import * as mealOptionsController from '../controllers/meal-options-controller.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';

const router = Router();

// In-memory multer for CSV / XLSX imports (no disk write needed)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const lower = file.originalname.toLowerCase();
    const acceptedMimes = new Set([
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
    if (
      acceptedMimes.has(file.mimetype) ||
      lower.endsWith('.csv') ||
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files (.csv, .xlsx, .xls) are accepted'));
    }
  },
});

// ============ LEGACY RSVP ROUTES ============
router.get('/rsvps', authenticateToken, legacyRsvpController.getAllRsvps);
router.get('/rsvps/:id', authenticateToken, legacyRsvpController.getRsvpById);
router.post('/rsvps', legacyRsvpController.submitRsvp);
router.put('/rsvps/:id', authenticateToken, legacyRsvpController.updateRsvp);
router.delete('/rsvps/:id', authenticateToken, legacyRsvpController.deleteRsvp);

// ============ GUESTS (new-style) ROUTES ============
router.get('/events/:eventId/guests', authenticateToken, rsvpController.listRsvps);
router.post('/events/:eventId/guests', authenticateToken, rsvpController.createRsvp);
router.get('/events/:eventId/guests/export', authenticateToken, rsvpController.exportRsvpsCsv);
router.post(
  '/events/:eventId/guests/import',
  authenticateToken,
  csvUpload.single('file'),
  rsvpController.importCsv,
);
router.patch('/events/:eventId/guests/:id', authenticateToken, rsvpController.updateRsvp);
router.delete('/events/:eventId/guests/:id', authenticateToken, rsvpController.deleteRsvp);
router.patch('/events/:eventId/guests/:id/checkin', authenticateToken, rsvpController.checkInGuest);

// ============ RSVP ROUTES ============
router.get('/events/:eventId/rsvps', authenticateToken, rsvpController.listRsvps);
router.post('/events/:eventId/rsvps', rsvpController.createRsvp);
router.get('/events/:eventId/rsvps/export', authenticateToken, rsvpController.exportRsvpsCsv);
router.get(
  '/events/:eventId/rsvps/import/template.csv',
  authenticateToken,
  rsvpController.exportRsvpsImportTemplateCsv,
);
router.get(
  '/events/:eventId/rsvps/export.xlsx',
  authenticateToken,
  guestExportController.exportRsvpsXlsx,
);
router.get(
  '/events/:eventId/rsvps/export.pdf',
  authenticateToken,
  guestExportController.exportRsvpsPdfData,
);
router.post(
  '/events/:eventId/rsvps/import',
  authenticateToken,
  csvUpload.single('file'),
  rsvpController.importCsv,
);
router.get(
  '/events/:eventId/rsvps/duplicates',
  authenticateToken,
  guestMergeController.listDuplicates,
);
router.get(
  '/events/:eventId/rsvps/lookup',
  authenticateToken,
  guestMergeController.lookupRsvpsByEmail,
);
router.get('/events/:eventId/guest-merges', authenticateToken, guestMergeController.listMergeAudit);
router.post(
  '/events/:eventId/rsvps/:id/merge',
  authenticateToken,
  guestMergeController.mergeGuests,
);
router.post(
  '/events/:eventId/rsvps/:id/send-confirmation',
  authenticateToken,
  rsvpConfirmationController.sendRsvpConfirmation,
);
router.get(
  '/events/:eventId/rsvps/:id/ics',
  authenticateToken,
  rsvpConfirmationController.downloadRsvpIcs,
);
router.get(
  '/events/:eventId/rsvps/:id/qr.svg',
  authenticateToken,
  rsvpConfirmationController.getRsvpQr,
);
router.post(
  '/events/:eventId/rsvps/:id/token',
  authenticateToken,
  rsvpTokenController.issueRsvpToken,
);
router.patch('/events/:eventId/rsvps/:id', authenticateToken, rsvpController.updateRsvp);
router.patch('/events/:eventId/rsvps/:id/checkin', authenticateToken, rsvpController.checkInGuest);
router.patch(
  '/events/:eventId/rsvps/:id/unsubscribe',
  authenticateToken,
  rsvpController.setUnsubscribed,
);
router.delete('/events/:eventId/rsvps/:id', authenticateToken, rsvpController.deleteRsvp);

// ============ WAITLIST ROUTES — #413, #442 ============
router.get('/events/:eventId/waitlist', authenticateToken, waitlistController.listWaitlist);
router.post('/events/:eventId/waitlist', authenticateToken, waitlistController.addRsvpToWaitlist);
router.post(
  '/events/:eventId/waitlist/promote',
  authenticateToken,
  waitlistController.promoteWaitlist,
);
router.delete(
  '/events/:eventId/waitlist/:id',
  authenticateToken,
  waitlistController.removeFromWaitlist,
);

// ============ CUSTOM RSVP QUESTIONS — #413, #443 ============
router.get(
  '/events/:eventId/rsvp-questions',
  authenticateToken,
  rsvpQuestionsController.listQuestions,
);
router.post(
  '/events/:eventId/rsvp-questions',
  authenticateToken,
  rsvpQuestionsController.createQuestion,
);
router.patch(
  '/events/:eventId/rsvp-questions/:id',
  authenticateToken,
  rsvpQuestionsController.updateQuestion,
);
router.delete(
  '/events/:eventId/rsvp-questions/:id',
  authenticateToken,
  rsvpQuestionsController.deleteQuestion,
);
router.get(
  '/events/:eventId/rsvp-questions/responses',
  authenticateToken,
  rsvpQuestionsController.listResponses,
);

// ============ GUEST GROUPS & BULK OPS — #667 ============
router.get('/events/:eventId/guest-groups', authenticateToken, guestGroupsController.listGuestGroups);
router.post('/events/:eventId/guest-groups', authenticateToken, guestGroupsController.createGuestGroup);
router.put(
  '/events/:eventId/guest-groups/:id',
  authenticateToken,
  guestGroupsController.updateGuestGroup,
);
router.delete(
  '/events/:eventId/guest-groups/:id',
  authenticateToken,
  guestGroupsController.deleteGuestGroup,
);
router.post(
  '/events/:eventId/guest-groups/:id/members',
  authenticateToken,
  guestGroupsController.addGroupMembers,
);
router.delete(
  '/events/:eventId/guest-groups/:id/members',
  authenticateToken,
  guestGroupsController.removeGroupMembers,
);
router.post(
  '/events/:eventId/guest-groups/csv-import',
  authenticateToken,
  guestGroupsController.csvImportGuests,
);
router.post(
  '/events/:eventId/guest-groups/bulk-checkin',
  authenticateToken,
  guestGroupsController.bulkCheckIn,
);

router.get('/events/:eventId/guest-records', authenticateToken, guestsController.listGuests);
router.get('/events/:eventId/guest-records/:id', authenticateToken, guestsController.getGuest);
router.post('/events/:eventId/guest-records', authenticateToken, guestsController.createGuest);
router.put('/events/:eventId/guest-records/:id', authenticateToken, guestsController.updateGuest);
router.delete(
  '/events/:eventId/guest-records/:id',
  authenticateToken,
  guestsController.deleteGuest,
);

// ============ MEAL OPTIONS (#591) ============
router.get('/events/:eventId/meal-options', authenticateToken, mealOptionsController.listMealOptions);
router.post(
  '/events/:eventId/meal-options',
  authenticateToken,
  mealOptionsController.createMealOption,
);
router.put(
  '/events/:eventId/meal-options/:id',
  authenticateToken,
  mealOptionsController.updateMealOption,
);
router.delete(
  '/events/:eventId/meal-options/:id',
  authenticateToken,
  mealOptionsController.deleteMealOption,
);

export default router;
