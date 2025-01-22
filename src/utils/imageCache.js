const crypto = require('crypto');
const logger = require('./logger');

class ImageCache {
    constructor(maxSize = 5000) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.queue = []; // للتتبع LRU
        logger.info(`Image cache initialized with max size: ${maxSize}`);
    }

    // إنشاء هاش للصورة
    generateHash(buffer) {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    // إضافة صورة إلى الكاش
    set(imageBuffer, metadata) {
        try {
            const hash = this.generateHash(imageBuffer);
            
            // إذا كان الهاش موجود مسبقاً ، نحدث فقط وقت الاستخدام
            if (this.cache.has(hash)) {
                this.updateUsage(hash);
                return hash;
            }

            // إذا وصلنا للحد الأقصى ، نحذف أقدم عنصر
            if (this.queue.length >= this.maxSize) {
                const oldestHash = this.queue.shift();
                this.cache.delete(oldestHash);
                logger.debug(`Removed oldest image from cache: ${oldestHash.substring(0, 8)}...`);
            }

            // إضافة العنصر الجديد
            this.cache.set(hash, {
                metadata,
                timestamp: Date.now(),
                accessCount: 1
            });
            this.queue.push(hash);
            
            logger.debug(`Added new image to cache: ${hash.substring(0, 8)}... (${this.queue.length}/${this.maxSize})`);
            return hash;
        } catch (error) {
            logger.error('Error setting image in cache:', error);
            return null;
        }
    }

    // الحصول على معلومات الصورة من الكاش
    get(hash) {
        const data = this.cache.get(hash);
        if (data) {
            this.updateUsage(hash);
            data.accessCount++;
            return data;
        }
        return null;
    }

    // تحديث ترتيب الاستخدام
    updateUsage(hash) {
        const index = this.queue.indexOf(hash);
        if (index > -1) {
            this.queue.splice(index, 1);
            this.queue.push(hash);
        }
    }

    // الحصول على إحصائيات الكاش
    getStats() {
        return {
            size: this.queue.length,
            maxSize: this.maxSize,
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // بالميجابايت
            oldestTimestamp: this.queue.length > 0 ? this.cache.get(this.queue[0]).timestamp : null
        };
    }

    // حذف عنصر من الكاش
    delete(hash) {
        const index = this.queue.indexOf(hash);
        if (index > -1) {
            this.queue.splice(index, 1);
            this.cache.delete(hash);
            return true;
        }
        return false;
    }

    // تفريغ الكاش
    clear() {
        this.cache.clear();
        this.queue = [];
        logger.info('Image cache cleared');
    }
}

// إنشاء نسخة واحدة للاستخدام في جميع أنحاء التطبيق
const imageCache = new ImageCache(5000);

module.exports = imageCache;
