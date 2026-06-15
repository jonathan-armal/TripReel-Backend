const express = require("express");
const router = express.Router();
const {
  operatorGetMyBookings,
  operatorCancelBooking,
  operatorCancelBatch,
} = require("../controllers/tripBookingController");
const { operatorProtect } = require("../middleware/operatorAuthMiddleware");

router.get("/", operatorProtect, operatorGetMyBookings);
router.post("/:id/cancel", operatorProtect, operatorCancelBooking);
router.post("/batch/:batchId/cancel", operatorProtect, operatorCancelBatch);

module.exports = router;
