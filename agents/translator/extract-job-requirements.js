import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { spottrConfig } from '../../config/spottr.js';

/**
 * TRANSLATOR AGENT - Skill: Extract Job Requirements
 * 
 * Input: Job posting text
 * Output: Required skills, preferred skills, required experience
 * Hallucination risk: MEDIUM (may invent skills not explicitly listed)
 */

export async function extractJobRequirements(jobText, jobUrl = '', titleHint = '') {
    if (!jobText || jobText.trim().length === 0) {
        throw new Error('Job posting text is empty');
    }

    try {
        // Call LLM with extraction prompt
        let prompt = spottrConfig.prompts.extractJobRequirements;
        if (titleHint || jobUrl) {
            prompt = `CONTEXT:\nURL: ${jobUrl}\nTITLE HINT: ${titleHint}\n\n` + prompt;
        }
        prompt += jobText;
        const response = await callLLM(prompt, {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            temperature: 0.2, // Lower temp for more consistent extraction
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    jobTitle: { type: 'STRING' },
                    company: { type: 'STRING' },
                    requiredSkills: {
                        type: 'ARRAY',
                        items: { type: 'STRING' }
                    },
                    preferredSkills: {
                        type: 'ARRAY',
                        items: { type: 'STRING' }
                    },
                    requiredExperience: {
                        type: 'OBJECT',
                        properties: {
                            years: { type: 'NUMBER' },
                            level: { type: 'STRING' }
                        },
                        required: ['years', 'level']
                    }
                },
                required: ['jobTitle', 'company', 'requiredSkills', 'preferredSkills', 'requiredExperience']
            }
        });

        // Parse JSON response
        const data = parseJsonFromLLM(response);

        // Validate structure
        if (!data.requiredSkills || !Array.isArray(data.requiredSkills)) {
            throw new Error('Invalid response structure: missing requiredSkills array');
        }

        if (!data.preferredSkills || !Array.isArray(data.preferredSkills)) {
            throw new Error('Invalid response structure: missing preferredSkills array');
        }

        if (!data.requiredExperience || typeof data.requiredExperience !== 'object') {
            throw new Error('Invalid response structure: missing requiredExperience object');
        }

        // Clean and validate skills
        const cleanedRequiredSkills = data.requiredSkills
            .map(skill => skill.trim())
            .filter(skill => skill.length > 0);

        const cleanedPreferredSkills = data.preferredSkills
            .map(skill => skill.trim())
            .filter(skill => skill.length > 0);

        // Validate experience requirements
        const requiredExperience = {
            years: data.requiredExperience.years || 0,
            level: data.requiredExperience.level || 'not specified'
        };

        return {
            jobTitle: data.jobTitle || '',
            company: data.company || '',
            requiredSkills: cleanedRequiredSkills,
            preferredSkills: cleanedPreferredSkills,
            requiredExperience: requiredExperience
        };

    } catch (error) {
        console.error('Error extracting job requirements:', error);
        throw new Error(`Failed to extract job requirements: ${error.message}`);
    }
}
