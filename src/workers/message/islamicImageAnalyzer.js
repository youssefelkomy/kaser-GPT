const { RekognitionClient, DetectFacesCommand, DetectLabelsCommand, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
const logger = require('../../utils/logger');

const rekognition = new RekognitionClient({
    region: 'eu-west-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    maxAttempts: 3,
    timeout: 10000,
});

const INAPPROPRIATE_KEYWORDS = {
    CLOTHING: [
        'tight', 'fitted', 'skinny',
        'sleeveless', 'tank top', 'short sleeve',
        'jeans', 'pants', 'trousers',
        'dress', 'skirt',
        'transparent', 'see through',
        'neck', 'chest', 'shoulder',
        'fashion', 'style', 'trendy'
    ],
    HIJAB_ISSUES: [
        'hair', 'hairstyle', 'long hair', 'short hair',
        'bangs', 'ponytail', 'braid', 'haircut',
        'neck exposed', 'ear', 'ears',
        'partial hijab', 'turban',
        'colorful', 'decorated',
        'fashion hijab', 'stylish hijab'
    ],
    INTERACTIONS: [
        'touching', 'hugging', 'embrace',
        'mixed group', 'gathering', 'together',
        'close', 'intimate', 'proximity',
        'selfie together', 'group photo'
    ],
    INAPPROPRIATE_CONTENT: [
        'dance', 'dancing', 'party',
        'sexual', 'intimate', 'suggestive'
    ]
};

async function analyzeImageIslamically(imageBuffer) {
    try {
        const results = {
            isAppropriate: true,
            reason: [],
            description: ''
        };

        // 1. تحليل المحتوى العام للصورة
        const labelsCommand = new DetectLabelsCommand({
            Image: { Bytes: imageBuffer },
            MaxLabels: 50,
            MinConfidence: 60
        });
        const labelsResponse = await rekognition.send(labelsCommand);
        
        const allLabelsText = labelsResponse.Labels
            .map(label => {
                const name = label.Name.toLowerCase();
                const parents = (label.Parents || []).map(p => p.Name.toLowerCase()).join(' ');
                return `${name} ${parents}`;
            })
            .join(' ');

        // 2. فحص المحتوى غير اللائق
        const moderationCommand = new DetectModerationLabelsCommand({
            Image: { Bytes: imageBuffer },
            MinConfidence: 60
        });
        const moderationResponse = await rekognition.send(moderationCommand);
        
        const inappropriateLabels = [
            'Explicit Nudity', 'Nudity', 'Graphic Violence', 'Drugs',
            'Sexual Activity', 'Suggestive', 'Female Swimwear Or Underwear'
        ];

        const foundInappropriate = moderationResponse.ModerationLabels.some(label => 
            inappropriateLabels.includes(label.Name) && label.Confidence > 60
        );

        if (foundInappropriate) {
            results.isAppropriate = false;
            results.reason.push('تم اكتشاف محتوى غير لائق في الصورة');
            return results;
        }

        // 3. فحص التفاعلات غير المناسبة
        const hasInappropriateInteractions = INAPPROPRIATE_KEYWORDS.INTERACTIONS.some(keyword => 
            allLabelsText.includes(keyword.toLowerCase())
        );

        if (hasInappropriateInteractions) {
            results.isAppropriate = false;
            results.reason.push('تم اكتشاف تفاعلات غير مناسبة في الصورة');
            return results;
        }

        // 4. تحليل الوجوه والشعر
        const facesCommand = new DetectFacesCommand({
            Image: { Bytes: imageBuffer },
            Attributes: ['ALL']
        });
        const facesResponse = await rekognition.send(facesCommand);

        if (facesResponse.FaceDetails && facesResponse.FaceDetails.length > 0) {
            // فحص عدد الوجوه في الصورة
            if (facesResponse.FaceDetails.length > 1) {
                // التحقق من وجود تفاعل غير مناسب بين الوجوه
                const hasMultipleFaces = facesResponse.FaceDetails.some((face, index) => {
                    const gender = face.Gender.Value.toLowerCase();
                    const age = (face.AgeRange.Low + face.AgeRange.High) / 2;
                    
                    // تجاهل الأطفال تحت 13 سنة
                    if (age <= 13) return false;

                    // فحص المسافة بين الوجوه
                    for (let i = index + 1; i < facesResponse.FaceDetails.length; i++) {
                        const otherFace = facesResponse.FaceDetails[i];
                        const otherGender = otherFace.Gender.Value.toLowerCase();
                        const otherAge = (otherFace.AgeRange.Low + otherFace.AgeRange.High) / 2;
                        
                        if (otherAge <= 13) continue;

                        // إذا كان هناك ذكر وأنثى في نفس الصورة
                        if (gender !== otherGender) {
                            return true;
                        }
                    }
                    return false;
                });

                if (hasMultipleFaces) {
                    results.isAppropriate = false;
                    results.reason.push('تم اكتشاف اختلاط في الصورة');
                    return results;
                }
            }

            // فحص كل وجه على حدة
            for (const face of facesResponse.FaceDetails) {
                const gender = face.Gender.Value.toLowerCase();
                const age = (face.AgeRange.Low + face.AgeRange.High) / 2;
                
                // تجاهل الأطفال تحت 13 سنة
                if (age <= 13) {
                    continue;
                }

                // فحص النساء فوق 13 سنة فقط
                if (gender === 'female' && age > 13) {
                    // فحص الشعر الظاهر باستخدام تحليل الوجه
                    const hasVisibleHair = face.Landmarks.some(landmark => 
                        ['leftEyebrow', 'rightEyebrow', 'nose', 'leftEar', 'rightEar'].includes(landmark.Type)
                    );

                    // فحص إضافي للشعر باستخدام الكلمات المفتاحية
                    const hasHairKeywords = INAPPROPRIATE_KEYWORDS.HIJAB_ISSUES.some(keyword => 
                        allLabelsText.includes(keyword.toLowerCase())
                    );

                    // فحص نسبة الثقة في وجود الشعر
                    const hairConfidence = labelsResponse.Labels.find(label => 
                        label.Name.toLowerCase().includes('hair')
                    )?.Confidence || 0;

                    if (hasVisibleHair || hasHairKeywords || hairConfidence > 60) {
                        results.isAppropriate = false;
                        results.reason.push('تم اكتشاف شعر ظاهر في الصورة');
                        return results;
                    }

                    // فحص الصور من الخلف
                    if (Math.abs(face.Pose.Yaw) > 60) {
                        results.isAppropriate = false;
                        results.reason.push('تم اكتشاف صورة من الخلف');
                        return results;
                    }

                    // فحص مشاكل الحجاب
                    const hasHijabIssues = INAPPROPRIATE_KEYWORDS.HIJAB_ISSUES.some(keyword => 
                        allLabelsText.includes(keyword.toLowerCase())
                    );

                    if (hasHijabIssues) {
                        results.isAppropriate = false;
                        results.reason.push('الحجاب غير متوافق مع الضوابط الشرعية');
                        return results;
                    }

                    // فحص الملابس غير المناسبة
                    const hasInappropriateClothing = INAPPROPRIATE_KEYWORDS.CLOTHING.some(keyword => 
                        allLabelsText.includes(keyword.toLowerCase())
                    );

                    if (hasInappropriateClothing) {
                        results.isAppropriate = false;
                        results.reason.push('الملابس غير متوافقة مع الضوابط الشرعية');
                        return results;
                    }

                    // فحص المحتوى غير المناسب
                    const hasInappropriateContent = INAPPROPRIATE_KEYWORDS.INAPPROPRIATE_CONTENT.some(keyword => 
                        allLabelsText.includes(keyword.toLowerCase())
                    );

                    if (hasInappropriateContent) {
                        results.isAppropriate = false;
                        results.reason.push('تم اكتشاف محتوى غير مناسب');
                        return results;
                    }
                }
            }
        }

        // إذا وصلنا إلى هنا ، فالصورة مناسبة
        if (results.isAppropriate) {
            results.description = 'الصورة مناسبة وتتوافق مع الضوابط الشرعية';
        }

        return results;

    } catch (error) {
        logger.error('Error in Islamic image analysis:', error);
        return {
            isAppropriate: false,
            reason: ['حدث خطأ أثناء تحليل الصورة'],
            description: 'حدث خطأ أثناء تحليل الصورة'
        };
    }
}

module.exports = {
    analyzeImageIslamically
};
