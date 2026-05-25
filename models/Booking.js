const mongoose = require('mongoose')

const travelerSchema = new mongoose.Schema(
    {
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        dob: { type: Date },
        passportNumber: { type: String, trim: true },
        nationality: { type: String, trim: true },
    },
    { _id: false }
)

const moneySchema = new mongoose.Schema(
    {
        currency: { type: String, default: 'INR', trim: true },
        baseAmount: { type: Number, default: 0, min: 0 },
        gstAmount: { type: Number, default: 0, min: 0 },
        tcsAmount: { type: Number, default: 0, min: 0 },
        totalAmount: { type: Number, default: 0, min: 0 },
        gstRate: { type: Number, default: 0, min: 0 },
        tcsRate: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
)

const bookingSchema = new mongoose.Schema(
    {
        bookingId: { type: String, unique: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackageTemplate', default: null },
        listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackageListing', default: null },
        status: {
            type: String,
            enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'],
            default: 'PENDING',
        },
        travelStartDate: { type: Date },
        travelEndDate: { type: Date },
        travelers: [travelerSchema],
        pricing: moneySchema,
        snapshot: {
            template: { type: Object, default: null },
            listing: { type: Object, default: null },
        },
    },
    { timestamps: true }
)

bookingSchema.pre('save', async function (next) {
    if (!this.bookingId) {
        const count = await mongoose.model('Booking').countDocuments()
        this.bookingId = `EZH-BKG-${String(count + 1).padStart(6, '0')}`
    }
    next()
})

module.exports = mongoose.model('Booking', bookingSchema)
