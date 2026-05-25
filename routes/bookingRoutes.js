const express = require('express')
const router = express.Router()
const {
    adminGetAllBookings,
    getMyBookings,
    getBookingById,
    createBooking,
    updateBookingStatus,
} = require('../controllers/bookingController')
const { protect, restrictTo } = require('../middleware/authMiddleware')

router.use(protect)

router.get('/my', getMyBookings)
router.post('/', createBooking)
router.get('/:id', getBookingById)

router.get('/', restrictTo('admin'), adminGetAllBookings)
router.patch('/:id/status', restrictTo('admin'), updateBookingStatus)

module.exports = router
