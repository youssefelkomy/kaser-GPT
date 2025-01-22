const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    // معرف المستخدم (للمحادثات الخاصة)
    userId: {
        type: String,
        index: true,
        sparse: true
    },
    
    // معرف المجموعة (للمحادثات الجماعية)
    chatId: {
        type: String,
        index: true,
        sparse: true
    },
    
    // معلومات المجموعة
    chatTitle: String,
    chatType: {
        type: String,
        enum: ['private', 'group', 'supergroup']
    },
    
    // الرسائل
    messages: [{
        role: {
            type: String,
            required: true,
            enum: ['user', 'assistant']
        },
        content: {
            type: String,
            required: true
        },
        // معلومات إضافية للمجموعات
        sender: {
            userId: String,
            userName: String
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    
    // حالة المحادثة
    status: {
        type: String,
        default: 'active',
        enum: ['active', 'archived']
    },
    
    // السياق
    context: {
        type: Map,
        of: String
    },
    
    // تاريخ آخر تحديث
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// إضافة مؤشرات للبحث السريع
conversationSchema.index({ lastUpdated: -1 });
conversationSchema.index({ 'messages.timestamp': -1 });

// التأكد من وجود إما userId أو chatId
conversationSchema.pre('save', function(next) {
    if (!this.userId && !this.chatId) {
        next(new Error('يجب تحديد إما معرف المستخدم أو معرف المجموعة'));
    }
    next();
});

module.exports = mongoose.model('Conversation', conversationSchema);
