const mongoose = require('mongoose')

const itineraryDaySchema = new mongoose.Schema(
    {
        day: { type: Number, required: true },
        title: { type: String, required: true, trim: true },
        points: [{ type: String }],
    },
    { _id: false }
)

const packageTemplateSchema = new mongoose.Schema(
    {
        destinationName: {
            type: String,
            required: [true, 'Destination name is required'],
            trim: true,
        },
        theme: {
            type: String,
            required: [true, 'Theme is required'],
            trim: true,
        },
        nights: {
            type: Number,
            min: 0,
            default: 0,
        },
        days: {
            type: Number,
            min: 0,
            default: 0,
        },
        durationLabel: {
            type: String,
            default: '',
            trim: true,
        },
        itinerarySkeleton: [itineraryDaySchema],
        season: [{ type: String }],
        slug: {
            type: String,
            unique: true,
            index: true,
            trim: true,
        },
        seoPath: {
            type: String,
            default: '',
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
)

function slugify(input) {
    return String(input || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, '')
        .replace(/-+/g, '-')
}

packageTemplateSchema.pre('validate', function (next) {
    if (!this.durationLabel) {
        const n = this.nights || 0
        const d = this.days || 0
        if (n && d) this.durationLabel = `${n}N/${d}D`
        else if (n) this.durationLabel = `${n}N`
        else if (d) this.durationLabel = `${d}D`
    }

    if (!this.slug) {
        const base = `${this.destinationName}-${this.theme}-${this.durationLabel || ''}`
        this.slug = slugify(base)
    } else {
        this.slug = slugify(this.slug)
    }

    if (!this.seoPath) {
        const dur = (this.durationLabel || '').replace('/', '').toLowerCase()
        const base = `${slugify(this.destinationName)}-${slugify(this.theme)}-packages`
        this.seoPath = dur ? `/${base}/${dur}` : `/${base}`
    }

    next()
})

module.exports = mongoose.model('PackageTemplate', packageTemplateSchema)
