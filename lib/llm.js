// Unified LLM caller - supports Gemini, OpenAI, Claude

export async function callLLM(prompt, options = {}) {
    const provider = options.provider || 'gemini'; // Default to Gemini
    const model = options.model || 'gemini-2.5-flash';
    const temperature = options.temperature || 0.7;

    try {
        if (provider === 'gemini') {
            return await callGemini(prompt, model, temperature, options);
        } else if (provider === 'openai') {
            return await callOpenAI(prompt, model, temperature);
        } else if (provider === 'claude') {
            return await callClaude(prompt, model, temperature);
        } else {
            throw new Error(`Unknown LLM provider: ${provider}`);
        }
    } catch (error) {
        console.error(`LLM call failed (${provider}):`, error);
        throw error;
    }
}

// ============================================
// GEMINI
// ============================================

async function callGemini(prompt, model, temperature, options) {
    const apiKey = import.meta.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found in environment variables');
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: temperature,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                    responseMimeType: 'application/json',
                    responseSchema: options.responseSchema
                }
            })
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response from Gemini');
    }

    return data.candidates[0].content.parts[0].text;
}

// ============================================
// OPENAI (for future use)
// ============================================

async function callOpenAI(prompt, model, temperature) {
    const apiKey = import.meta.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY not found in environment variables');
    }

    const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4o',
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: temperature
            })
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// ============================================
// CLAUDE (for future use)
// ============================================

async function callClaude(prompt, model, temperature) {
    const apiKey = import.meta.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not found in environment variables');
    }

    const response = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model || 'claude-3-5-sonnet-20241022',
                max_tokens: 8192,
                temperature: temperature,
                messages: [
                    { role: 'user', content: prompt }
                ]
            })
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

// ============================================
// HELPER: Parse JSON from LLM response
// ============================================

export function parseJsonFromLLM(text) {
    let cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch (error) {
        console.warn('Initial JSON parse failed, attempting recovery for truncated response...');
        
        // Attempt to fix common truncation patterns (mid-list or mid-object)
        try {
            let fixed = cleaned;
            
            // If it ends with a comma or open brace/bracket, clean it up
            fixed = fixed.replace(/,\s*$/g, '');
            
            // Track nesting to close in correct LIFO order, ignoring chars inside quotes
            const stack = [];
            let inString = false;
            let escaped = false;
            
            for (let i = 0; i < fixed.length; i++) {
                const char = fixed[i];
                
                if (char === '"' && !escaped) {
                    inString = !inString;
                }
                
                if (!inString) {
                    if (char === '{') stack.push('}');
                    else if (char === '[') stack.push(']');
                    else if (char === '}') stack.pop();
                    else if (char === ']') stack.pop();
                }
                
                escaped = char === '\\' && !escaped;
            }
            
            // Close unclosed structures in reverse order (LIFO)
            while (stack.length > 0) {
                fixed += stack.pop();
            }
            
            return JSON.parse(fixed);
        } catch (recoveryError) {
            console.error('JSON recovery failed:', recoveryError);
            console.error('Raw problematic text:', text);
            throw new Error('AI returned malformed or truncated data that couldn\'t be recovered.');
        }
    }
}
