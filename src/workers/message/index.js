const { handleText } = require('./text');
const { handleVoice } = require('./voice');
const { handleImage } = require('./image');
const User = require('../../database/models/user');
const logger = require('../../utils/logger');

async function setupMessageHandlers(bot) {
    // معالج الرسائل النصية
    bot.on('text', async (ctx) => {
        try {
            // تحديث أو إنشاء المستخدم
            const user = await User.findOneAndUpdate(
                { telegramId: ctx.from.id },
                {
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name,
                    username: ctx.from.username,
                    'stats.lastActive': new Date(),
                    $inc: { 'stats.messageCount': 1 }
                },
                { upsert: true, new: true }
            );

            // معالجة النص
            await handleText(ctx, user);
        } catch (error) {
            logger.error('Error handling text message:', error);
            ctx.reply('عذراً ، حدث خطأ أثناء معالجة رسالتك ').catch(console.error);
        }
    });

    // معالج الرسائل الصوتية
    bot.on(['voice', 'audio'], async (ctx) => {
        try {
            const user = await User.findOneAndUpdate(
                { telegramId: ctx.from.id },
                {
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name,
                    username: ctx.from.username,
                    'stats.lastActive': new Date(),
                    $inc: { 'stats.messageCount': 1 }
                },
                { upsert: true, new: true }
            );

            await handleVoice(ctx, user);
        } catch (error) {
            logger.error('Error handling voice message:', error);
            ctx.reply('عذراً ، حدث خطأ أثناء معالجة الرسالة الصوتية ').catch(console.error);
        }
    });

    // معالج الصور
    bot.on(['photo', 'document'], async (ctx) => {
        try {
            const user = await User.findOneAndUpdate(
                { telegramId: ctx.from.id },
                {
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name,
                    username: ctx.from.username,
                    'stats.lastActive': new Date(),
                    $inc: { 'stats.messageCount': 1 }
                },
                { upsert: true, new: true }
            );

            await handleImage(ctx, user);
        } catch (error) {
            logger.error('Error handling image:', error);
            ctx.reply('عذراً ، حدث خطأ أثناء معالجة الصورة ').catch(console.error);
        }
    });

    logger.info('Message handlers setup completed');
}

module.exports = {
    setupMessageHandlers
};
