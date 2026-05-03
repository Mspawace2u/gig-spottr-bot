import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { spottrConfig } from '../../config/spottr.js';
import { logEvidenceStats } from '../../lib/score-debug.js';

/**
 * ANALYST AGENT - Skill: Classify Role Fit Evidence
 *
 * Purpose:
 * Turns raw skill matches into hiring-useful evidence buckets.
 *
 * This prevents adjacent founder/operator experience from being over-scored as exact role-context proof.
 *
 * Input:
 * - user skills
 * - user experience
 * - job requirements
 * - semantic match output
 * - experience match output
 *
 * Output:
 * - evidence buckets
 * - adjusted fit score
 * - strongest evidence
 * - biggest proof gaps
 */

const EVIDENCE_WEIGHTS = {
    direct_evidence: 1,
    adjacent_evidence: 0.55,
    implied_founder_operator: 0.45,
    missing_proof: 0.15,
    missing_capability: 0
};

const EXACT_PROOF_SKILLS = [
    'product management',
    'growth product management',
    'product roadmap ownership',
    'roadmap ownership',
    'shipped product experience',
    'shipped products',
    'product analytics',
    'a/b testing',
    'ab testing',
    'experimentation',
    'product experimentation',
    'design and engineering collaboration',
    'engineering collaboration',
    'pricing and packaging',
    'self-serve growth motion',
    'self serve growth motion',
    'enterprise growth motion',
    'feature definition',
    'customer discovery'
];

export async function classifyRoleFitEvidence({
    userSkills = [],
    userExperience = {},
    jobRequirements = {},
    skillsMatch = {},
    experienceMatch = {}
}) {
    const normalizedUserSkills = normalizeUserSkills(userSkills);
    const requiredSkills = jobRequirements.requiredSkills || [];
    const preferredSkills = jobRequirements.preferredSkills || [];

    const prompt = spottrConfig.prompts.classifyRoleFitEvidence
        .replace('{userSkills}', normalizedUserSkills.join(', ') || 'None')
        .replace('{userExperience}', formatUserExperience(userExperience))
        .replace('{jobTitle}', jobRequirements.jobTitle || 'Unknown role')
        .replace('{company}', jobRequirements.company || 'Unknown company')
        .replace('{requiredSkills}', requiredSkills.join(', ') || 'None')
        .replace('{preferredSkills}', preferredSkills.join(', ') || 'None')
        .replace('{requiredExperience}', formatRequiredExperience(jobRequirements.requiredExperience))
        .replace('{matchedRequiredSkills}', (skillsMatch.matchedRequiredSkills || []).join(', ') || 'None')
        .replace('{matchedPreferredSkills}', (skillsMatch.matchedPreferredSkills || []).join(', ') || 'None')
        .replace('{missingRequiredSkills}', (skillsMatch.missingRequiredSkills || []).join(', ') || 'None')
        .replace('{missingPreferredSkills}', (skillsMatch.missingPreferredSkills || []).join(', ') || 'None')
        .replace('{experienceMatch}', JSON.stringify(experienceMatch || {}, null, 2));

    const response = await callLLM(prompt, {
        provider: 'openai',
        model: 'gpt-5.4-mini',
        temperature: 0.2,
        responseSchema: {
            type: 'OBJECT',
            properties: {
                classifications: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            jobSkill: { type: 'STRING' },
                            skillType: { type: 'STRING' },
                            evidenceType: { type: 'STRING' },
                            matchedUserSkill: { type: 'STRING' },
                            reasoning: { type: 'STRING' }
                        },
                        required: ['jobSkill', 'skillType', 'evidenceType', 'reasoning']
                    }
                },
                summary: { type: 'STRING' }
            },
            required: ['classifications', 'summary']
        }
    });

    const parsed = typeof response === 'string' ? parseJsonFromLLM(response) : response;
    const rawClassifications = Array.isArray(parsed.classifications) ? parsed.classifications : [];

    const cleanedClassifications = rawClassifications.map(item =>
        enforceEvidenceRules(item, normalizedUserSkills)
    );

    const requiredClassifications = cleanedClassifications.filter(
        item => item.skillType === 'required'
    );

    const preferredClassifications = cleanedClassifications.filter(
        item => item.skillType === 'preferred'
    );

    const requiredScore = calculateWeightedScore(requiredClassifications);
    const preferredScore = calculateWeightedScore(preferredClassifications);

    const finalScore = preferredClassifications.length > 0
        ? Math.round((requiredScore * 0.75) + (preferredScore * 0.25))
        : Math.round(requiredScore);

    const buckets = groupByEvidenceType(cleanedClassifications);

    const result = {
        score: finalScore,
        rawSemanticScore: skillsMatch.score || 0,
        experienceScore: experienceMatch.score || 0,
        summary: parsed.summary || '',
        classifications: cleanedClassifications,
        buckets,
        strongestEvidence: [
            ...buckets.direct_evidence,
            ...buckets.adjacent_evidence,
            ...buckets.implied_founder_operator
        ].slice(0, 5),
        biggestProofGaps: [
            ...buckets.missing_proof,
            ...buckets.missing_capability
        ].slice(0, 5)
    };

    logEvidenceStats('classifyRoleFitEvidence', result);
    return result;
}

