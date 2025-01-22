const { setupMessageHandlers } = require('../workers/message');
const { setupInteractionHandler } = require('../workers/interaction/handler');
const logger = require('../utils/logger');

async function setupBot(bot) {
    try {
        // إعداد معالجات الرسائل
        setupMessageHandlers(bot);

        // إعداد معالج التفاعل
        setupInteractionHandler(bot);

        // معالج الأخطاء العام
        bot.catch((err, ctx) => {
            logger.error(`Error while handling update ${ctx.update.update_id}:`, err);
            ctx.reply('عذراً ، حدث خطأ ما . سأحاول مساعدتك مرة أخرى ').catch(console.error);
        });

        logger.info('Bot setup completed successfully');
    } catch (error) {
        logger.error('Failed to setup bot:', error);
        throw error;
    }
}

module.exports = {
    setupBot
};
