const { processWithGPT } = require('../../services/ai/gpt/client');
const { getConversationContext, addToContext } = require('../../context/manager');
const Conversation = require('../../database/models/conversation');
const User = require('../../database/models/user');
const logger = require('../../utils/logger');

// أنماط التفاعل
const INTERACTION_PATTERNS = {
    GREETING: /^(السلام|سلام|مرحبا|هلا|صباح|مساء)/i,
    FAREWELL: /^(مع السلامة|الى اللقاء|باي|وداعا)/i,
    QUESTION: /\?|؟|كيف|ما|متى|أين|لماذا|هل/,
    THANKS: /^(شكرا|جزاك الله خير|بارك الله فيك)/i
};

async function handleText(ctx, user) {
    const messageText = ctx.message.text;
    const replyToMessage = ctx.message.reply_to_message;
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    try {
        logger.info('Processing message', {
            chatType: ctx.chat.type,
            isGroup,
            isReplyToBot: replyToMessage?.from?.id === ctx.botInfo?.id,
            isDirectMention: messageText.includes('@' + ctx.botInfo?.username)
        });

        // تحديد نوع التفاعل
        const interactionType = detectInteractionType(messageText);
        
        // في المجموعات ، نتحقق إذا كان يجب الرد
        if (isGroup) {
            const isReplyToBot = replyToMessage && replyToMessage.from.id === ctx.botInfo.id;
            const isDirectMention = messageText.includes('@' + ctx.botInfo.username);
            
            // نرد فقط إذا تم ذكر البوت أو الرد على رسالته
            if (!isDirectMention && !isReplyToBot) {
                return;
            }
        }

        // الحصول على سياق المحادثة
        const context = await getConversationContext(user.telegramId);

        // إنشاء أو تحديث المحادثة
        let conversation = await Conversation.findOne({
            ...(isGroup 
                ? { chatId: ctx.chat.id }
                : { userId: user.telegramId, status: 'active' }
            )
        });

        if (!conversation) {
            conversation = new Conversation({
                ...(isGroup 
                    ? { 
                        chatId: ctx.chat.id,
                        chatTitle: ctx.chat.title,
                        chatType: ctx.chat.type
                    } 
                    : { userId: user.telegramId }
                ),
                messages: [],
                context: new Map()
            });
        }

        // التحقق من وجود معلومات المستخدم
        const userName = ctx.from?.first_name || user.firstName || 'المستخدم';
        
        // تحضير سياق المحادثة بشكل مختصر
        const conversationSummary = conversation.messages.length > 0 
            ? conversation.messages.slice(-10).reduce((summary, msg) => {
                // نختصر كل رسالة في جملة أو جملتين
                const shortContent = msg.content.split(/[.!?]/).slice(0, 2).join('. ');
                return summary + `\n${msg.role === 'user' ? userName : 'المساعد'}: ${shortContent}`;
            }, 'ملخص المحادثة السابقة:')
            : '';

        // إضافة معلومات التفاعل للسياق
        const enrichedContext = {
            ...context,
            userName: userName,
            userLanguage: user.preferences?.language || 'ar',
            messageCount: conversation.messages.length,
            interactionType,
            isReply: !!replyToMessage,
            isGroup,
            conversationSummary,
            ...(isGroup && {
                chatTitle: ctx.chat.title,
                messageFrom: userName,
                isReplyToBot: replyToMessage?.from?.id === ctx.botInfo.id,
                isDirectMention: messageText.includes('@' + ctx.botInfo.username),
                messageContext: await getGroupMessageContext(ctx)
            })
        };

        // معالجة النص مع GPT
        const response = await processWithGPT({
            messages: [
                {
                    role: 'user',
                    content: messageText,
                    name: userName
                }
            ],
            context: enrichedContext,
            replyToMessage: replyToMessage?.text,
            isGroup,
            chatTitle: isGroup ? ctx.chat.title : null
        });

        logger.info('Message processed', {
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
            tokens: {
                prompt: response.usage?.prompt_tokens || 0,
                completion: response.usage?.completion_tokens || 0,
                total: response.usage?.total_tokens || 0,
                cost: response.cost || 0
            },
            summaryLength: enrichedContext.conversationSummary?.length || 0,
            processingTime: response.processingTime
        });

        // إذا كان هناك خطأ في المعالجة
        if (response.error) {
            await ctx.reply('عذراً ، حدث خطأ أثناء معالجة رسالتك . الرجاء المحاولة مرة أخرى .');
            return;
        }

        // إذا تم حظر المحتوى
        if (response.blocked) {
            await ctx.reply('عذراً ، لا يمكنني معالجة هذا النوع من المحتوى .');
            return;
        }

        // إرسال الرد
        const sentMessage = await ctx.reply(response.content, {
            reply_to_message_id: ctx.message.message_id,
            parse_mode: 'HTML'
        });

        // حفظ المحادثة باستخدام findOneAndUpdate لتجنب مشاكل التزامن
        await Conversation.findOneAndUpdate(
            { _id: conversation._id },
            { 
                $push: { 
                    messages: [
                        { role: 'user', content: messageText },
                        { role: 'assistant', content: response.content }
                    ] 
                }
            },
            { new: true }
        );

        // تحديث السياق
        if (response.context) {
            await addToContext(user.telegramId, response.context);
        }

        // تحديث إحصائيات المستخدم
        const stats = {
            $inc: {
                'stats.messagesProcessed': 1,
                'stats.tokensGenerated': response.usage?.total_tokens || 0,
                'stats.messagesSent': 1
            },
            $set: {
                lastInteractionAt: new Date()
            }
        };

        await User.updateOne({ telegramId: user.telegramId }, stats);

    } catch (error) {
        logger.error('Error in handleText:', error);
        await ctx.reply('عذراً ، حدث خطأ ما . الرجاء المحاولة مرة أخرى .');
    }
}

function detectInteractionType(message) {
    if (INTERACTION_PATTERNS.GREETING.test(message)) return 'greeting';
    if (INTERACTION_PATTERNS.FAREWELL.test(message)) return 'farewell';
    if (INTERACTION_PATTERNS.QUESTION.test(message)) return 'question';
    if (INTERACTION_PATTERNS.THANKS.test(message)) return 'thanks';
    return 'conversation';
}

async function getGroupMessageContext(ctx) {
    try {
        logger.info('Getting group context', {
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
            from: ctx.from?.first_name,
            chatTitle: ctx.chat.title,
            replyToMessage: ctx.message.reply_to_message ? {
                text: ctx.message.reply_to_message.text,
                from: ctx.message.reply_to_message.from?.first_name
            } : null
        });

        // نركز فقط على الرسالة الحالية والرد عليها إن وجد
        const context = {
            currentMessage: {
                from: ctx.from?.first_name,
                text: ctx.message.text,
                timestamp: ctx.message.date
            }
        };

        // إذا كانت رداً على رسالة أخرى
        if (ctx.message.reply_to_message) {
            context.repliedToMessage = {
                from: ctx.message.reply_to_message.from?.first_name,
                text: ctx.message.reply_to_message.text,
                timestamp: ctx.message.reply_to_message.date,
                isBot: ctx.message.reply_to_message.from?.id === ctx.botInfo.id
            };
        }

        logger.info('Created message context', { context });
        return context;
    } catch (error) {
        logger.error('Error getting group context', { 
            error: error.message,
            stack: error.stack
        });
        return {};
    }
}

module.exports = {
    handleText,
    INTERACTION_PATTERNS,
    getGroupMessageContext
};
