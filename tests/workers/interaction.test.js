const { setupInteractionHandler } = require('../../src/workers/interaction/handler');
const User = require('../../src/database/models/user');
const { processWithGPT } = require('../../src/services/ai/gpt/client');

// Mock dependencies
jest.mock('../../src/services/ai/gpt/client');
jest.mock('../../src/database/models/user');

describe('Interaction Handler', () => {
    let mockBot;
    let mockCtx;
    let mockUser;

    beforeEach(() => {
        // تهيئة المحاكاة
        mockBot = {
            on: jest.fn()
        };

        mockCtx = {
            message: {
                text: 'السلام عليكم',
                reply_to_message: {
                    from: { id: 'bot123' },
                    text: 'مرحبا'
                }
            },
            from: { id: 'user123' },
            botInfo: { id: 'bot123' },
            reply: jest.fn()
        };

        mockUser = {
            telegramId: 'user123',
            firstName: 'أحمد',
            updateOne: jest.fn()
        };

        // تهيئة المحاكاة للدوال
        User.findOne.mockResolvedValue(mockUser);
        processWithGPT.mockResolvedValue({
            content: 'وعليكم السلام',
            usage: { total_tokens: 10 }
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('sets up message handler correctly', async () => {
        await setupInteractionHandler(mockBot);
        expect(mockBot.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    test('handles greeting correctly', async () => {
        mockCtx.message.text = 'السلام عليكم';
        
        const messageHandler = mockBot.on.mock.calls[0][1];
        await messageHandler(mockCtx, jest.fn());

        expect(processWithGPT).toHaveBeenCalledWith(expect.objectContaining({
            messageType: 'reply'
        }));
        expect(mockCtx.reply).toHaveBeenCalledWith('وعليكم السلام', expect.any(Object));
    });

    test('handles question correctly', async () => {
        mockCtx.message.text = 'كيف حالك ؟';
        
        const messageHandler = mockBot.on.mock.calls[0][1];
        await messageHandler(mockCtx, jest.fn());

        expect(processWithGPT).toHaveBeenCalledWith(expect.objectContaining({
            messageType: 'reply'
        }));
    });

    test('updates user statistics', async () => {
        const messageHandler = mockBot.on.mock.calls[0][1];
        await messageHandler(mockCtx, jest.fn());

        expect(mockUser.updateOne).toHaveBeenCalledWith(expect.objectContaining({
            $inc: {
                'stats.messageCount': 1,
                'stats.tokenUsage': 10
            }
        }));
    });

    test('handles errors gracefully', async () => {
        processWithGPT.mockRejectedValue(new Error('Test error'));
        
        const messageHandler = mockBot.on.mock.calls[0][1];
        const next = jest.fn();
        
        await messageHandler(mockCtx, next);
        expect(next).toHaveBeenCalled();
    });

    test('ignores non-reply messages', async () => {
        mockCtx.message.reply_to_message = null;
        
        const messageHandler = mockBot.on.mock.calls[0][1];
        const next = jest.fn();
        
        await messageHandler(mockCtx, next);
        expect(next).toHaveBeenCalled();
        expect(processWithGPT).not.toHaveBeenCalled();
    });
});
