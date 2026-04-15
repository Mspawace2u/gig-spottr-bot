import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { spottrConfig } from '../../config/spottr.js';

/**
 * TRANSLATOR AGENT - Skill: Extract CV Experience
 * 
 * Input: Raw CV text
 * Output: Array of work experience + total years
 * Hallucination risk: LOW (validated against source text)
 */

export async function extractCvExperience(cvText) {
    if (!cvText || cvText.trim().length === 0) {
        throw new Error('CV text is empty');
    }

    try {
        // Call LLM with extraction prompt
        const prompt = spottrConfig.prompts.extractCvExperience + cvText;
        const response = await callLLM(prompt, {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            temperature: 0.3,
            responseSchema: {
                type: "OBJECT",
                properties: {
                    experience: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                role: { type: "STRING" },
                                company: { type: "STRING" },
                                years: { type: "NUMBER" },
                                level: { type: "STRING" }
                            },
                            required: ["role", "company", "years", "level"]
                        }
                    },
                    totalYears: { type: "NUMBER" }
                },
                required: ["experience", "totalYears"]
            }
        });

        // Parse JSON response
        const data = parseJsonFromLLM(response);

        // Validate structure
        if (!data.experience || !Array.isArray(data.experience)) {
            throw new Error('Invalid response structure: missing experience array');
        }

        if (typeof data.totalYears !== 'number') {
            throw new Error('Invalid response structure: missing totalYears');
        }

        // Validate each experience entry
        const validatedExperience = data.experience.map(exp => {
            if (!exp.role) {
                throw new Error('Experience entry missing role property');
            }

            return {
                role: exp.role.trim(),
                company: exp.company?.trim() || 'Not specified',
                years: exp.years || 0,
                level: exp.level || 'not specified',
                source: findExperienceInCV(exp.role, cvText) // Track where it came from
            };
        });

        // Programmatic Fallback for Total Years (LLMs are notoriously bad at math/following negative constraints around math)
        let finalTotalYears = data.totalYears;

        // Look for explicit pattern: "TOTAL EXPERIENCE: 25 years" or "**TOTAL EXPERIENCE:** 25"
        // [^\d]* allows any non-digit characters (like colons, asterisks, spaces) before the digits
        const totalExpMatch = cvText.match(/TOTAL EXPERIENCE[^\d]*(\d+)/i);
        if (totalExpMatch && totalExpMatch[1]) {
            const explicitYears = parseInt(totalExpMatch[1], 10);
            if (!isNaN(explicitYears)) {
                console.log(`  🔍 Programmatic override: Found explicit 'TOTAL EXPERIENCE' = ${explicitYears} in CV, overriding LLM output (${data.totalYears}).`);
                finalTotalYears = explicitYears;
            }
        }

        return {
            experience: validatedExperience,
            totalYears: finalTotalYears
        };

    } catch (error) {
        console.error('Error extracting CV experience:', error);
        throw new Error(`Failed to extract experience: ${error.message}`);
    }
}

/**
 * Helper: Find where an experience entry is mentioned in the CV (for source tracking)
 */
function findExperienceInCV(roleName, cvText) {
    const lines = cvText.split('\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(roleName.toLowerCase())) {
            return `Line ${i + 1}: ${lines[i].trim().substring(0, 100)}...`;
        }
    }

    return 'Source not found (possible hallucination)';
}
