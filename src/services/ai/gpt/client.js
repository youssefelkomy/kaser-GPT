const { OpenAI } = require('openai');
const Cache = require('../../../database/models/cache');
const logger = require('../../../utils/logger');
const { quduratKnowledge } = require('../knowledge/qudurat');
const { tahsiliKnowledge } = require('../knowledge/tahsili');
const { formattingRules, applyFormatting } = require('../knowledge/formatting');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// تعريف أنماط الرسائل
const messagePatterns = {
    greeting: /^(السلام|سلام|مرحبا|هلا|صباح|مساء)/i,
    question: /\?|؟|كيف|ما|متى|أين|لماذا|هل/,
    farewell: /^(مع السلامة|الى اللقاء|باي|وداعا)/i
};

// الشخصية الأساسية للبوت
const basePersonality = `أنت مساعد ذكي ودود يتحدث بأسلوب شخصي ومحبب .

القواعد الأساسية :
- اذكر اسم المستخدم في سياق الجملة (مثل: "أتفق معك يوسف" أو "صحيح يوسف")
- تجنب أسلوب النداء المباشر (مثل: "يا يوسف")
- تكيف مع لهجة المستخدم بشكل طبيعي وطريف
- استخدم تعابير محببة من نفس اللهجة
- حافظ على روح الدعابة المحترمة

تكييف اللهجة :
- إذا تحدث المستخدم بالمصري ، استخدم كلمات مثل : "ازيك" ، "طيب" ، "خالص" ، "جدا"
- إذا تحدث باللبناني ، استخدم كلمات مثل : "شو" ، "كتير" ، "هيك" ، "يلا"
- إذا تحدث بالخليجي ، استخدم كلمات مثل : "شلونك" ، "زين" ، "عيوني" ، "يالغالي"
- إذا تحدث بالفصحى ، التزم بها مع لمسة عصرية

القيم الأساسية :
- احترم القيم الإسلامية دائماً
- كن صادقاً وأميناً في نصائحك
- تجنب أي محتوى غير لائق
- احرص على الفائدة العملية

المحرمات الشرعية :
- لا تتحدث عن الرقص والغناء والمعازف باعتبارها محرمة شرعاً
- لا تصف أو تناقش العري أو المحتوى غير اللائق
- لا تشجع العلاقات الرومانسية والغرامية
- قدم بدائل مباحة عند الحاجة
- اعتبر هذه الأمور محرمة ولا تجوز شرعاً

مهم جداً :
- إذا وجدت أي محتوى غير لائق ، اكتب [BLOCK] في أول سطر
- تأكد من مناسبة الرد لسياق المحادثة
- حافظ على التوازن بين الود والمهنية`;

// معالجة الرد مع GPT وتطبيق التنسيق المناسب
async function processWithGPT({ messages, context, messageType, replyToMessage }) {
    try {
        // تحليل نوع الرسالة
        if (!messages || !messages.length || !messages[messages.length - 1]) {
            throw new Error('INVALID_MESSAGES');
        }

        const lastMessage = messages[messages.length - 1].content;
        if (!lastMessage) {
            throw new Error('EMPTY_MESSAGE');
        }

        const messagePattern = detectMessagePattern(lastMessage);

        // البحث في التخزين المؤقت
        const cacheKey = generateCacheKey(lastMessage, messagePattern);
        const cachedResponse = await Cache.findOne({ key: cacheKey, type: 'gpt' });

        if (cachedResponse && messagePattern !== 'conversation') {
            // التحقق من الرد المخزن
            if (cachedResponse.value.startsWith('[BLOCK]')) {
                return {
                    blocked: true,
                    usage: { total_tokens: 0 },
                    context: context,
                    processingTime: 0,
                    cost: 0
                };
            }

            await Cache.updateOne(
                { _id: cachedResponse._id },
                { $inc: { 'metadata.hits': 1 } }
            );

            // تطبيق قواعد التنسيق على الرد المخزن
            const formattedResponse = applyFormatting(cachedResponse.value);
            
            return {
                content: formattedResponse,
                usage: cachedResponse.metadata,
                context: context,
                processingTime: 0,
                cost: 0
            };
        }

        // إعداد السياق والرسائل
        const systemMessage = generateSystemMessage(messagePattern, context);
        const conversationHistory = prepareConversationHistory(messages, messagePattern);

        // إضافة قواعد التنسيق إلى رسالة النظام
        const formattingInstructions = formattingRules.basic;
        
        // إعداد المطلب للـ GPT
        const gptMessages = [
            { 
                role: 'system', 
                content: `${systemMessage}\n\n${formattingInstructions}` 
            },
            ...conversationHistory
        ];

        // معالجة مع GPT
        const startTime = Date.now();
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: gptMessages,
            max_tokens: calculateMaxTokens(messagePattern),
            temperature: calculateTemperature(messagePattern)
        });

        if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
            throw new Error('INVALID_GPT_RESPONSE');
        }

        const response = completion.choices[0].message.content;
        if (!response) {
            throw new Error('EMPTY_GPT_RESPONSE');
        }

        // التحقق من المحتوى وتطبيق قواعد التنسيق
        if (response.startsWith('[BLOCK]')) {
            return {
                blocked: true,
                usage: completion.usage || { total_tokens: 0 },
                context: context,
                processingTime: Date.now() - startTime,
                cost: calculateCost(completion.usage)
            };
        }

        const formattedResponse = applyFormatting(response);
        const processingTime = Date.now() - startTime;
        const cost = calculateCost(completion.usage);

        // تخزين في الذاكرة المؤقتة إذا كان مناسباً
        if (messagePattern !== 'conversation') {
            await Cache.create({
                key: cacheKey,
                type: 'gpt',
                value: formattedResponse,
                metadata: {
                    tokens: completion.usage.total_tokens,
                    cost: cost,
                    hits: 1
                },
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 ساعة
            });
        }

        return {
            content: formattedResponse,
            usage: completion.usage,
            context: updateContext(context, formattedResponse),
            processingTime,
            cost
        };

    } catch (error) {
        logger.error('Error in processWithGPT:', error);
        
        // إرجاع رسالة خطأ مناسبة
        return {
            content: 'عذراً ، حدث خطأ في معالجة رسالتك . الرجاء المحاولة مرة أخرى .',
            error: error.message,
            usage: { total_tokens: 0 },
            context: context,
            processingTime: 0,
            cost: 0
        };
    }
}

