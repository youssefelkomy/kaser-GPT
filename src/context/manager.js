const Conversation = require('../database/models/conversation');
const logger = require('../utils/logger');

// حجم السياق الأقصى
const MAX_CONTEXT_SIZE = 10;

async function getConversationContext(userId) {
    try {
        const conversations = await Conversation.find({ userId })
            .sort({ timestamp: -1 })
            .limit(MAX_CONTEXT_SIZE);
        
        return conversations.map(conv => ({
            role: conv.role,
            content: conv.content
        }));
    } catch (error) {
        logger.error('Error getting conversation context:', error);
        return [];
    }
}

async function addToContext(userId, message) {
    try {
        await Conversation.create({
            userId,
            role: message.role,
            content: message.content,
            timestamp: new Date()
        });

        // حذف الرسائل القديمة إذا تجاوز العدد الحد الأقصى
        const count = await Conversation.countDocuments({ userId });
        if (count > MAX_CONTEXT_SIZE) {
            const oldestMessages = await Conversation.find({ userId })
                .sort({ timestamp: 1 })
                .limit(count - MAX_CONTEXT_SIZE);
            
            await Conversation.deleteMany({
                _id: { $in: oldestMessages.map(m => m._id) }
            });
        }
    } catch (error) {
        logger.error('Error adding to conversation context:', error);
    }
}

async function clearContext(userId) {
    try {
        await Conversation.deleteMany({ userId });
    } catch (error) {
        logger.error('Error clearing conversation context:', error);
    }
}

module.exports = {
    getConversationContext,
    addToContext,
    clearContext,
    MAX_CONTEXT_SIZE
};
