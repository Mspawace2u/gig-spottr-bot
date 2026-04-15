/**
 * MANAGER AGENT - Skill: Validate Extraction
 * 
 * Input: Extracted data + original source text
 * Output: Validation result (pass/fail + warnings)
 * Hallucination risk: ZERO (deterministic validation logic)
 */

export function validateExtraction(extractedData, sourceText, type = 'skills') {
    const warnings = [];
    const errors = [];

    if (type === 'skills') {
        return validateSkillsExtraction(extractedData, sourceText, warnings, errors);
    } else if (type === 'experience') {
        return validateExperienceExtraction(extractedData, sourceText, warnings, errors);
    } else {
        throw new Error(`Unknown validation type: ${type}`);
    }
}

/**
 * Validate skills extraction
 */
function validateSkillsExtraction(skills, sourceText, warnings, errors) {
    if (!Array.isArray(skills)) {
        errors.push('Skills data is not an array');
        return { valid: false, warnings, errors };
    }

    if (skills.length === 0) {
        warnings.push('No skills extracted - CV might be empty or poorly formatted');
    }

    // Check each skill
    skills.forEach((skill, index) => {
        // Check for required fields
        if (!skill.name) {
            errors.push(`Skill at index ${index} is missing name`);
        }

        // Check if skill appears in source text using FUZZY matching
        if (skill.name && !isFuzzyMatch(skill.name, sourceText)) {
            warnings.push(`Skill "${skill.name}" not found in source text (possible hallucination)`);
        }

        // Check for suspicious patterns (common hallucinations)
        if (skill.name && skill.name.length < 2) {
            warnings.push(`Skill "${skill.name}" is suspiciously short`);
        }

        if (skill.years && skill.years > 50) {
            warnings.push(`Skill "${skill.name}" has ${skill.years} years (seems unrealistic)`);
        }
    });

    return {
        valid: errors.length === 0,
        warnings: warnings,
        errors: errors,
        extractedCount: skills.length
    };
}

/**
 * Validate experience extraction
 */
function validateExperienceExtraction(experienceData, sourceText, warnings, errors) {
    if (!experienceData.experience || !Array.isArray(experienceData.experience)) {
        errors.push('Experience data is not an array');
        return { valid: false, warnings, errors };
    }

    if (experienceData.experience.length === 0) {
        warnings.push('No experience extracted - CV might be empty or poorly formatted');
    }

    // Check total years
    if (experienceData.totalYears && experienceData.totalYears > 50) {
        warnings.push(`Total years (${experienceData.totalYears}) seems unrealistic`);
    }

    // Check each experience entry
    experienceData.experience.forEach((exp, index) => {
        // Check for required fields
        if (!exp.role) {
            errors.push(`Experience at index ${index} is missing role`);
        }

        // Check if role appears in source text using FUZZY matching
        if (exp.role && !isFuzzyMatch(exp.role, sourceText)) {
            warnings.push(`Role "${exp.role}" not found in source text (possible hallucination)`);
        }

        // Check for suspicious patterns
        if (exp.years && exp.years > 30) {
            warnings.push(`Role "${exp.role}" has ${exp.years} years (seems unrealistic for one position)`);
        }

        // Validate level
        const validLevels = ['junior', 'mid', 'senior', 'lead', 'principal', 'not specified'];
        if (exp.level && !validLevels.includes(exp.level.toLowerCase())) {
            warnings.push(`Role "${exp.role}" has invalid level: ${exp.level}`);
        }
    });

    return {
        valid: errors.length === 0,
        warnings: warnings,
        errors: errors,
        extractedCount: experienceData.experience.length
    };
}

/**
 * Helper: Fuzzy Match
 * Cleans both strings of non-alphanumeric chars and extra whitespace before comparison.
 */
function isFuzzyMatch(target, source) {
    if (!target || !source) return false;
    
    const normalize = (str) => str
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric characters
        .replace(/\s+/g, '');      // Remove all whitespace
        
    const normalizedTarget = normalize(target);
    const normalizedSource = normalize(source);
    
    return normalizedSource.includes(normalizedTarget);
}
