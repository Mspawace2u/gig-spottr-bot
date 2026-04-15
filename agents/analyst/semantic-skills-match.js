import { callLLM } from '../../lib/llm.js';

/**
 * ANALYST AGENT - Skill: Semantic Skills Match
 * 
 * Input: User's skills array, Job's required/preferred skills
 * Output: Match percentage + matched/missing skills
 * Hallucination risk: LOW (constrained to provided data)
 * 
 * This uses an LLM to do SEMANTIC matching instead of exact string matching.
 * Example: "Email List Management" matches "List building campaigns"
 */

export async function semanticSkillsMatch(userSkills, requiredSkills, preferredSkills = []) {
    try {
        const userSkillNames = userSkills.map(s => typeof s === 'string' ? s : s.name);

        // Build the prompt
        const prompt = `You are comparing a user's skills to a job's required and preferred skills.

USER'S SKILLS:
${userSkillNames.join(', ')}

JOB'S REQUIRED SKILLS:
${requiredSkills.join(', ')}

JOB'S PREFERRED SKILLS:
${preferredSkills.join(', ')}

For EACH required skill, determine if the user has it (even if worded differently).
For EACH preferred skill, determine if the user has it (even if worded differently).

Examples of matches:
- User has "Email List Management" → Job needs "List building campaigns" → MATCH
- User has "Funnel Strategy" → Job needs "Funnels" → MATCH
- User has "Project Management" → Job needs "Project management" → MATCH
- User has "Digital Marketing" → Job needs "Marketing" → MATCH
- User has "SEO" → Job needs "Search Engine Optimization" → MATCH
- User has "Team Building" → Job needs "Team development" → MATCH

Examples of non-matches:
- User has "Email Marketing" → Job needs "Product launches" → NO MATCH (different skills)
- User has "SEO" → Job needs "PPC" → NO MATCH (different skills)

Return your response as valid JSON in this format:
{
  "requiredMatches": [
    { "jobSkill": "skill name", "userSkill": "matching user skill or null", "isMatch": true/false }
  ],
  "preferredMatches": [
    { "jobSkill": "skill name", "userSkill": "matching user skill or null", "isMatch": true/false }
  ]
}`;

        const response = await callLLM(prompt, {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            temperature: 0.3,
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    requiredMatches: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                jobSkill: { type: 'STRING' },
                                userSkill: { type: 'STRING' },
                                isMatch: { type: 'BOOLEAN' }
                            },
                            required: ['jobSkill', 'isMatch']
                        }
                    },
                    preferredMatches: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                jobSkill: { type: 'STRING' },
                                userSkill: { type: 'STRING' },
                                isMatch: { type: 'BOOLEAN' }
                            },
                            required: ['jobSkill', 'isMatch']
                        }
                    }
                },
                required: ['requiredMatches', 'preferredMatches']
            }
        });

        // Parse response
        const parsed = typeof response === 'string' ? JSON.parse(response) : response;

        // Calculate scores
        const matchedRequired = parsed.requiredMatches.filter(m => m.isMatch).length;
        const totalRequired = parsed.requiredMatches.length;

        const matchedPreferred = parsed.preferredMatches.filter(m => m.isMatch).length;
        const totalPreferred = parsed.preferredMatches.length;

        const requiredScore = totalRequired > 0 ? (matchedRequired / totalRequired) * 100 : 0;
        const preferredScore = totalPreferred > 0 ? (matchedPreferred / totalPreferred) * 100 : 0;

        // Weight required skills more heavily (70% required, 30% preferred)
        const finalScore = totalPreferred > 0
            ? (requiredScore * 0.7) + (preferredScore * 0.3)
            : requiredScore;

        return {
            score: Math.round(finalScore),
            matchedRequired: matchedRequired,
            totalRequired: totalRequired,
            matchedPreferred: matchedPreferred,
            totalPreferred: totalPreferred,
            matchedRequiredSkills: parsed.requiredMatches.filter(m => m.isMatch).map(m => m.jobSkill),
            missingRequiredSkills: parsed.requiredMatches.filter(m => !m.isMatch).map(m => m.jobSkill),
            matchedPreferredSkills: parsed.preferredMatches.filter(m => m.isMatch).map(m => m.jobSkill),
            missingPreferredSkills: parsed.preferredMatches.filter(m => !m.isMatch).map(m => m.jobSkill)
        };

    } catch (error) {
        console.error('Error in semantic skills match:', error);
        throw new Error(`Failed to match skills semantically: ${error.message}`);
    }
}
