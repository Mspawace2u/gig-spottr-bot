import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { spottrConfig } from '../../config/spottr.js';

/**
 * TRANSLATOR AGENT - Skill: Extract CV Skills
 * 
 * Input: Raw CV text
 * Output: Array of skills with proficiency + years
 * Hallucination risk: LOW (uses structured output schema)
 */

export async function extractCvSkills(cvText) {
    if (!cvText || cvText.trim().length === 0) {
        throw new Error('CV text is empty');
    }

    try {
        // Chunk the CV to handle large files (avoiding output token limits)
        const CHUNK_SIZE = 5000;
        const chunks = [];

        for (let i = 0; i < cvText.length; i += CHUNK_SIZE) {
            chunks.push(cvText.slice(i, i + CHUNK_SIZE));
        }

        console.log(`Split CV into ${chunks.length} chunks for processing`);

        // Process chunks in parallel
        const chunkPromises = chunks.map(async (chunk, index) => {
            try {
                const prompt = spottrConfig.prompts.extractCvSkills + chunk;

                const response = await callLLM(prompt, {
                    provider: 'gemini',
                    model: 'gemini-1.5-pro',
                    temperature: 0.3,
                    responseSchema: {
                        type: 'OBJECT',
                        properties: {
                            skills: {
                                type: 'ARRAY',
                                items: {
                                    type: 'OBJECT',
                                    properties: {
                                        name: { type: 'STRING' },
                                        proficiency: { type: 'STRING' },
                                        years: { type: 'NUMBER' }
                                    },
                                    required: ['name']
                                }
                            }
                        },
                        required: ['skills']
                    }
                });

                // Parse response
                const parsed = typeof response === 'string' ? parseJsonFromLLM(response) : response;
                return parsed.skills || [];

            } catch (err) {
                console.error(`Error processing chunk ${index + 1}:`, err);
                return []; // specific chunk failed, return empty to not break whole flow
            }
        });

        const results = await Promise.all(chunkPromises);

        // Flatten and deduplicate
        const allSkills = results.flat();
        const uniqueSkillsMap = new Map();

        allSkills.forEach(skill => {
            if (skill.name) {
                // Use a key to deduplicate (case-insensitive name)
                const key = skill.name.toLowerCase().trim();
                // Keep the one with years info if duplicate
                if (!uniqueSkillsMap.has(key) || (skill.years && !uniqueSkillsMap.get(key).years)) {
                    uniqueSkillsMap.set(key, {
                        name: skill.name.trim(),
                        proficiency: skill.proficiency || 'not specified',
                        years: skill.years || 0,
                        source: 'Extracted from CV' // Simplified source for aggregated valid
                    });
                }
            }
        });

        const validatedSkills = Array.from(uniqueSkillsMap.values());

        if (validatedSkills.length === 0) {
            throw new Error('No skills found in any chunk');
        }

        return validatedSkills;

    } catch (error) {
        console.error('Error extracting CV skills:', error);
        throw new Error(`Failed to extract skills: ${error.message}`);
    }
}

/**
 * Helper: Find where a skill is mentioned in the CV (for source tracking)
 */
function findSkillInCV(skillName, cvText) {
    const lines = cvText.split('\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(skillName.toLowerCase())) {
            return `Line ${i + 1}: ${lines[i].trim().substring(0, 100)}...`;
        }
    }

    return 'Source not found (possible hallucination)';
}