function normalizeUserSkills(userSkills) {
    return userSkills
        .map(skill => {
            if (typeof skill === 'string') return skill.trim();
            return skill?.name?.trim();
        })
        .filter(Boolean);
}

function formatUserExperience(userExperience) {
    const totalYears = userExperience.totalYears ?? 'not specified';
    const level = userExperience.level ?? 'not specified';
    const experience = Array.isArray(userExperience.experience)
        ? userExperience.experience
            .map(exp => `${exp.role || 'Unknown role'} at ${exp.company || 'Unknown company'} (${exp.years || 0} years, ${exp.level || 'not specified'} level)`)
            .join('; ')
        : 'No role details provided';

    return `${totalYears} total years; stated level: ${level}; roles: ${experience}`;
}

function formatRequiredExperience(requiredExperience = {}) {
    return `${requiredExperience.years || 0} years required; level: ${requiredExperience.level || 'not specified'}`;
}

function calculateWeightedScore(classifications) {
    if (!classifications.length) return 0;

    const total = classifications.reduce((sum, item) => {
        return sum + (EVIDENCE_WEIGHTS[item.evidenceType] ?? 0);
    }, 0);

    return (total / classifications.length) * 100;
}

function groupByEvidenceType(classifications) {
    return {
        direct_evidence: classifications.filter(item => item.evidenceType === 'direct_evidence'),
        adjacent_evidence: classifications.filter(item => item.evidenceType === 'adjacent_evidence'),
        implied_founder_operator: classifications.filter(item => item.evidenceType === 'implied_founder_operator'),
        missing_proof: classifications.filter(item => item.evidenceType === 'missing_proof'),
        missing_capability: classifications.filter(item => item.evidenceType === 'missing_capability')
    };
}

function enforceEvidenceRules(item, normalizedUserSkills) {
    const cleaned = {
        jobSkill: item.jobSkill || 'Unknown skill',
        skillType: item.skillType === 'preferred' ? 'preferred' : 'required',
        evidenceType: normalizeEvidenceType(item.evidenceType),
        matchedUserSkill: item.matchedUserSkill || '',
        reasoning: item.reasoning || ''
    };

    const jobSkillNorm = normalize(cleaned.jobSkill);
    const matchedSkillNorm = normalize(cleaned.matchedUserSkill);
    const userSkillNorms = normalizedUserSkills.map(normalize);

    const requiresExactProof = EXACT_PROOF_SKILLS.some(exactSkill =>
        jobSkillNorm.includes(normalize(exactSkill)) || normalize(exactSkill).includes(jobSkillNorm)
    );

    const hasExplicitUserSkill = userSkillNorms.some(userSkill =>
        userSkill === jobSkillNorm ||
        userSkill.includes(jobSkillNorm) ||
        jobSkillNorm.includes(userSkill)
    );

    const matchedSkillIsExplicit = matchedSkillNorm
        ? userSkillNorms.some(userSkill =>
            userSkill === matchedSkillNorm ||
            userSkill.includes(matchedSkillNorm) ||
            matchedSkillNorm.includes(userSkill)
        )
        : false;

    if (requiresExactProof && cleaned.evidenceType === 'direct_evidence' && !hasExplicitUserSkill) {
        return {
            ...cleaned,
            evidenceType: matchedSkillIsExplicit ? 'missing_proof' : 'missing_capability',
            reasoning: `${cleaned.reasoning} Hard gate applied: this requirement needs explicit same-context proof, not adjacent experience.`
        };
    }

    return cleaned;
}

function normalizeEvidenceType(evidenceType) {
    const allowed = [
        'direct_evidence',
        'adjacent_evidence',
        'implied_founder_operator',
        'missing_proof',
        'missing_capability'
    ];

    return allowed.includes(evidenceType) ? evidenceType : 'missing_proof';
}

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}