import { extractCvSkills } from '../translator/extract-cv-skills.js';
import { extractCvExperience } from '../translator/extract-cv-experience.js';
import { extractJobRequirements } from '../translator/extract-job-requirements.js';
import { semanticSkillsMatch } from '../analyst/semantic-skills-match.js';
import { calculateExperienceMatch } from '../analyst/calculate-experience-match.js';
import { classifyRoleFitEvidence } from '../analyst/classify-role-fit-evidence.js';
import { generateStrengthsWeaknesses } from '../creator/generate-strengths-weaknesses.js';
import { validateExtraction } from '../manager/validate-extraction.js';
import { spottrConfig } from '../../config/spottr.js';
import { saveUserCvToNotion, saveFitReportToNotion, saveJobToNotion } from '../courier/save-to-notion.js';

/**
 * STRATEGIST AGENT - Orchestrates the Spottr Bot workflow
 *
 * Workflow:
 * 1. MODULE 1: Onboard user / extract CV data
 * 2. MODULE 3: Analyze job fit / extract job requirements + score fit
 * 3. MODULE 5: Generate HITL report / strengths, weaknesses, recommendation
 */

// ============================================
// MODULE 1: ONBOARD USER
// ============================================

export async function onboardUser(email, cvText) {
    console.log('🎯 MODULE 1: Onboarding user...');

    try {
        // Step 1: Translator extracts skills
        console.log('  → Translator: Extracting skills...');
        const extractedSkills = await extractCvSkills(cvText);



        // Step 2: Manager validates skills
        console.log('  → Manager: Validating skills...');
        const skillsValidation = validateExtraction(extractedSkills, cvText, 'skills');

        if (!skillsValidation.valid) {
            throw new Error(`Skills validation failed: ${skillsValidation.errors.join(', ')}`);
        }

        if (skillsValidation.warnings.length > 0) {
            console.warn(`  ⚠️ Skills validation warnings: ${skillsValidation.warnings.length}`);
        }

        const validatedSkills = skillsValidation.filteredData?.length
            ? skillsValidation.filteredData
            : extractedSkills;



        // Step 3: Translator extracts experience
        console.log('  → Translator: Extracting experience...');
        const experienceData = await extractCvExperience(cvText);

        // Step 4: Manager validates experience
        console.log('  → Manager: Validating experience...');
        const experienceValidation = validateExtraction(experienceData, cvText, 'experience');

        if (!experienceValidation.valid) {
            throw new Error(`Experience validation failed: ${experienceValidation.errors.join(', ')}`);
        }

        if (experienceValidation.warnings.length > 0) {
            console.warn(`  ⚠️ Experience validation warnings: ${experienceValidation.warnings.length}`);
        }

        const validatedExperienceData = experienceValidation.filteredData || experienceData;

        // Step 5: Courier saves to Notion
        console.log('  → Courier: Saving to Notion...');
        const cvData = {
            original: cvText,
            skills: validatedSkills,
            experience: validatedExperienceData.experience,
            totalYears: validatedExperienceData.totalYears
        };

        await saveUserCvToNotion(email, cvData);

        console.log('✅ MODULE 1 COMPLETE: User onboarded');

        return {
            success: true,
            skills: validatedSkills,
            experience: validatedExperienceData,
            validationWarnings: [
                ...skillsValidation.warnings,
                ...experienceValidation.warnings
            ]
        };

    } catch (error) {
        console.error('❌ MODULE 1 FAILED:', error);
        throw error;
    }
}

// ============================================
// MODULE 3: ANALYZE JOB FIT
// ============================================

