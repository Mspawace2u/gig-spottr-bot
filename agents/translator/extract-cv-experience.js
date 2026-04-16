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
        // Chunk the CV to ensure the output for any one chunk stays under token limits
        const CHUNK_SIZE = 4000;
        const chunks = [];

        for (let i = 0; i < cvText.length; i += CHUNK_SIZE) {
            chunks.push(cvText.slice(i, i + CHUNK_SIZE));
        }

        console.log(`Split CV into ${chunks.length} chunks for experience extraction`);

        // Process chunks in parallel
        const chunkPromises = chunks.map(async (chunk, index) => {
            try {
                const prompt = spottrConfig.prompts.extractCvExperience + chunk;
                const response = await callLLM(prompt, {
                    provider: 'gemini',
                    model: 'gemini-2.5-flash',
                    temperature: 0.1, // Lower temp for factual accuracy
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

                const data = typeof response === 'string' ? parseJsonFromLLM(response) : response;
                return {
                    experience: data.experience || [],
                    totalYears: data.totalYears || 0
                };
            } catch (err) {
                console.error(`Error processing experience chunk ${index + 1}:`, err);
                return { experience: [], totalYears: 0 };
            }
        });

        const results = await Promise.all(chunkPromises);

        // Aggregate results
        const allRoles = results.flatMap(r => r.experience);
        const uniqueRolesMap = new Map();

        allRoles.forEach(exp => {
            if (exp.role && exp.company) {
                const key = `${exp.role.toLowerCase()}|${exp.company.toLowerCase()}`;
                if (!uniqueRolesMap.has(key)) {
                    uniqueRolesMap.set(key, {
                        ...exp,
                        source: findExperienceInCV(exp.role, cvText)
                    });
                }
            }
        });

        const validatedExperience = Array.from(uniqueRolesMap.values());

        // For total years, take the max found across all chunks (as chunks might have different views)
        // Or better, look for the explicit pattern in the full text
        let finalTotalYears = Math.max(...results.map(r => r.totalYears), 0);

        // Programmatic Fallback for Total Years (More reliable for specific formats)
        const totalExpMatch = cvText.match(/TOTAL EXPERIENCE[^\d]*(\d+)/i);
        if (totalExpMatch && totalExpMatch[1]) {
            const explicitYears = parseInt(totalExpMatch[1], 10);
            if (!isNaN(explicitYears)) {
                console.log(`  🔍 Programmatic override: Found explicit 'TOTAL EXPERIENCE' = ${explicitYears} in CV.`);
                finalTotalYears = explicitYears;
            }
        }

        if (validatedExperience.length === 0) {
            console.warn('⚠️ No experience extracted in any chunk.');
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
 * Helper: Find where an experience entry is mentioned in the CV
 */
function findExperienceInCV(roleName, cvText) {
    const lines = cvText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(roleName.toLowerCase())) {
            return `Line ${i + 1}: ${lines[i].trim().substring(0, 100)}...`;
        }
    }
    return 'Source not found';
}