// تحليل نمط الرسالة وتصنيفها حسب النوع
function detectMessagePattern(message) {
    if (messagePatterns.greeting.test(message)) return 'greeting';
    if (messagePatterns.question.test(message)) return 'question';
    if (messagePatterns.farewell.test(message)) return 'farewell';
    return 'conversation';
}

// إنشاء رسالة النظام المخصصة حسب نمط التفاعل وسياق المحادثة
function generateSystemMessage(pattern, context) {
    let systemMessage = basePersonality;

    // إضافة المعرفة المتخصصة حسب نوع السؤال
    if (pattern === 'question') {
        const messageContent = context?.lastMessage?.toLowerCase() || '';
        
        if (messageContent.includes('قدرات') || messageContent.includes('اختبار القدرات')) {
            systemMessage += '\n' + quduratKnowledge;
        }
        
        if (messageContent.includes('تحصيلي') || messageContent.includes('اختبار التحصيلي')) {
            systemMessage += '\n' + tahsiliKnowledge;
        }
    }

    // تخصيص الرسالة حسب نمط التفاعل
    const userName = context?.userName || 'عزيزي';
    
    switch (pattern) {
        case 'greeting':
            systemMessage += `\nعندما يحييك ${userName} ، رد عليه بتحية إسلامية دافئة واسأله عن حاله وعن يومه .`;
            break;
            
        case 'question':
            systemMessage += `\nعندما يسألك ${userName} ، أظهر اهتماماً بسؤاله وأجب بشكل مبسط وواضح . تأكد من فهمه واسأله إذا كان يحتاج توضيحاً إضافياً .`;
            break;
            
        case 'conversation':
            systemMessage += `\nحافظ على المحادثة ممتعة ومفيدة مع ${userName} . أظهر اهتماماً بما يقوله واسأله أسئلة متابعة مناسبة .`;
            break;
    }

    return systemMessage;
}

// تحضير سجل المحادثة مع مراعاة نمط التفاعل
function prepareConversationHistory(messages, pattern) {
    // تحديد عدد الرسائل المناسب حسب النمط
    const messageCount = pattern === 'conversation' ? 5 : 2;
    return messages.slice(-messageCount).map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}

function calculateMaxTokens(pattern) {
    switch (pattern) {
        case 'greeting': return 50;
        case 'question': return 200;
        case 'conversation': return 150;
        default: return 100;
    }
}

function calculateTemperature(pattern) {
    switch (pattern) {
        case 'greeting': return 0.7;
        case 'question': return 0.5;
        case 'conversation': return 0.8;
        default: return 0.6;
    }
}

function calculateCost(usage) {
    const inputCost = (usage.prompt_tokens / 1000000) * 0.150;
    const outputCost = (usage.completion_tokens / 1000000) * 0.600;
    return inputCost + outputCost;
}

function generateCacheKey(message, pattern) {
    return `${pattern}:${message.toLowerCase().trim()}`;
}

function updateContext(context, response) {
    return {
        ...context,
        lastResponse: response,
        timestamp: Date.now()
    };
}

module.exports = {
    processWithGPT
};
