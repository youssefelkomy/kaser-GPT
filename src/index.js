require('dotenv').config();
const { Telegraf } = require('telegraf');
const { setupBot } = require('./core/bot');
const { setupDatabase } = require('./database/connections');
const logger = require('./utils/logger');

async function startBot() {
    try {
        // إنشاء نسخة البوت
        const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

        // إعداد قاعدة البيانات
        await setupDatabase();

        // إعداد البوت
        await setupBot(bot);

        // بدء البوت
        await bot.launch();
        logger.info('Bot started successfully');

        // معالجة إيقاف التشغيل بشكل آمن
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (error) {
        logger.error('Failed to start bot:', error);
        process.exit(1);
    }
}

startBot();
