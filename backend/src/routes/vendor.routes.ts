import { Router } from 'express';
import * as vendorsController from '../controllers/vendors-controller.js';
import * as shoppingController from '../controllers/shopping-controller.js';
import * as vendorCommController from '../controllers/vendor-communication-controller.js';
import * as vendorPerfController from '../controllers/vendor-performance-controller.js';
import * as storeSuggestionsController from '../controllers/store-suggestions-controller.js';
import * as shoppingBudgetSyncController from '../controllers/shopping-budget-sync-controller.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const VENDOR_CONTRACTS_DIR = path.resolve('uploads/vendor-contracts');
if (!fs.existsSync(VENDOR_CONTRACTS_DIR)) fs.mkdirSync(VENDOR_CONTRACTS_DIR, { recursive: true });

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

// ============ VENDOR ROUTES — BRD 3.6 ============
router.get('/events/:eventId/vendors', authenticateToken, vendorsController.listVendors);
router.post('/events/:eventId/vendors', authenticateToken, vendorsController.createVendor);
router.get(
  '/events/:eventId/vendors/favorites',
  authenticateToken,
  vendorsController.listFavoriteVendors,
);
router.get(
  '/events/:eventId/vendors/compare',
  authenticateToken,
  vendorCommController.compareVendors,
);
router.get(
  '/events/:eventId/vendors/performance',
  authenticateToken,
  vendorPerfController.listVendorPerformance,
);
router.put('/events/:eventId/vendors/:id', authenticateToken, vendorsController.updateVendor);
router.delete('/events/:eventId/vendors/:id', authenticateToken, vendorsController.deleteVendor);
router.put(
  '/events/:eventId/vendors/:id/favorite',
  authenticateToken,
  vendorsController.setVendorFavorite,
);
router.post(
  '/events/:eventId/vendors/:id/contract',
  authenticateToken,
  contractUpload.single('file'),
  vendorsController.uploadContract,
);
router.get(
  '/events/:eventId/vendors/:id/booking',
  authenticateToken,
  vendorsController.getVendorBooking,
);
router.put(
  '/events/:eventId/vendors/:id/booking',
  authenticateToken,
  vendorsController.upsertVendorBooking,
);
router.get(
  '/events/:eventId/vendors/:id/payment-schedules',
  authenticateToken,
  vendorsController.listVendorPaymentSchedules,
);
router.post(
  '/events/:eventId/vendors/:id/payment-schedules',
  authenticateToken,
  vendorsController.createVendorPaymentSchedule,
);
router.get(
  '/events/:eventId/vendors/:vendorId/communication',
  authenticateToken,
  vendorCommController.listVendorCommunication,
);
router.post(
  '/events/:eventId/vendors/:vendorId/communication',
  authenticateToken,
  vendorCommController.addVendorCommunication,
);
router.delete(
  '/events/:eventId/vendors/:vendorId/communication/:logId',
  authenticateToken,
  vendorCommController.deleteVendorCommunication,
);
router.get(
  '/events/:eventId/vendors/:vendorId/performance',
  authenticateToken,
  vendorPerfController.getVendorPerformance,
);

// ============ SHOPPING LIST ROUTES — BRD 3.7 ============
router.get('/events/:eventId/shopping-lists', authenticateToken, shoppingController.listLists);
router.post('/events/:eventId/shopping-lists', authenticateToken, shoppingController.createList);
router.delete(
  '/events/:eventId/shopping-lists/:listId',
  authenticateToken,
  shoppingController.deleteList,
);
router.get(
  '/events/:eventId/shopping-lists/:listId/items',
  authenticateToken,
  shoppingController.listItems,
);
router.post(
  '/events/:eventId/shopping-lists/:listId/items',
  authenticateToken,
  shoppingController.createItem,
);
router.put(
  '/events/:eventId/shopping-lists/:listId/items/:itemId',
  authenticateToken,
  shoppingController.updateItem,
);
router.delete(
  '/events/:eventId/shopping-lists/:listId/items/:itemId',
  authenticateToken,
  shoppingController.deleteItem,
);
// #552/#608 — price comparison endpoints
router.patch(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/price-data',
  authenticateToken,
  shoppingController.updateItemPriceData,
);
router.get(
  '/events/:eventId/shopping-lists/:listId/price-comparison',
  authenticateToken,
  shoppingController.getListPriceComparison,
);
router.get(
  '/events/:eventId/shopping/price-comparison',
  authenticateToken,
  shoppingController.getEventPriceComparison,
);

// ============ SHOPPING → BUDGET SYNC — #439 / #800 ============
router.post(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/sync-to-budget',
  authenticateToken,
  shoppingBudgetSyncController.syncItemToBudget,
);
router.delete(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/sync-to-budget',
  authenticateToken,
  shoppingBudgetSyncController.unsyncItemFromBudget,
);

// ============ STORE SUGGESTIONS — #464 ============
router.get(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/stores',
  authenticateToken,
  storeSuggestionsController.listStoreSuggestions,
);
router.post(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/stores',
  authenticateToken,
  storeSuggestionsController.createStoreSuggestion,
);
router.put(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/stores/:storeId',
  authenticateToken,
  storeSuggestionsController.updateStoreSuggestionStatus,
);
router.delete(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/stores/:storeId',
  authenticateToken,
  storeSuggestionsController.deleteStoreSuggestion,
);
router.get(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/store-suggestions',
  authenticateToken,
  storeSuggestionsController.listStoreSuggestions,
);
router.post(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/store-suggestions',
  authenticateToken,
  storeSuggestionsController.createStoreSuggestion,
);
router.put(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/store-suggestions/:storeId',
  authenticateToken,
  storeSuggestionsController.updateStoreSuggestionStatus,
);
router.delete(
  '/events/:eventId/shopping-lists/:listId/items/:itemId/store-suggestions/:storeId',
  authenticateToken,
  storeSuggestionsController.deleteStoreSuggestion,
);

// Event-level store suggestions routes
router.get(
  '/events/:eventId/store-suggestions',
  authenticateToken,
  storeSuggestionsController.listStoreSuggestions,
);
router.post(
  '/events/:eventId/store-suggestions',
  authenticateToken,
  storeSuggestionsController.createStoreSuggestion,
);
router.patch(
  '/events/:eventId/store-suggestions/:id',
  authenticateToken,
  storeSuggestionsController.updateStoreSuggestionStatus,
);
router.delete(
  '/events/:eventId/store-suggestions/:id',
  authenticateToken,
  storeSuggestionsController.deleteStoreSuggestion,
);
router.get(
  '/events/:eventId/store-suggestions/recommendations',
  authenticateToken,
  storeSuggestionsController.getStoreSuggestionRecommendations,
);
router.get(
  '/events/:eventId/store-suggestions/categories',
  authenticateToken,
  storeSuggestionsController.listStoreSuggestionCategories,
);
router.post(
  '/events/:eventId/store-suggestions/:id/select',
  authenticateToken,
  storeSuggestionsController.selectStoreSuggestion,
);

export default router;
