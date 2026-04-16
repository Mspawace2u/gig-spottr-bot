import { extractCvSkills } from '../translator/extract-cv-skills.js';
import { extractCvExperience } from '../translator/extract-cv-experience.js';
import { extractJobRequirements } from '../translator/extract-job-requirements.js';
import { semanticSkillsMatch } from '../analyst/semantic-skills-match.js';
import { calculateExperienceMatch } from '../analyst/calculate-experience-match.js';
import { generateStrengthsWeaknesses } from '../creator/generate-strengths-weaknesses.js';
import { validateExtraction } from '../manager/validate-extraction.js';
import { spottrConfig } from '../../config/spottr.js';
import { saveUserCvToNotion, saveFitReportToNotion, saveJobToNotion } from '../courier/save-to-notion.js';

/**
 * STRATEGIST AGENT - Orchestrates the Spottr Bot workflow
 * 
 * This is the "boss" that decides which agents to hire and in what order.
 * 
 * Workflow:
 * 1. MODULE 1: Onboard user (extract CV data)
 * 2. MODULE 3: Analyze job fit (extract requirements, calculate scores)
 * 3. MODULE 5: Generate HITL report (strengths/weaknesses, recommendation)
 */

// ============================================
// MODULE 1: ONBOARD USER
// ============================================

export async function onboardUser(email, cvText) {
    console.log('🎯 MODULE 1: Onboarding user...');

    try {
        // Step 1: Translator extracts skills
        console.log('  → Translator: Extracting skills...');
        const skills = await extractCvSkills(cvText);

        // Step 2: Manager validates skills
        console.log('  → Manager: Validating skills...');
        const skillsValidation = validateExtraction(skills, cvText, 'skills');

        if (!skillsValidation.valid) {
            throw new Error(`Skills validation failed: ${skillsValidation.errors.join(', ')}`);
        }

        if (skillsValidation.warnings.length > 0) {
            console.warn('  ⚠️ Warnings:', skillsValidation.warnings);
        }

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
            console.warn('  ⚠️ Warnings:', experienceValidation.warnings);
        }

        // Step 5: Courier saves to Notion
        console.log('  → Courier: Saving to Notion...');
        const cvData = {
            original: cvText,
            skills: skills,
            experience: experienceData.experience,
            totalYears: experienceData.totalYears
        };

        await saveUserCvToNotion(email, cvData);

        console.log('✅ MODULE 1 COMPLETE: User onboarded');

        return {
            success: true,
            skills: skills,
            experience: experienceData,
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

        // Step 2: Analyst calculates skills match (deterministic)
        console.log('  → Analyst: Calculating skills match...');
        const skillsMatch = await semanticSkillsMatch(
            userData.skills,
            jobRequirements.requiredSkills,
            jobRequirements.preferredSkills
        );

        // Step 3: Analyst calculates experience match (deterministic)
        console.log('  → Analyst: Calculating experience match...');
        const experienceMatch = calculateExperienceMatch(
            {
                totalYears: userData.totalYears,
                experience: userData.experience,
                level: userData.experience[0]?.level || 'not specified'
            },
            jobRequirements.requiredExperience
        );

        // Step 4: Strategist decides recommendation
        console.log('  → Strategist: Making recommendation...');
        const recommendation = makeRecommendation(skillsMatch.score, experienceMatch.score);

        // Step 5: Creator generates strengths/weaknesses explanation
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
                level: userData.experience[0]?.level || 'not specified'
            },
            jobExperience: jobRequirements.requiredExperience
        });

        // Step 6: Courier saves fit report to Notion
        console.log('  → Courier: Saving fit report...');
        const fitReport = await saveFitReportToNotion({
            userEmail: email,
            jobTitle: jobRequirements.jobTitle || 'Unknown Job Title',
            company: jobRequirements.company || 'Unknown Company',
            jobUrl: jobUrl,
            skillsMatchPercent: skillsMatch.score,
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
            skillsMatch: skillsMatch,
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
    } else {
        return "Don't Apply";
    }
}
