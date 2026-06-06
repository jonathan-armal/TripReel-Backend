const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getMe,
  updateProfile,
} = require("../controllers/operatorAuthController");
const { operatorProtect } = require("../middleware/operatorAuthMiddleware");

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes
router.get("/me", operatorProtect, getMe);
router.patch("/profile", operatorProtect, updateProfile);

module.exports = router;
