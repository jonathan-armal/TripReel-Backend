const express = require("express");
const router = express.Router();
const {
  operatorGetMyBookings,
} = require("../controllers/tripBookingController");
const { operatorProtect } = require("../middleware/operatorAuthMiddleware");

router.get("/", operatorProtect, operatorGetMyBookings);

module.exports = router;
