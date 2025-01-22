const logger = require('../../utils/logger');

// أسعار الخدمات
const PRICING = {
    GPT: {
        INPUT: 0.150 / 1000000,  // لكل مليون رمز
        OUTPUT: 0.600 / 1000000, // لكل مليون رمز
        CACHE: 0.075 / 1000000   // لكل مليون رمز مخزن
    },
    WHISPER: {
        PER_MINUTE: 0.006
    },
    VISION: {
        HIGH_QUALITY: 0.019125,
        LOW_QUALITY: 0.002125
    }
};

// حدود الاستخدام
const USAGE_LIMITS = {
    MAX_DAILY_COST: 1.0 // دولار أمريكي في اليوم
};

class CostManager {
    constructor() {
        this.dailyStats = new Map();
    }

    calculateGPTCost(usage) {
        const inputCost = (usage.prompt_tokens * PRICING.GPT.INPUT);
        const outputCost = (usage.completion_tokens * PRICING.GPT.OUTPUT);
        return inputCost + outputCost;
    }

    calculateWhisperCost(durationMinutes) {
        return durationMinutes * PRICING.WHISPER.PER_MINUTE;
    }

    calculateVisionCost(quality, count = 1) {
        const price = quality === 'high' ? 
            PRICING.VISION.HIGH_QUALITY : 
            PRICING.VISION.LOW_QUALITY;
        return price * count;
    }

    async trackUserCost(userId, cost, type) {
        const today = new Date().toISOString().split('T')[0];
        const key = `${userId}:${today}`;

        if (!this.dailyStats.has(key)) {
            this.dailyStats.set(key, {
                totalCost: 0,
                requests: {
                    gpt: 0,
                    whisper: 0,
                    vision: 0
                }
            });
        }

        const stats = this.dailyStats.get(key);
        const newTotalCost = stats.totalCost + cost;

        // التحقق من تجاوز الحد المالي اليومي فقط
        if (newTotalCost > USAGE_LIMITS.MAX_DAILY_COST) {
            logger.warn(`User ${userId} exceeded daily cost limit of $${USAGE_LIMITS.MAX_DAILY_COST}`);
            return false;
        }

        // تحديث الإحصائيات
        stats.totalCost = newTotalCost;
        stats.requests[type]++;

        return true;
    }

    async optimizeCost(type, params) {
        // تحسين التكلفة بدون قيود على عدد الطلبات
        switch (type) {
            case 'gpt':
                return this.optimizeGPTRequest(params);
            case 'whisper':
                return params; // إزالة القيود على مدة الصوت
            case 'vision':
                return this.optimizeVisionRequest(params);
            default:
                return params;
        }
    }

    optimizeGPTRequest(params) {
        // تحسين السياق فقط للأداء
        if (params.messages.length > 10) {
            params.messages = [
                params.messages[0], // رسالة النظام
                ...params.messages.slice(-9) // آخر 9 رسائل
            ];
        }

        return params;
    }

    optimizeVisionRequest(params) {
        // اختيار الجودة المناسبة بناءً على حجم الملف فقط
        if (params.fileSize > 1024 * 1024) { // أكبر من 1MB
            params.quality = 'low';
        }

        return params;
    }

    getDailyStats(userId) {
        const today = new Date().toISOString().split('T')[0];
        return this.dailyStats.get(`${userId}:${today}`) || {
            totalCost: 0,
            requests: { gpt: 0, whisper: 0, vision: 0 }
        };
    }

    clearOldStats() {
        const today = new Date().toISOString().split('T')[0];
        for (const [key] of this.dailyStats) {
            const [, date] = key.split(':');
            if (date !== today) {
                this.dailyStats.delete(key);
            }
        }
    }
}

// إنشاء نسخة واحدة للاستخدام في جميع أنحاء التطبيق
const costManager = new CostManager();

// تنظيف الإحصائيات القديمة كل 24 ساعة
setInterval(() => costManager.clearOldStats(), 24 * 60 * 60 * 1000);

module.exports = costManager;
