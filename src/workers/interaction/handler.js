const { processWithGPT } = require('../../services/ai/gpt/client');
const { getConversationContext } = require('../../context/manager');
const User = require('../../database/models/user');
const logger = require('../../utils/logger');

// أنماط التفاعل
const INTERACTION_PATTERNS = {
    GREETING: /^(السلام|سلام|مرحبا|هلا|صباح|مساء)/i,
    FAREWELL: /^(مع السلامة|الى اللقاء|باي|وداعا)/i,
    QUESTION: /\?|؟|كيف|ما|متى|أين|لماذا|هل/,
    THANKS: /^(شكرا|جزاك الله خير|بارك الله فيك)/i
};

async function setupInteractionHandler(bot) {
    // معالج الردود على رسائل البوت
    bot.on('message', async (ctx, next) => {
        try {
            if (ctx.message.reply_to_message?.from?.id === ctx.botInfo.id) {
                await handleReply(ctx);
                return;
            }
            await next();
        } catch (error) {
            logger.error('Error in interaction handler:', error);
            await next();
        }
    });
}

async function handleReply(ctx) {
    try {
        const user = await User.findOne({ telegramId: ctx.from.id });
        if (!user) return;

        const replyToMessage = ctx.message.reply_to_message;
        const userMessage = ctx.message.text;
        const context = await getConversationContext(user.telegramId);

        // تحليل نوع التفاعل
        const interactionType = analyzeInteraction(userMessage);
        const personality = generatePersonality(interactionType, user.firstName);

        // إعداد سياق المحادثة
        const conversationContext = {
            previousMessage: replyToMessage.text,
            userMessage,
            interactionType,
            userName: user.firstName,
            ...context
        };

        // معالجة الرد مع GPT
        const response = await processWithGPT({
            messages: [
                {
                    role: 'system',
                    content: personality
                },
                {
                    role: 'user',
                    content: `Previous: ${replyToMessage.text}\nReply: ${userMessage}`
                }
            ],
            context: conversationContext,
            messageType: 'reply'
        });

        // إرسال الرد
        await ctx.reply(response.content, {
            reply_to_message_id: ctx.message.message_id
        });

        // تحديث إحصائيات المستخدم
        await user.updateOne({
            $inc: {
                'stats.messageCount': 1,
                'stats.tokenUsage': response.usage.total_tokens
            },
            'stats.lastActive': new Date()
        });

    } catch (error) {
        logger.error('Error handling reply:', error);
        throw error;
    }
}

function analyzeInteraction(message) {
    if (INTERACTION_PATTERNS.GREETING.test(message)) return 'greeting';
    if (INTERACTION_PATTERNS.FAREWELL.test(message)) return 'farewell';
    if (INTERACTION_PATTERNS.QUESTION.test(message)) return 'question';
    if (INTERACTION_PATTERNS.THANKS.test(message)) return 'thanks';
    return 'conversation';
}

function generatePersonality(type, userName) {
    const basePersonality = `أنت مساعد ودود ومرح . تتحدث بأسلوب بسيط وممتع .
تخاطب ${userName} باسمه وتظهر اهتماماً شخصياً به .`;

    switch (type) {
        case 'greeting':
            return `${basePersonality}
رد على التحية بحرارة وسؤال عن الحال .
استخدم التحية الإسلامية "وعليكم السلام" إذا بدأ بالسلام .`;

        case 'farewell':
            return `${basePersonality}
ودع ${userName} بلطف وتمنى له يوماً سعيداً .
يمكنك استخدام دعاء مناسب للوداع .`;

        case 'question':
            return `${basePersonality}
أجب على السؤال بشكل مبسط وواضح .
استخدم أمثلة بسيطة إذا كان مناسباً .`;

        case 'thanks':
            return `${basePersonality}
رد على الشكر بتواضع ولطف .
يمكنك استخدام "العفو" أو "حياك الله" .`;

        default:
            return `${basePersonality}
حافظ على المحادثة ممتعة ومفيدة .
أظهر اهتماماً بما يقوله ${userName} .`;
    }
}

module.exports = {
    setupInteractionHandler
};
