const PackageTemplate = require('../models/PackageTemplate')

// GET /api/templates
exports.getAllTemplates = async (req, res) => {
    try {
        const {
            search,
            destination,
            theme,
            nights,
            days,
            isActive,
            page = 1,
            limit = 20,
        } = req.query

        const q = {}
        if (typeof isActive !== 'undefined') q.isActive = String(isActive) === 'true'
        if (destination) q.destinationName = new RegExp(destination, 'i')
        if (theme) q.theme = new RegExp(theme, 'i')
        if (nights) q.nights = Number(nights)
        if (days) q.days = Number(days)
        if (search) {
            q.$or = [
                { destinationName: new RegExp(search, 'i') },
                { theme: new RegExp(search, 'i') },
                { slug: new RegExp(search, 'i') },
            ]
        }

        const skip = (Number(page) - 1) * Number(limit)

        const [items, total] = await Promise.all([
            PackageTemplate.find(q).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
            PackageTemplate.countDocuments(q),
        ])

        res.json({ success: true, templates: items, total })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}

// GET /api/templates/:id
exports.getTemplateById = async (req, res) => {
    try {
        const template = await PackageTemplate.findById(req.params.id)
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' })
        res.json({ success: true, template })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}

// POST /api/templates (admin)
exports.createTemplate = async (req, res) => {
    try {
        const template = await PackageTemplate.create(req.body)
        res.status(201).json({ success: true, template })
    } catch (err) {
        const code = err.code === 11000 ? 400 : 400
        const msg = err.code === 11000 ? 'Template slug already exists' : err.message
        res.status(code).json({ success: false, message: msg })
    }
}

// PUT /api/templates/:id (admin)
exports.updateTemplate = async (req, res) => {
    try {
        const template = await PackageTemplate.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        })
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' })
        res.json({ success: true, template })
    } catch (err) {
        const code = err.code === 11000 ? 400 : 400
        const msg = err.code === 11000 ? 'Template slug already exists' : err.message
        res.status(code).json({ success: false, message: msg })
    }
}

// DELETE /api/templates/:id (admin)
exports.deleteTemplate = async (req, res) => {
    try {
        const template = await PackageTemplate.findByIdAndDelete(req.params.id)
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' })
        res.json({ success: true, message: 'Template deleted successfully' })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
}
