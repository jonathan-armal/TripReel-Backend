const { Operator, VALID_STATES } = require('../models/Operator')

// GET /api/operators  (admin only)
exports.getAllOperators = async (req, res) => {
    try {
        const { search, state, page = 1, limit = 20 } = req.query
        const query = {}

        if (search) {
            query['$or'] = [
                { businessName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ]
        }

        if (state && state !== 'all') {
            query.onboardingState = state
        }

        const skip = (Number(page) - 1) * Number(limit)

        const [operators, total] = await Promise.all([
            Operator.find(query).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
            Operator.countDocuments(query),
        ])

        res.json({ success: true, total, page: Number(page), operators })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}

// GET /api/operators/:id  (admin only)
exports.getOperatorById = async (req, res) => {
    try {
        const operator = await Operator.findById(req.params.id)
        if (!operator) {
            return res.status(404).json({ success: false, message: 'Operator not found' })
        }
        res.json({ success: true, operator })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}

// PATCH /api/operators/:id/state  (admin only)
exports.transitionState = async (req, res) => {
    try {
        const { newState, note } = req.body

        if (!VALID_STATES.includes(newState)) {
            return res.status(400).json({ success: false, message: 'Invalid state' })
        }

        if (!note || note.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Transition note is required' })
        }

        const operator = await Operator.findById(req.params.id)
        if (!operator) {
            return res.status(404).json({ success: false, message: 'Operator not found' })
        }

        operator.transitionHistory.push({
            fromState: operator.onboardingState,
            toState: newState,
            note: note.trim(),
            performedBy: req.user._id,
            timestamp: new Date(),
        })

        operator.onboardingState = newState

        await operator.save()

        res.json({ success: true, operator })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}

// POST /api/operators/onboarding  (operator protected)
exports.submitOnboarding = async (req, res) => {
    try {
        const {
            businessName,
            registeredAddress,
            officeAddress,
            businessInfo,
            gstin,
            pan,
            tan,
            bankAccountNumber,
            yearsOfExperience,
            toursConducted,
            regionsOperated,
            tourTypes,
            servicesOffered,
            tourismTravelLicenseExpiry,
            liabilityInsuranceExpiry,
        } = req.body

        const operator = await Operator.findById(req.operator._id)
        if (!operator) {
            return res.status(404).json({ success: false, message: 'Operator not found' })
        }

        if (operator.onboardingState !== 'DRAFT') {
            return res.status(400).json({ success: false, message: 'Onboarding form already submitted' })
        }

        // Update business fields
        operator.businessName = businessName
        operator.registeredAddress = registeredAddress
        operator.officeAddress = officeAddress
        operator.businessInfo = businessInfo
        operator.gstin = gstin
        operator.pan = pan
        operator.tan = tan
        operator.bankAccountNumber = bankAccountNumber
        operator.yearsOfExperience = Number(yearsOfExperience || 0)
        operator.toursConducted = Number(toursConducted || 0)

        const parseList = (val) => {
            if (!val) return []
            if (Array.isArray(val)) return val.filter(Boolean)
            if (typeof val === 'string') {
                try {
                    const parsed = JSON.parse(val)
                    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
                } catch {
                    return val
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean)
                }
            }
            return []
        }

        const parseDate = (val) => {
            if (!val) return undefined
            const d = new Date(val)
            return Number.isNaN(d.getTime()) ? undefined : d
        }
        operator.regionsOperated = parseList(regionsOperated)
        operator.tourTypes = parseList(tourTypes)
        operator.servicesOffered = parseList(servicesOffered)
        operator.tourismTravelLicenseExpiry = parseDate(tourismTravelLicenseExpiry)
        operator.liabilityInsuranceExpiry = parseDate(liabilityInsuranceExpiry)

        // Update document paths from uploaded files
        const documentFields = [
            'gstCertificate',
            'pan',
            'incorporationCertificate',
            'bankProof',
            'tan',
            'industryAssociationCertificate',
            'liabilityInsuranceCertificate',
            'authorizedSignatoryIdProof',
            'tourismTravelLicense',
            'officeAddressProof',
            'companyLogo',
            'coverBanner',
        ]

        if (req.files) {
            for (const fieldName of documentFields) {
                if (req.files[fieldName] && req.files[fieldName][0]) {
                    operator.documents[fieldName] = '/uploads/' + req.files[fieldName][0].filename
                    operator.documentStatus[fieldName] = {
                        status: 'PENDING',
                        remark: '',
                        updatedAt: new Date(),
                    }
                }
            }
        }

        operator.onboardingState = 'DOCUMENTS_SUBMITTED'

        await operator.save()

        res.json({ success: true, operator })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}

// PATCH /api/operators/documents/reupload  (operator protected)
exports.reuploadDocument = async (req, res) => {
    try {
        const { key } = req.body

        const allowedKeys = [
            'gstCertificate',
            'pan',
            'incorporationCertificate',
            'bankProof',
            'tan',
            'industryAssociationCertificate',
            'liabilityInsuranceCertificate',
            'authorizedSignatoryIdProof',
            'tourismTravelLicense',
            'officeAddressProof',
            'companyLogo',
            'coverBanner',
        ]

        if (!allowedKeys.includes(key)) {
            return res.status(400).json({ success: false, message: 'Invalid document key' })
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File is required' })
        }

        const operator = await Operator.findById(req.operator._id)
        if (!operator) {
            return res.status(404).json({ success: false, message: 'Operator not found' })
        }

        const currentStatus = operator.documentStatus?.[key]?.status
        if (currentStatus !== 'REUPLOAD_REQUIRED' && currentStatus !== 'REJECTED') {
            return res.status(400).json({
                success: false,
                message: 'Re-upload is not allowed for this document',
            })
        }

        operator.documents[key] = '/uploads/' + req.file.filename
        operator.documentStatus[key] = {
            status: 'PENDING',
            remark: '',
            updatedAt: new Date(),
        }

        await operator.save()

        res.json({ success: true, operator })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}

// PATCH /api/operators/:id/document-status (admin only)
exports.updateDocumentStatus = async (req, res) => {
    try {
        const { key, status, remark } = req.body

        const allowedKeys = [
            'gstCertificate',
            'pan',
            'incorporationCertificate',
            'bankProof',
            'tan',
            'industryAssociationCertificate',
            'liabilityInsuranceCertificate',
            'authorizedSignatoryIdProof',
            'tourismTravelLicense',
            'officeAddressProof',
            'companyLogo',
            'coverBanner',
        ]

        if (!allowedKeys.includes(key)) {
            return res.status(400).json({ success: false, message: 'Invalid document key' })
        }

        const allowedStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'REUPLOAD_REQUIRED']
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' })
        }

        const operator = await Operator.findById(req.params.id)
        if (!operator) return res.status(404).json({ success: false, message: 'Operator not found' })

        operator.documentStatus[key] = {
            status,
            remark: (remark || '').trim(),
            updatedAt: new Date(),
        }

        await operator.save()

        res.json({ success: true, operator })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}
