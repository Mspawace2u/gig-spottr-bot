import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { spottrConfig } from '../../config/spottr.js';

/**
 * CREATOR AGENT - Skill: Generate Strengths/Weaknesses
 *
 * Input:
 * - matched/missing skills
 * - experience comparison
 * - evidence classification
 *
 * Output:
 * - human-readable strengths and weaknesses
 */

export async function generateStrengthsWeaknesses(matchData) {
    if (!matchData.matchedSkills || !matchData.missingSkills) {
        throw new Error('Match data missing required fields');
    }

    try {
        const prompt = spottrConfig.prompts.generateStrengthsWeaknesses
            .replace('{matchedSkills}', matchData.matchedSkills.join(', ') || 'None')
            .replace('{missingSkills}', matchData.missingSkills.join(', ') || 'None')
            .replace('{userExperience}', formatExperience(matchData.userExperience))
            .replace('{jobExperience}', formatExperience(matchData.jobExperience))
            .replace('{evidenceClassification}', formatEvidenceClassification(matchData.evidenceClassification));

        const response = await callLLM(prompt, {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            temperature: 0.3
        });

        const data = parseJsonFromLLM(response);

        if (!data.strengths || !Array.isArray(data.strengths)) {
            throw new Error('Invalid response structure: missing strengths array');
        }

        if (!data.weaknesses || !Array.isArray(data.weaknesses)) {
            throw new Error('Invalid response structure: missing weaknesses array');
        }

        return {
            strengths: data.strengths,
            weaknesses: data.weaknesses
        };

    } catch (error) {
        console.error('Error generating strengths/weaknesses:', error);
        throw new Error(`Failed to generate explanation: ${error.message}`);
    }
}

function formatExperience(experience) {
    if (!experience) {
        return 'Not specified';
    }

    if (experience.totalYears !== undefined) {
        return `${experience.totalYears} years total, highest level: ${experience.level || 'not specified'}`;
    }

    return `${experience.years || 0} years required, level: ${experience.level || 'not specified'}`;
}

function formatEvidenceClassification(evidenceClassification) {
    if (!evidenceClassification) {
        return 'No evidence classification provided.';
    }

    return JSON.stringify({
        score: evidenceClassification.score,
        rawSemanticScore: evidenceClassification.rawSemanticScore,
        summary: evidenceClassification.summary,
        strongestEvidence: evidenceClassification.strongestEvidence,
        biggestProofGaps: evidenceClassification.biggestProofGaps,
        buckets: evidenceClassification.buckets
    }, null, 2);
}