export async function analyzeJobFit(email, jobText, jobUrl, userData, titleHint = '') {
    console.log('🎯 MODULE 3: Analyzing job fit...');

    try {
        // Step 1: Translator extracts job requirements
        console.log('  → Translator: Extracting job requirements...');
        const jobRequirements = await extractJobRequirements(jobText, jobUrl, titleHint);

        // Step 1.5: Courier saves job to Notion
        console.log('  → Courier: Saving job to Notion...');
        await saveJobToNotion({
            title: jobRequirements.jobTitle || 'Unknown Job Title',
            url: jobUrl,
            company: jobRequirements.company || 'Unknown Company',
            description: jobText,
            requiredSkills: jobRequirements.requiredSkills,
            preferredSkills: jobRequirements.preferredSkills,
            requiredExperience: jobRequirements.requiredExperience
        });

        // Step 2: Analyst calculates semantic skills match
        console.log('  → Analyst: Calculating skills match...');
        const skillsMatch = await semanticSkillsMatch(
            userData.skills,
            jobRequirements.requiredSkills,
            jobRequirements.preferredSkills
        );

        // Step 3: Analyst calculates experience match
        console.log('  → Analyst: Calculating experience match...');
        const experienceMatch = calculateExperienceMatch(
            {
                totalYears: userData.totalYears,
                experience: userData.experience,
                level: userData.experience?.[0]?.level || 'not specified'
            },
            jobRequirements.requiredExperience
        );

        // Step 4: Analyst classifies evidence quality
        console.log('  → Analyst: Classifying role-fit evidence...');
        const evidenceClassification = await classifyRoleFitEvidence({
            userSkills: userData.skills,
            userExperience: {
                totalYears: userData.totalYears,
                experience: userData.experience,
                level: userData.experience?.[0]?.level || 'not specified'
            },
            jobRequirements,
            skillsMatch,
            experienceMatch
        });

        const adjustedScore = calculateAdjustedFitScore(skillsMatch.score, evidenceClassification);

        const adjustedSkillsMatch = {
            ...skillsMatch,
            score: adjustedScore,
            rawSemanticScore: skillsMatch.score,
            evidenceScore: evidenceClassification.score,
            evidenceClassification
        };

        const overallFitScore = calculateOverallFitScore({
            rawSkillsScore: skillsMatch.score,
            evidenceScore: evidenceClassification.score,
            experienceScore: experienceMatch.score
        });



        // Step 5: Strategist decides recommendation
        console.log('  → Strategist: Making recommendation...');
        const recommendation = makeRecommendation(adjustedSkillsMatch.score, experienceMatch.score);

        // Step 6: Creator generates strengths/weaknesses explanation
        console.log('  → Creator: Generating explanation...');
        const explanation = await generateStrengthsWeaknesses({
            matchedSkills: [
                ...skillsMatch.matchedRequiredSkills,
                ...skillsMatch.matchedPreferredSkills
            ],
            missingSkills: [
                ...skillsMatch.missingRequiredSkills,
                ...skillsMatch.missingPreferredSkills
            ],
            userExperience: {
                totalYears: userData.totalYears,
                level: userData.experience?.[0]?.level || 'not specified'
            },
            jobExperience: jobRequirements.requiredExperience,
            evidenceClassification
        });

        // Step 7: Courier saves fit report to Notion
        console.log('  → Courier: Saving fit report...');
        const fitReport = await saveFitReportToNotion({
            userEmail: email,
            jobTitle: jobRequirements.jobTitle || 'Unknown Job Title',
            company: jobRequirements.company || 'Unknown Company',
            jobUrl: jobUrl,

            overallFitScore: overallFitScore,
            skillsMatchPercent: adjustedSkillsMatch.score,
            rawSkillsMatchPercent: skillsMatch.score,
            evidenceMatchPercent: evidenceClassification.score,
            experienceMatchPercent: experienceMatch.score,

            strengths: explanation.strengths,
            weaknesses: explanation.weaknesses,
            recommendation: recommendation,
            userDecision: recommendation === 'Apply' ? 'Is Fit' : 'Not Fit'
        });

        console.log('✅ MODULE 3 COMPLETE: Job analyzed');

        return {
            success: true,
            reportId: fitReport.pageId,
            overallFitScore: overallFitScore,
            skillsMatch: adjustedSkillsMatch,
            rawSkillsMatchPercent: skillsMatch.score,
            evidenceMatchPercent: evidenceClassification.score,
            experienceMatch: experienceMatch,
            recommendation: recommendation,
            strengths: explanation.strengths,
            weaknesses: explanation.weaknesses
        };

    } catch (error) {
        console.error('❌ MODULE 3 FAILED:', error);
        throw error;
    }
}

// ============================================
// HELPER: Make recommendation based on thresholds
// ============================================

function makeRecommendation(skillsScore, experienceScore) {
    const { skillsMatch, experienceMatch } = spottrConfig.thresholds;

    if (skillsScore >= skillsMatch && experienceScore >= experienceMatch) {
        return 'Apply';
    }

    return "Don't Apply";
}

function calculateAdjustedFitScore(rawSkillsScore, evidenceClassification) {
    const evidenceScore = evidenceClassification?.score ?? rawSkillsScore;

    const biggestProofGaps = evidenceClassification?.biggestProofGaps || [];

    const missingCapabilityCount = biggestProofGaps.filter(
        gap => gap.evidenceType === 'missing_capability'
    ).length;

    const missingProofCount = biggestProofGaps.filter(
        gap => gap.evidenceType === 'missing_proof'
    ).length;

    // Start from semantic role match, then use evidence quality as a correction.
    // Do not let proof strictness nuke a strong adjacent/operator fit.
    let adjusted = Math.round((rawSkillsScore * 0.75) + (evidenceScore * 0.25));

    // Apply light penalties only for the biggest gaps.
    adjusted -= missingCapabilityCount * 3;
    adjusted -= missingProofCount * 1;

    return Math.max(0, Math.min(100, adjusted));
}

function calculateOverallFitScore({ rawSkillsScore, evidenceScore, experienceScore }) {
    return Math.round(
        (rawSkillsScore * 0.50) +
        (evidenceScore * 0.15) +
        (experienceScore * 0.35)
    );
}