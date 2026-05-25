const mongoose = require('mongoose')

const seasonalPricingSchema = new mongoose.Schema(
    {
        startDate: { type: Date },
        endDate: { type: Date },
        price: { type: Number, min: 0 },
        notes: { type: String, default: '', trim: true },
    },
    { _id: false }
)

const packageListingSchema = new mongoose.Schema(
    {
        templateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PackageTemplate',
            required: true,
            index: true,
        },
        operatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Operator',
            required: true,
            index: true,
        },
        hotel: {
            name: { type: String, default: '', trim: true },
            category: { type: String, default: '', trim: true },
        },
        meals: [{ type: String }],
        inclusions: [{ type: String }],
        exclusions: [{ type: String }],
        basePrice: {
            type: Number,
            required: [true, 'Base price is required'],
            min: 0,
        },
        currency: {
            type: String,
            default: 'INR',
            trim: true,
        },
        gstMode: {
            type: String,
            enum: ['GST_5_NO_ITC', 'GST_18_ITC'],
            default: 'GST_5_NO_ITC',
        },
        gstRate: {
            type: Number,
            default: 5,
            min: 0,
        },
        tcsRate: {
            type: Number,
            default: 0,
            min: 0,
        },
        cancellationPolicy: {
            type: String,
            default: '',
        },
        seasonalPricing: [seasonalPricingSchema],
        status: {
            type: String,
            enum: ['PENDING', 'NEEDS_REVISION', 'APPROVED', 'REJECTED'],
            default: 'PENDING',
        },
        adminNotes: {
            type: String,
            default: '',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
)

packageListingSchema.pre('validate', function (next) {
    if (this.gstMode === 'GST_18_ITC') this.gstRate = 18
    else this.gstRate = 5
    next()
})

packageListingSchema.index({ templateId: 1, operatorId: 1 }, { unique: true })

module.exports = mongoose.model('PackageListing', packageListingSchema)
