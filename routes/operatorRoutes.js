const express = require('express')
const router = express.Router()

const { protect, restrictTo } = require('../middleware/authMiddleware')
const { operatorProtect } = require('../middleware/operatorAuthMiddleware')
const operatorUpload = require('../middleware/operatorUploadMiddleware')
const {
    getAllOperators,
    getOperatorById,
    transitionState,
    submitOnboarding,
    reuploadDocument,
    updateDocumentStatus,
} = require('../controllers/operatorController')

// Operator: submit onboarding form (must come before /:id to avoid route conflict)
router.post(
    '/onboarding',
    operatorProtect,
    operatorUpload.fields([
        { name: 'gstCertificate', maxCount: 1 },
        { name: 'pan', maxCount: 1 },
        { name: 'incorporationCertificate', maxCount: 1 },
        { name: 'bankProof', maxCount: 1 },
        { name: 'tan', maxCount: 1 },
        { name: 'industryAssociationCertificate', maxCount: 1 },
        { name: 'liabilityInsuranceCertificate', maxCount: 1 },
        { name: 'authorizedSignatoryIdProof', maxCount: 1 },
        { name: 'tourismTravelLicense', maxCount: 1 },
        { name: 'officeAddressProof', maxCount: 1 },
        { name: 'companyLogo', maxCount: 1 },
        { name: 'coverBanner', maxCount: 1 },
    ]),
    submitOnboarding
)

// Operator: re-upload a document requested by admin
router.patch(
    '/documents/reupload',
    operatorProtect,
    operatorUpload.single('file'),
    reuploadDocument
)

// Admin: list all operators
router.get('/', protect, restrictTo('admin'), getAllOperators)

// Admin: get single operator
router.get('/:id', protect, restrictTo('admin'), getOperatorById)

// Admin: change operator state
router.patch('/:id/state', protect, restrictTo('admin'), transitionState)

// Admin: update document status (approve/reject/reupload)
router.patch('/:id/document-status', protect, restrictTo('admin'), updateDocumentStatus)

module.exports = router
