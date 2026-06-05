const express = require("express");
const router = express.Router();
const { runCron } = require("../controllers/cronController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

// Admin-only manual trigger
router.post("/run", protect, restrictTo("admin"), runCron);

module.exports = router;
