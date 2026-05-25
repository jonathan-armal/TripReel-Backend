const express = require('express')
const router = express.Router()
const {
    getAllTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    deleteTemplate,
} = require('../controllers/packageTemplateController')
const { protect, restrictTo } = require('../middleware/authMiddleware')

router.get('/', getAllTemplates)
router.get('/:id', getTemplateById)

router.post('/', protect, restrictTo('admin'), createTemplate)
router.put('/:id', protect, restrictTo('admin'), updateTemplate)
router.delete('/:id', protect, restrictTo('admin'), deleteTemplate)

module.exports = router
