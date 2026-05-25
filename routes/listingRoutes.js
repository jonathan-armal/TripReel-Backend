const express = require('express')
const router = express.Router()
const {
    getAllListings,
    getListingById,
    adminGetAllListings,
    reviewListing,
    operatorGetMyListings,
    operatorCreateListing,
    operatorUpdateListing,
    operatorDeleteListing,
} = require('../controllers/packageListingController')
const { protect, restrictTo } = require('../middleware/authMiddleware')
const { operatorProtect } = require('../middleware/operatorAuthMiddleware')

router.get('/', getAllListings)
router.get('/admin/all', protect, restrictTo('admin'), adminGetAllListings)
router.patch('/:id/review', protect, restrictTo('admin'), reviewListing)

router.get('/operator/mine', operatorProtect, operatorGetMyListings)
router.post('/operator', operatorProtect, operatorCreateListing)
router.put('/operator/:id', operatorProtect, operatorUpdateListing)
router.delete('/operator/:id', operatorProtect, operatorDeleteListing)

router.get('/:id', getListingById)

module.exports = router
