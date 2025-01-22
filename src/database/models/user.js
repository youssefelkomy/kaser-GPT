const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: {
        type: String,
        required: true,
        unique: true
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: String,
    username: String,
    languageCode: String,
    preferences: {
        imageQuality: {
            type: String,
            enum: ['high', 'low'],
            default: 'low'
        },
        contextLength: {
            type: Number,
            default: 5
        }
    },
    stats: {
        messageCount: {
            type: Number,
            default: 0
        },
        tokenUsage: {
            type: Number,
            default: 0
        },
        lastActive: {
            type: Date,
            default: Date.now
        }
    },
    isBlocked: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

userSchema.index({ telegramId: 1 });

module.exports = mongoose.model('User', userSchema);
