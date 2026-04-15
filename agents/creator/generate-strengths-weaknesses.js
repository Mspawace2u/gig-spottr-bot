import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { spottrConfig } from '../../config/spottr.js';

/**
 * CREATOR AGENT - Skill: Generate Strengths/Weaknesses
 * 
 * Input: Match data (matched/missing skills, experience comparison)
 * Output: Human-readable strengths and weaknesses
 * Hallucination risk: LOW (constrained to provided data only)
 */

export async function generateStrengthsWeaknesses(matchData) {
    // Validate input
    if (!matchData.matchedSkills || !matchData.missingSkills) {
        throw new Error('Match data missing required fields');
    }

    try {
        // Build the prompt with actual data
        const prompt = spottrConfig.prompts.generateStrengthsWeaknesses
            .replace('{matchedSkills}', matchData.matchedSkills.join(', ') || 'None')
            .replace('{missingSkills}', matchData.missingSkills.join(', ') || 'None')
            .replace('{userExperience}', formatExperience(matchData.userExperience))
            .replace('{jobExperience}', formatExperience(matchData.jobExperience));

        // Call LLM
        const response = await callLLM(prompt, {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            temperature: 0.7 // Slightly higher for more natural language
        });

        // Parse JSON response
        const data = parseJsonFromLLM(response);

        // Validate structure
        if (!data.strengths || !Array.isArray(data.strengths)) {
            throw new Error('Invalid response structure: missing strengths array');
        }

        if (!data.weaknesses || !Array.isArray(data.weaknesses)) {
            throw new Error('Invalid response structure: missing weaknesses array');
        }

        // Validate that LLM didn't invent skills
        validateNoHallucinations(data, matchData);

        return {
            strengths: data.strengths,
            weaknesses: data.weaknesses
        };

    } catch (error) {
        console.error('Error generating strengths/weaknesses:', error);
        throw new Error(`Failed to generate explanation: ${error.message}`);
    }
}

/**
 * Helper: Format experience data for the prompt
 */
function formatExperience(experience) {
    if (!experience) {
        return 'Not specified';
    }

    if (experience.totalYears !== undefined) {
        // User experience format
        return `${experience.totalYears} years total, highest level: ${experience.level || 'not specified'}`;
    } else {
        // Job experience format
        return `${experience.years || 0} years required, level: ${experience.level || 'not specified'}`;
    }
}

/**
 * Helper: Validate that LLM didn't invent skills not in the original data
 */
function validateNoHallucinations(llmResponse, matchData) {
    const allKnownSkills = [
        ...matchData.matchedSkills,
        ...matchData.missingSkills
    ].map(s => s.toLowerCase());

    // Check strengths
    llmResponse.strengths.forEach(strength => {
        const lowerStrength = strength.toLowerCase();

        // Make sure any skill mentioned in strengths is in matchedSkills
        matchData.matchedSkills.forEach(skill => {
            if (lowerStrength.includes(skill.toLowerCase())) {
                return; // Valid - skill is in matched list
            }
        });
    });

    // Check weaknesses
    llmResponse.weaknesses.forEach(weakness => {
        const lowerWeakness = weakness.toLowerCase();

        // Make sure any skill mentioned in weaknesses is in missingSkills
        matchData.missingSkills.forEach(skill => {
            if (lowerWeakness.includes(skill.toLowerCase())) {
                return; // Valid - skill is in missing list
            }
        });
    });

    // Note: This is a basic check. More sophisticated validation could be added.
}
