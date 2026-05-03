import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { logSemanticMatchStats } from '../../lib/score-debug.js';

/**
 * ANALYST AGENT - Skill: Semantic Skills Match
 *
 * Input: User's skills array, Job's required/preferred skills
 * Output: Graded semantic match percentage + matched/missing/partial skills
 *
 * Purpose:
 * Prevent binary match chaos.
 *
 * Instead of true/false matching, this classifies each skill as:
 * - exact_match
 * - strong_transferable_match
 * - weak_transferable_match
 * - missing_proof
 * - no_match
 */

const MATCH_WEIGHTS = {
    exact_match: 1.0,
    strong_transferable_match: 0.75,
    weak_transferable_match: 0.4,
    missing_proof: 0.2,
    no_match: 0
};

const MATCH_TYPES = Object.keys(MATCH_WEIGHTS);

export async function semanticSkillsMatch(userSkills, requiredSkills, preferredSkills = []) {
    try {
        const userSkillNames = userSkills
            .map(skill => typeof skill === 'string' ? skill : skill?.name)
            .filter(Boolean);

        const prompt = `You are comparing a user's resume skills to a job's required and preferred skills for a hiring-fit analysis system.

Core rule:
Do NOT use simple yes/no matching.
Classify the strength of each match.

USER'S SKILLS:
${userSkillNames.join(', ')}

JOB'S REQUIRED SKILLS:
${requiredSkills.join(', ') || 'None'}

JOB'S PREFERRED SKILLS:
${preferredSkills.join(', ') || 'None'}

For EACH required and preferred job skill, classify the match using exactly one matchType:

1. exact_match
Use when the user's skill directly proves the same skill or very close equivalent.
Examples:
- "Customer Lifecycle Systems" → "Lifecycle Program Design"
- "Customer Health Tracking" → "Customer Health Tracking"
- "Program Reporting" → "Program Reporting"
- "QA Checklists" → "Quality Standards"

2. strong_transferable_match
Use when the user's skill strongly supports the job skill, but the exact context or wording differs.
Examples:
- "Revenue Optimization & Performance Tracking" → "Attribution Modeling"
- "Customer Lifecycle Systems" → "Segmentation Logic"
- "Workflow Automation" → "Trigger Architecture"
- "Project & Program Management" → "Scalable Program Design"

3. weak_transferable_match
Use when the user's skill is related but does not strongly prove the job skill.
Examples:
- "AI Strategy" → "AI-powered Customer Engagement"
- "Process Optimization" → "Experimentation Design"
- "Stakeholder Alignment" → "Partnering with Data Science and Engineering"
- "Operations Management" → "Capacity Planning"

4. missing_proof
Use when the candidate may plausibly have the skill, but the provided resume skills do not clearly prove it.
Examples:
- Job asks for "A/B Testing" and user has only "Optimization"
- Job asks for "In-app Guidance" and user has only "Customer Enablement"
- Job asks for "Cost-to-serve Analysis" and user has only "Revenue Reporting"

5. no_match
Use when there is no meaningful evidence or transferable skill.

Important rules:
- Do NOT give exact_match for broad adjacent skills.
- Do NOT give no_match when there is credible transferable evidence.
- Do NOT over-credit founder/operator experience as exact role-context proof.
- Do NOT under-credit strong systems, customer lifecycle, CX ops, RevOps, enablement, automation, or reporting evidence when those are central to the job.
- For customer ops, Digital CS, CX, RevOps, enablement, lifecycle, and scaled-program roles, transferable systems evidence should usually be strong_transferable_match, not no_match.
- For highly specific technical, product, data science, engineering, legal, clinical, or regulated requirements, use missing_proof unless the user skill is explicit.

Return ONLY valid JSON in this format:
{
  "requiredMatches": [
    {
      "jobSkill": "skill name",
      "userSkill": "matching user skill or null",
      "matchType": "exact_match|strong_transferable_match|weak_transferable_match|missing_proof|no_match",
      "reasoning": "short reason"
    }
  ],
  "preferredMatches": [
    {
      "jobSkill": "skill name",
      "userSkill": "matching user skill or null",
      "matchType": "exact_match|strong_transferable_match|weak_transferable_match|missing_proof|no_match",
      "reasoning": "short reason"
    }
  ]
}`;

        const response = await callLLM(prompt, {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            temperature: 0.2,
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
                                matchType: { type: 'STRING' },
                                reasoning: { type: 'STRING' }
                            },
                            required: ['jobSkill', 'matchType']
                        }
                    },
                    preferredMatches: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                jobSkill: { type: 'STRING' },
                                userSkill: { type: 'STRING' },
                                matchType: { type: 'STRING' },
                                reasoning: { type: 'STRING' }
                            },
                            required: ['jobSkill', 'matchType']
                        }
                    }
                },
                required: ['requiredMatches', 'preferredMatches']
            }
        });

        const parsed = typeof response === 'string' ? parseJsonFromLLM(response) : response;

        const requiredMatches = normalizeMatches(parsed.requiredMatches || []);
        const preferredMatches = normalizeMatches(parsed.preferredMatches || []);

        const requiredScore = calculateWeightedMatchScore(requiredMatches);
        const preferredScore = calculateWeightedMatchScore(preferredMatches);

        const finalScore = preferredMatches.length > 0
            ? (requiredScore * 0.75) + (preferredScore * 0.25)
            : requiredScore;

        const result = {
            score: Math.round(finalScore),

            requiredScore: Math.round(requiredScore),
            preferredScore: Math.round(preferredScore),

            matchedRequired: countUsefulMatches(requiredMatches),
            totalRequired: requiredMatches.length,

            matchedPreferred: countUsefulMatches(preferredMatches),
            totalPreferred: preferredMatches.length,

            requiredMatches,
            preferredMatches,

            matchedRequiredSkills: requiredMatches
                .filter(match => isUsefulMatch(match.matchType))
                .map(match => match.jobSkill),

            missingRequiredSkills: requiredMatches
                .filter(match => !isUsefulMatch(match.matchType))
                .map(match => match.jobSkill),

            matchedPreferredSkills: preferredMatches
                .filter(match => isUsefulMatch(match.matchType))
                .map(match => match.jobSkill),

            missingPreferredSkills: preferredMatches
                .filter(match => !isUsefulMatch(match.matchType))
                .map(match => match.jobSkill),

            exactRequiredSkills: requiredMatches
                .filter(match => match.matchType === 'exact_match')
                .map(match => match.jobSkill),

            strongTransferableRequiredSkills: requiredMatches
                .filter(match => match.matchType === 'strong_transferable_match')
                .map(match => match.jobSkill),

            weakTransferableRequiredSkills: requiredMatches
                .filter(match => match.matchType === 'weak_transferable_match')
                .map(match => match.jobSkill),

            missingProofRequiredSkills: requiredMatches
                .filter(match => match.matchType === 'missing_proof')
                .map(match => match.jobSkill),

            noMatchRequiredSkills: requiredMatches
                .filter(match => match.matchType === 'no_match')
                .map(match => match.jobSkill)
        };

        logSemanticMatchStats('semanticSkillsMatch', result);
        return result;

    } catch (error) {
        console.error('Error in semantic skills match:', error);
        throw new Error(`Failed to match skills semantically: ${error.message}`);
    }
}

function normalizeMatches(matches) {
    return matches.map(match => {
        const matchType = MATCH_TYPES.includes(match.matchType)
            ? match.matchType
            : 'missing_proof';

        return {
            jobSkill: match.jobSkill || 'Unknown skill',
            userSkill: match.userSkill || '',
            matchType,
            reasoning: match.reasoning || ''
        };
    });
}

function calculateWeightedMatchScore(matches) {
    if (!matches.length) return 0;

    const total = matches.reduce((sum, match) => {
        return sum + (MATCH_WEIGHTS[match.matchType] ?? 0);
    }, 0);

    return (total / matches.length) * 100;
}

function countUsefulMatches(matches) {
    return matches.filter(match => isUsefulMatch(match.matchType)).length;
}

function isUsefulMatch(matchType) {
    return [
        'exact_match',
        'strong_transferable_match',
        'weak_transferable_match'
    ].includes(matchType);
}