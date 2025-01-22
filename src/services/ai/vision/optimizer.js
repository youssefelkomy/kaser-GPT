const sharp = require('sharp');
const logger = require('../../../utils/logger');

// حدود الصورة
const IMAGE_LIMITS = {
    MAX_WIDTH: 512,
    MAX_HEIGHT: 512,
    QUALITY: 60,
    MAX_SIZE_BYTES: 500000
};

async function optimizeImage(buffer) {
    try {
        // تحليل معلومات الصورة
        const metadata = await sharp(buffer).metadata();
        
        // التحقق مما إذا كانت الصورة تحتاج إلى تحسين
        const needsOptimization = metadata.width > IMAGE_LIMITS.MAX_WIDTH || metadata.height > IMAGE_LIMITS.MAX_HEIGHT || metadata.size > IMAGE_LIMITS.MAX_SIZE_BYTES;
        
        if (needsOptimization) {
            // تحسين الصورة
            const optimizedBuffer = await sharp(buffer)
                .resize(IMAGE_LIMITS.MAX_WIDTH, IMAGE_LIMITS.MAX_HEIGHT, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({
                    quality: IMAGE_LIMITS.QUALITY,
                    progressive: true
                })
                .toBuffer();
            
            return {
                buffer: optimizedBuffer,
                needsOptimization: true,
                originalSize: buffer.length,
                optimizedSize: optimizedBuffer.length
            };
        }
        
        return { buffer, needsOptimization: false };
    } catch (error) {
        logger.error('Error optimizing image:', error);
        return { buffer, needsOptimization: false };
    }
}

module.exports = {
    optimizeImage,
    IMAGE_LIMITS
};
