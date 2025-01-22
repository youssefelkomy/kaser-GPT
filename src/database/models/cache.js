const mongoose = require('mongoose');

const cacheSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: ['gpt', 'whisper', 'image'],
        required: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    metadata: {
        tokens: Number,
        cost: Number,
        hits: {
            type: Number,
            default: 0
        }
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

cacheSchema.index({ key: 1, type: 1 });
cacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24 hours

module.exports = mongoose.model('Cache', cacheSchema);
