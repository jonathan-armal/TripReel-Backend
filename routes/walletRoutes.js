const express = require("express");
const router = express.Router();
const {
  getMyWallet,
  getMyTransactions,
  adminGetAllWallets,
  adminGetWallet,
} = require("../controllers/walletController");
const { protect, restrictTo } = require("../middleware/authMiddleware");
const { operatorProtect } = require("../middleware/operatorAuthMiddleware");

// ── Operator ──────────────────────────────────────────────────────────────────
router.get("/", operatorProtect, getMyWallet);
router.get("/transactions", operatorProtect, getMyTransactions);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get("/admin/all", protect, restrictTo("admin"), adminGetAllWallets);
router.get("/admin/:operatorId", protect, restrictTo("admin"), adminGetWallet);

module.exports = router;
