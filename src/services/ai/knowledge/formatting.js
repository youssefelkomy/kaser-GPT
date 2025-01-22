// قواعد تنسيق النص العربي
const formattingRules = {
    // القواعد الأساسية للتنسيق
    basic: `يجب اتباع قواعد التنسيق التالية في كل الردود :

- استخدم <b>النص</b> للنص العريض
- اترك سطراً فارغاً بين الأقسام المختلفة
- رقم القوائم مع نقطة ومسافة (1. )`,

    // علامات الترقيم
    punctuation: {
        period: ' .\n',        // النقطة مع سطر جديد
        comma: ' ، ',          // الفاصلة
        semicolon: ' ؛\n',     // الفاصلة المنقوطة مع سطر جديد
        colon: ' :\n\n',       // النقطتين مع سطرين جديدين
        questionMark: ' ؟ ',   // علامة الاستفهام
        exclamationMark: ' ! ', // علامة التعجب
        openBracket: ' ( ',    // القوس المفتوح
        closeBracket: ' ) '    // القوس المغلق
    },

    // العبارات الشائعة
    commonPhrases: {
        salam: 'وعليكم السلام ورحمة الله وبركاته',
        welcome: 'هلا وغلا',
        inshallah: 'إن شاء الله',
        bismillah: 'بسم الله الرحمن الرحيم'
    },

    // قواعد الفقرات
    paragraphs: `- ابدأ كل فقرة في سطر جديد
- اترك سطراً فارغاً بين الفقرات
- رتب الأفكار بشكل منطقي ومتسلسل
- استخدم النقاط عند سرد القوائم`,

    // أمثلة على التنسيق الصحيح
    examples: {
        greeting: 'وعليكم السلام ورحمة الله وبركاته ! كيف حالك اليوم ؟',
        list: '1. النقطة الأولى\n2. النقطة الثانية\n3. النقطة الثالثة',
        paragraph: 'هذه فقرة نموذجية . تحتوي على جمل متعددة ، مفصولة بعلامات ترقيم صحيحة .'
    }
};

// دالة لتطبيق قواعد التنسيق على النص
function applyFormatting(text) {
    if (!text) return text;
    
    let formattedText = text;

    // تنظيف أي علامات HTML موجودة مسبقاً
    formattedText = formattedText.replace(/<\/?[^>]+(>|$)/g, '');

    // تحويل علامات النجوم إلى HTML tags
    formattedText = formattedText
        .replace(/\*{2,}([^*]+)\*{2,}/g, '<b>$1</b>');  // تحويل النص العريض فقط

    // تنسيق العناوين والأقسام
    formattedText = formattedText
        // تنسيق العناوين الرئيسية
        .replace(/^([^.\n]+?):\s*/gm, '<b>$1</b>:\n\n')
        // تنسيق عناوين القوائم المرقمة
        .replace(/(\d+)\.\s+([^.\n]+?):\s*/g, '$1. <b>$2</b>:\n')
        // تنسيق النقاط الفرعية
        .replace(/^\s*-\s+(.+)$/gm, '• $1')
        // إضافة مسافة بين الأقسام
        .replace(/\n{3,}/g, '\n\n');

    // معالجة علامات الترقيم
    const marks = {
        '.': ' .\n',
        '،': ' ، ',
        '؛': ' ؛\n',
        ':': ' :\n\n',
        '؟': ' ؟ ',
        '!': ' ! ',
        '(': ' ( ',
        ')': ' ) '
    };

    // استبدال علامات الترقيم مع التنسيق المناسب
    Object.entries(marks).forEach(([mark, replacement]) => {
        const pattern = new RegExp(`\\s*\\${mark}\\s*`, 'g');
        formattedText = formattedText.replace(pattern, replacement);
    });

    // تنظيف وتحسين النص النهائي
    formattedText = formattedText
        .replace(/\s+/g, ' ')           // توحيد المسافات المتعددة
        .replace(/^\s+|\s+$/g, '')      // إزالة المسافات في البداية والنهاية
        .replace(/\n{3,}/g, '\n\n')     // تقليل الأسطر الفارغة المتتالية إلى سطرين
        .replace(/([.،:؛؟!)])\s+/g, '$1') // إزالة المسافات الزائدة
        .replace(/\s+([.،:؛؟!)])/g, '$1') // إزالة المسافات الزائدة
        .replace(/([.،:؛؟!])/g, ' $1 ') // إضافة مسافة واحدة قبل وبعد علامات الترقيم
        .replace(/\n+$/g, '')           // إزالة الأسطر الفارغة في النهاية
        .trim();

    // التأكد من إغلاق جميع علامات HTML
    const openTags = formattedText.match(/<[^/][^>]*>/g) || [];
    const closeTags = formattedText.match(/<\/[^>]+>/g) || [];
    
    if (openTags.length > closeTags.length) {
        formattedText += '</b>'.repeat(openTags.length - closeTags.length);
    }

    return formattedText;
}

// تصدير القواعد والدوال
module.exports = {
    formattingRules,
    applyFormatting
};
