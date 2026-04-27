/**
 * AI Integration Layer - Optimized for OpenRouter
 */

const Gemini = {
    // Models
    MODEL_FLASH_LITE: 'google/gemini-3.1-flash-lite-preview',
    MODEL_PRO: 'google/gemini-3.1-pro-preview',

    getApiKey() {
        return localStorage.getItem('gemini_api_key');
    },

    getOpenRouterKey() {
        return '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';
    },

    getInworldKey() {
        // ضع مفتاح Inworld الخاص بك هنا
        return 'cXpIamdtOXpLa1F0dDFuNVVyeVg0MVdoUVZHUUhyNGc6bEptVnpuc0R5aEtSTXpnOVF2a3dRbDd6QnNIYXliazdmMmJLUlNOem5Tc2dPYjRDQkRuRzNTWFQ2dWo1enpUdQ==';
    },

    /**
     * Cleans base64 string by removing the data URL prefix if present.
     */
    cleanBase64(str) {
        if (!str) return null;
        if (str.startsWith('data:')) {
            return str.split(',')[1];
        }
        return str;
    },

    async scanAttendance(imageContent, students, modelOverride = null, retries = 3) {
        const orKey = this.getOpenRouterKey();
        const model = modelOverride || this.MODEL_FLASH_LITE;

        const dispatch = (msg, type) => {
            window.dispatchEvent(new CustomEvent('gemini-log', { detail: { msg, type } }));
        };

        if (!orKey) {
            dispatch('OpenRouter API Key is missing', 'error');
            throw new Error('Please configure OpenRouter API Key in the Test Page.');
        }

        // Build Multi-Part Prompt
        const parts = [];
        parts.push({
            text: `
            Role: Expert Computer Vision Attendance Specialist.
            Task: Identifiy students in the GROUP PHOTO by comparing them against the provided REFERENCE PHOTOS.
            
            Instructions:
            1. Analyze each student reference photo (labeled with their number).
            2. Match faces in the Group Photo with these references.
            3. Return the indices (numbers) of students who are PRESENT.
            
            Return format: json
            {
              "present_indices": [number, number, ...],
              "total_detected_faces": number,
              "reasoning": "Briefly explain detections."
            }
            Important: Only return valid JSON. No conversational text.
        ` });

        // Add Students
        students.forEach((s, idx) => {
            parts.push({ text: `Student Reference ${idx + 1}: ${s.name}` });
            const base64 = this.cleanBase64(s.avatar);
            if (base64 && !s.avatar.startsWith('http')) {
                parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64 } });
            }
        });

        // Add Group Photo
        parts.push({ text: "GROUP PHOTO TO ANALYZE:" });
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: this.cleanBase64(imageContent) } });

        try {
            dispatch(`Calling OpenRouter (${model})...`, 'req');

            // Convert to OpenRouter message format
            const messagesContent = parts.map(p => {
                if (p.text) return { type: "text", text: p.text };
                if (p.inline_data) return {
                    type: "image_url",
                    image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` }
                };
                return null;
            }).filter(c => c !== null);

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${orKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "School Attendance System"
                },
                body: JSON.stringify({
                    "model": model,
                    "messages": [{ "role": "user", "content": messagesContent }],
                    "response_format": { "type": "json_object" }
                })
            });

            const data = await response.json();

            if (data.error) {
                if (retries > 0 && data.error.message.includes('overloaded')) {
                    dispatch('OpenRouter busy, retrying...', 'warning');
                    await new Promise(r => setTimeout(r, 2000));
                    return this.scanAttendance(imageContent, students, retries - 1);
                }
                throw new Error(data.error.message);
            }

            const resultText = data.choices[0].message.content;
            return JSON.parse(resultText);

        } catch (error) {
            dispatch(`API Error: ${error.message}`, 'error');
            throw error;
        }
    }
};
