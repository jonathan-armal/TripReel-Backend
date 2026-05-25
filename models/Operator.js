const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const VALID_STATES = [
    'DRAFT',
    'DOCUMENTS_SUBMITTED',
    'KYC_VERIFICATION',
    'COMMERCIAL_CONTRACT_SENT',
    'CONTRACT_SIGNED',
    'RAZORPAY_LINKED_ACCOUNT_CREATED',
    'TRAINING_COMPLETED',
    'TEST_LISTING_PUBLISHED',
    'ACTIVE_PROBATION',
    'ACTIVE_FULL',
    'SUSPENDED',
    'OFFBOARDED',
]

const transitionHistorySchema = new mongoose.Schema(
    {
        fromState: { type: String, required: true },
        toState: { type: String, required: true },
        note: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
    },
    { _id: false }
)

const documentStatusSchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'REJECTED', 'REUPLOAD_REQUIRED'],
            default: 'PENDING',
        },
        remark: { type: String, default: '', trim: true },
        updatedAt: { type: Date, default: Date.now },
    },
    { _id: false }
)

const operatorSchema = new mongoose.Schema(
    {
        contactName: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        phone: { type: String, trim: true },
        password: { type: String, required: true, minlength: 8, select: false },
        businessName: { type: String, trim: true },
        registeredAddress: { type: String, trim: true },
        officeAddress: { type: String, trim: true },
        businessInfo: { type: String, trim: true },
        gstin: { type: String, trim: true },
        pan: { type: String, trim: true },
        tan: { type: String, trim: true },
        bankAccountNumber: { type: String, trim: true },
        yearsOfExperience: { type: Number, default: 0, min: 0 },
        toursConducted: { type: Number, default: 0, min: 0 },
        regionsOperated: [{ type: String }],
        tourTypes: [{ type: String }],
        servicesOffered: [{ type: String }],
        tourismTravelLicenseExpiry: { type: Date },
        liabilityInsuranceExpiry: { type: Date },
        onboardingState: { type: String, enum: VALID_STATES, default: 'DRAFT' },
        documents: {
            gstCertificate: { type: String },
            pan: { type: String },
            incorporationCertificate: { type: String },
            bankProof: { type: String },
            tan: { type: String },
            industryAssociationCertificate: { type: String },
            liabilityInsuranceCertificate: { type: String },
            authorizedSignatoryIdProof: { type: String },
            tourismTravelLicense: { type: String },
            officeAddressProof: { type: String },
            companyLogo: { type: String },
            coverBanner: { type: String },
        },
        documentStatus: {
            gstCertificate: documentStatusSchema,
            pan: documentStatusSchema,
            incorporationCertificate: documentStatusSchema,
            bankProof: documentStatusSchema,
            tan: documentStatusSchema,
            industryAssociationCertificate: documentStatusSchema,
            liabilityInsuranceCertificate: documentStatusSchema,
            authorizedSignatoryIdProof: documentStatusSchema,
            tourismTravelLicense: documentStatusSchema,
            officeAddressProof: documentStatusSchema,
            companyLogo: documentStatusSchema,
            coverBanner: documentStatusSchema,
        },
        transitionHistory: [transitionHistorySchema],
    },
    { timestamps: true }
)

// Hash password before saving
operatorSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next()
    this.password = await bcrypt.hash(this.password, 12)
    next()
})

// Compare password
operatorSchema.methods.comparePassword = async function (candidate) {
    return bcrypt.compare(candidate, this.password)
}

module.exports = { Operator: mongoose.model('Operator', operatorSchema), VALID_STATES }
