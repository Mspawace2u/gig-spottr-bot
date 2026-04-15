/**
 * ANALYST AGENT - Skill: Calculate Skills Match
 * 
 * Input: User's skills array, Job's required/preferred skills
 * Output: Match percentage + matched/missing skills
 * Hallucination risk: ZERO (pure JavaScript logic, no LLM)
 */

export function calculateSkillsMatch(userSkills, requiredSkills, preferredSkills = []) {
    // Normalize skill names for comparison (lowercase, trim whitespace)
    const normalizeSkill = (skill) => {
        if (typeof skill === 'string') {
            return skill.toLowerCase().trim();
        }
        return skill.name.toLowerCase().trim();
    };

    const userSkillNames = userSkills.map(normalizeSkill);
    const normalizedRequired = requiredSkills.map(normalizeSkill);
    const normalizedPreferred = preferredSkills.map(normalizeSkill);

    // Count matches for required skills
    let matchedRequired = 0;
    const matchedRequiredSkills = [];
    const missingRequiredSkills = [];

    normalizedRequired.forEach(reqSkill => {
        // Check for exact match OR partial match
        const isMatch = userSkillNames.some(userSkill =>
            userSkill.includes(reqSkill) || reqSkill.includes(userSkill)
        );

        if (isMatch) {
            matchedRequired++;
            matchedRequiredSkills.push(reqSkill);
        } else {
            missingRequiredSkills.push(reqSkill);
        }
    });

    // Count matches for preferred skills
    let matchedPreferred = 0;
    const matchedPreferredSkills = [];
    const missingPreferredSkills = [];

    normalizedPreferred.forEach(prefSkill => {
        if (userSkillNames.includes(prefSkill)) {
            matchedPreferred++;
            matchedPreferredSkills.push(prefSkill);
        } else {
            missingPreferredSkills.push(prefSkill);
        }
    });

    // Calculate percentages
    const requiredScore = normalizedRequired.length > 0
        ? (matchedRequired / normalizedRequired.length) * 100
        : 0;

    const preferredScore = normalizedPreferred.length > 0
        ? (matchedPreferred / normalizedPreferred.length) * 100
        : 0;

    // Weight required skills more heavily (70% required, 30% preferred)
    const finalScore = normalizedPreferred.length > 0
        ? (requiredScore * 0.7) + (preferredScore * 0.3)
        : requiredScore;

    return {
        score: Math.round(finalScore),
        matchedRequired: matchedRequired,
        totalRequired: normalizedRequired.length,
        matchedPreferred: matchedPreferred,
        totalPreferred: normalizedPreferred.length,
        matchedRequiredSkills: matchedRequiredSkills,
        missingRequiredSkills: missingRequiredSkills,
        matchedPreferredSkills: matchedPreferredSkills,
        missingPreferredSkills: missingPreferredSkills
    };
}
