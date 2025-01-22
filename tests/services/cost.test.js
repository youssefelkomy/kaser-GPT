const costManager = require('../../src/services/cost/manager');

describe('Cost Manager', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('calculates GPT cost correctly', () => {
        const usage = {
            prompt_tokens: 100,
            completion_tokens: 50
        };

        const cost = costManager.calculateGPTCost(usage);
        const expectedCost = (100 * 0.150 / 1000000) + (50 * 0.600 / 1000000);
        
        expect(cost).toBe(expectedCost);
    });

    test('calculates Whisper cost correctly', () => {
        const duration = 2.5; // 2.5 minutes
        const cost = costManager.calculateWhisperCost(duration);
        
        expect(cost).toBe(2.5 * 0.006);
    });

    test('calculates Vision cost correctly', () => {
        const highQualityCost = costManager.calculateVisionCost('high');
        const lowQualityCost = costManager.calculateVisionCost('low');
        
        expect(highQualityCost).toBe(0.019125);
        expect(lowQualityCost).toBe(0.002125);
    });

    test('tracks daily user costs', async () => {
        const userId = '12345';
        const cost = 0.1;
        
        const result = await costManager.trackUserCost(userId, cost, 'gpt');
        expect(result).toBe(true);
        
        const stats = costManager.getDailyStats(userId);
        expect(stats.totalCost).toBe(cost);
        expect(stats.requests.gpt).toBe(1);
    });

    test('allows unlimited requests within cost limit', async () => {
        const userId = '12345';
        const smallCost = 0.1;
        
        // إجراء عدة طلبات ضمن الحد المالي
        for (let i = 0; i < 5; i++) {
            const result = await costManager.trackUserCost(userId, smallCost, 'gpt');
            expect(result).toBe(true);
        }
        
        const stats = costManager.getDailyStats(userId);
        expect(stats.totalCost).toBe(0.5);
        expect(stats.requests.gpt).toBe(5);
    });

    test('blocks requests when cost limit is exceeded', async () => {
        const userId = '12345';
        const largeCost = 0.6;
        
        // الطلب الأول ضمن الحد
        let result = await costManager.trackUserCost(userId, largeCost, 'gpt');
        expect(result).toBe(true);

        // الطلب الثاني يتجاوز الحد
        result = await costManager.trackUserCost(userId, largeCost, 'gpt');
        expect(result).toBe(false);
    });

    test('prevents exceeding daily limit', async () => {
        const userId = '12345';
        const largeCost = 1.1; // أكبر من الحد اليومي
        
        const result = await costManager.trackUserCost(userId, largeCost, 'gpt');
        expect(result).toBe(false);
    });

    test('optimizes GPT request parameters', () => {
        const params = {
            maxTokens: 5000,
            messages: Array(10).fill({ role: 'user', content: 'test' })
        };

        const optimized = costManager.optimizeGPTRequest(params);
        expect(optimized.maxTokens).toBeLessThanOrEqual(4000);
        expect(optimized.messages.length).toBeLessThanOrEqual(5);
    });

    test('optimizes GPT request without token limit', () => {
        const params = {
            messages: Array(15).fill({ role: 'user', content: 'test' })
        };

        const optimized = costManager.optimizeGPTRequest(params);
        expect(optimized.messages.length).toBe(10); // النظام + 9 رسائل
        expect(optimized.maxTokens).toBeUndefined(); // لا يوجد حد للرموز
    });

    test('allows any audio duration', () => {
        const params = {
            duration: 10 // 10 دقائق
        };

        const optimized = costManager.optimizeCost('whisper', params);
        expect(optimized).toEqual(params); // لا يوجد تغيير
    });

    test('clears old stats', () => {
        const userId = '12345';
        const today = new Date().toISOString().split('T')[0];
        const cost = 0.1;

        costManager.trackUserCost(userId, cost, 'gpt');
        
        // تقديم الوقت 24 ساعة
        jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        
        costManager.clearOldStats();
        const stats = costManager.getDailyStats(userId);
        
        expect(stats.totalCost).toBe(0);
        expect(stats.requests.gpt).toBe(0);
    });
});
