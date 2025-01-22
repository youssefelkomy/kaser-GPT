const { RekognitionClient, DetectFacesCommand } = require('@aws-sdk/client-rekognition');
const axios = require('axios');
const logger = require('../../utils/logger');
const imageCache = require('../../utils/imageCache');
const { analyzeImageIslamically } = require('./islamicImageAnalyzer');

// استخدام منطقة أيرلندا لأنها أقرب منطقة تدعم Rekognition للشرق الأوسط
const rekognition = new RekognitionClient({
    region: 'eu-west-1', // Ireland region
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    // تحسين الأداء والاتصال
    maxAttempts: 3, // عدد محاولات إعادة المحاولة
    timeout: 10000, // مهلة الاتصال بالمللي ثانية
});

async function analyzeImageWithRekognition(imageBuffer) {
    try {
        const command = new DetectFacesCommand({
            Image: {
                Bytes: imageBuffer
            },
            Attributes: ['ALL']
        });

        const response = await rekognition.send(command);
        
        if (!response.FaceDetails || response.FaceDetails.length === 0) {
            return { 
                hasHuman: false,
                description: 'لم يتم العثور على وجوه في الصورة'
            };
        }

        const face = response.FaceDetails[0];
        const gender = face.Gender.Value.toLowerCase();
        const confidence = face.Gender.Confidence;

        let description;
        if (gender === 'male') {
            description = 'تم التعرف على صورة شخص ذكر';
        } else if (gender === 'female') {
            description = 'تم التعرف على صورة شخص أنثى';
            return { isInappropriate: true, description: '' };
        }

        return {
            hasHuman: true,
            isInappropriate: gender === 'female',
            description: `${description} (نسبة الثقة: ${confidence.toFixed(1)}%)`
        };
    } catch (error) {
        logger.error('Error analyzing image with Rekognition:', error);
        return { 
            hasHuman: false,
            isInappropriate: false,
            description: 'حدث خطأ أثناء تحليل الصورة'
        };
    }
}

async function handleImage(ctx, user) {
    try {
        const photo = ctx.message.photo || [ctx.message.document];
        const fileId = photo[photo.length - 1].file_id;

        // معالجة النص المرافق للصورة إذا وجد
        if (ctx.message.caption) {
            const { handleText } = require('./text');
            const captionCtx = {
                message: {
                    text: ctx.message.caption,
                    message_id: ctx.message.message_id,
                    from: ctx.from,
                    chat: ctx.chat,
                    reply_to_message: ctx.message.reply_to_message
                },
                from: ctx.from,
                chat: ctx.chat,
                reply: ctx.reply.bind(ctx),
                telegram: ctx.telegram,
                deleteMessage: ctx.deleteMessage.bind(ctx)
            };
            
            try {
                await handleText(captionCtx, user);
            } catch (error) {
                logger.error('Error handling caption:', error);
                // لا نريد إيقاف معالجة الصورة إذا فشلت معالجة النص
            }
        }

        // تحميل الصورة
        const file = await ctx.telegram.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data);

        // التحقق من الكاش
        const imageHash = imageCache.generateHash(imageBuffer);
        const cachedResult = imageCache.get(imageHash);

        if (cachedResult) {
            logger.debug(`Cache hit for image: ${imageHash.substring(0, 8)}...`);
            
            if (!cachedResult.metadata.isAppropriate) {
                await ctx.deleteMessage(ctx.message.message_id);
                if (cachedResult.metadata.reason && cachedResult.metadata.reason.length > 0) {
                    await ctx.reply('تم حذف الصورة لأنها لا تتوافق مع الضوابط الشرعية');
                }
                return;
            }

            await ctx.reply(cachedResult.metadata.description);
            
            logger.info('Message handled from cache', {
                userId: user.telegramId,
                messageType: 'image',
                timestamp: new Date().toISOString(),
                cached: true,
                accessCount: cachedResult.accessCount
            });
            
            return;
        }

        // تحليل الصورة إذا لم تكن في الكاش
        const analysisResult = await analyzeImageIslamically(imageBuffer);
        
        if (!analysisResult.isAppropriate) {
            await ctx.deleteMessage(ctx.message.message_id);
            if (analysisResult.reason && analysisResult.reason.length > 0) {
                await ctx.reply('تم حذف الصورة لأنها لا تتوافق مع الضوابط الشرعية');
            }
            // تخزين في الكاش
            imageCache.set(imageBuffer, analysisResult);
            return;
        }

        // تخزين النتيجة في الكاش
        imageCache.set(imageBuffer, { 
            ...analysisResult,
            timestamp: Date.now()
        });

        await ctx.reply(analysisResult.description);

        await user.updateOne({
            $inc: {
                'stats.imageMessages': 1
            }
        });

        logger.info('Message handled successfully', {
            userId: user.telegramId,
            messageType: 'image',
            timestamp: new Date().toISOString(),
            isAppropriate: analysisResult.isAppropriate,
            description: analysisResult.description,
            cached: false
        });

    } catch (error) {
        logger.error('Error in handleImage:', error);
        ctx.reply('عذراً ، حدث خطأ أثناء معالجة الصورة . الرجاء المحاولة مرة أخرى .').catch(console.error);
    }
}

module.exports = {
    handleImage
};
