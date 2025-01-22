const { OpenAI } = require('openai');
const { processWithGPT } = require('../../services/ai/gpt/client');
const Cache = require('../../database/models/cache');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function handleVoice(ctx, user) {
    try {
        // الحصول على الملف الصوتي
        const voice = ctx.message.voice || ctx.message.audio;
        const duration = voice.duration;

        // التحقق من المدة (تحديد حد أقصى)
        if (duration > 300) { // 5 دقائق
            return ctx.reply('عذراً ، الرسالة الصوتية طويلة جداً . الحد الأقصى هو 5 دقائق 🎤');
        }

        // إظهار حالة المعالجة
        const processingMessage = await ctx.reply('جاري معالجة الرسالة الصوتية ... 🎵');

        // تنزيل الملف الصوتي
        const file = await ctx.telegram.getFile(voice.file_id);
        const filePath = file.file_path;
        const fileName = `${voice.file_id}.ogg`;
        const downloadPath = path.join(__dirname, '../../../temp', fileName);

        // إنشاء مجلد مؤقت إذا لم يكن موجوداً
        if (!fs.existsSync(path.dirname(downloadPath))) {
            fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        }

        // تنزيل الملف
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(downloadPath, buffer);

        try {
            // البحث في التخزين المؤقت
            const cacheKey = `voice:${voice.file_unique_id}`;
            const cachedTranscription = await Cache.findOne({ key: cacheKey, type: 'whisper' });

            let transcription;
            let cost = 0;

            if (cachedTranscription) {
                transcription = cachedTranscription.value;
                await Cache.updateOne(
                    { _id: cachedTranscription._id },
                    { $inc: { 'metadata.hits': 1 } }
                );
            } else {
                // تحويل الصوت إلى نص
                const transcriptionResponse = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(downloadPath),
                    model: 'whisper-1',
                    language: 'ar'
                });

                transcription = transcriptionResponse.text;
                cost = calculateWhisperCost(duration);

                // تخزين في الذاكرة المؤقتة
                await Cache.create({
                    key: cacheKey,
                    type: 'whisper',
                    value: transcription,
                    metadata: {
                        duration,
                        cost,
                        hits: 1
                    },
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // تنتهي بعد 24 ساعة
                });
            }

            // معالجة النص مع GPT
            const gptResponse = await processWithGPT({
                messages: [{ role: 'user', content: transcription }],
                context: {
                    userName: ctx.from.first_name,
                    userLanguage: user.preferences.language || 'ar',
                    messageType: 'voice'
                }
            });

            // إذا كان الرد يحتوي على [BLOCK]
            if (gptResponse.content.startsWith('[BLOCK]')) {
                await ctx.deleteMessage(ctx.message.message_id);
                await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
                return ctx.reply('عذراً ، لا يمكنني معالجة هذا المحتوى 🚫');
            }

            // إرسال النص والرد
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
            await ctx.reply(`🎤 النص : ${transcription}`);
            await ctx.reply(gptResponse.content);

            // تحديث إحصائيات المستخدم
            await user.updateOne({
                $inc: {
                    'stats.tokenUsage': gptResponse.usage?.total_tokens || 0,
                    'stats.cost': (gptResponse.cost || 0) + cost,
                    'stats.voiceMessages': 1
                }
            });

            // تنظيف الملف المؤقت
            fs.unlinkSync(downloadPath);

        } catch (error) {
            logger.error('Error processing voice:', error);
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id).catch(() => {});
            throw error;
        }

    } catch (error) {
        logger.error('Error in handleVoice:', error);
        ctx.reply('عذراً ، حدث خطأ أثناء معالجة الرسالة الصوتية 🔄').catch(console.error);
    }
}

function calculateWhisperCost(durationSeconds) {
    return (durationSeconds / 60) * 0.006; // $0.006 per minute
}

module.exports = {
    handleVoice
};
