/**
 * ANALYST AGENT - Skill: Calculate Experience Match
 * 
 * Input: User's experience data, Job's required experience
 * Output: Match percentage + comparison details
 * Hallucination risk: ZERO (pure JavaScript logic, no LLM)
 */

export function calculateExperienceMatch(userExperience, requiredExperience) {
    // Handle missing data
    if (!userExperience || !requiredExperience) {
        return {
            score: 0,
            userYears: 0,
            requiredYears: 0,
            userLevel: 'not specified',
            requiredLevel: 'not specified',
            meetsYearsRequirement: false,
            meetsLevelRequirement: false
        };
    }

    const userYears = userExperience.totalYears || 0;
    const requiredYears = requiredExperience.years || 0;
    const userLevel = determineHighestLevel(userExperience.experience || []);
    const requiredLevel = requiredExperience.level || 'not specified';

    // Check if user meets years requirement
    const meetsYearsRequirement = userYears >= requiredYears;

    // Check if user meets level requirement
    const meetsLevelRequirement = compareLevels(userLevel, requiredLevel);

    // Calculate score
    let score = 0;

    // Years component (60% of score)
    if (meetsYearsRequirement) {
        score += 60;
    } else if (userYears > 0) {
        // Partial credit if they have some experience
        const yearsRatio = userYears / requiredYears;
        score += Math.min(60, yearsRatio * 60);
    }

    // Level component (40% of score)
    if (meetsLevelRequirement) {
        score += 40;
    } else {
        // Partial credit based on how close they are
        const levelGap = getLevelGap(userLevel, requiredLevel);
        if (levelGap === 1) {
            score += 20; // One level below
        } else if (levelGap === 2) {
            score += 10; // Two levels below
        }
    }

    return {
        score: Math.round(score),
        userYears: userYears,
        requiredYears: requiredYears,
        userLevel: userLevel,
        requiredLevel: requiredLevel,
        meetsYearsRequirement: meetsYearsRequirement,
        meetsLevelRequirement: meetsLevelRequirement
    };
}

/**
 * Helper: Determine the highest experience level from user's work history
 */
function determineHighestLevel(experienceArray) {
    const levels = ['junior', 'mid', 'senior', 'lead', 'principal'];
    let highestLevel = 'junior';
    let highestIndex = 0;

    experienceArray.forEach(exp => {
        const level = (exp.level || 'junior').toLowerCase();
        const index = levels.indexOf(level);
        if (index > highestIndex) {
            highestIndex = index;
            highestLevel = level;
        }
    });

    return highestLevel;
}

/**
 * Helper: Compare if user's level meets or exceeds required level
 */
function compareLevels(userLevel, requiredLevel) {
    const levels = ['junior', 'mid', 'senior', 'lead', 'principal'];

    const userIndex = levels.indexOf(userLevel.toLowerCase());
    const requiredIndex = levels.indexOf(requiredLevel.toLowerCase());

    // If either level is not in our list, we can't compare
    if (userIndex === -1 || requiredIndex === -1) {
        return false;
    }

    return userIndex >= requiredIndex;
}

/**
 * Helper: Calculate how many levels below the user is
 */
function getLevelGap(userLevel, requiredLevel) {
    const levels = ['junior', 'mid', 'senior', 'lead', 'principal'];

    const userIndex = levels.indexOf(userLevel.toLowerCase());
    const requiredIndex = levels.indexOf(requiredLevel.toLowerCase());

    if (userIndex === -1 || requiredIndex === -1) {
        return 999; // Unknown gap
    }

    return requiredIndex - userIndex;
}
