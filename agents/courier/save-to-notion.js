import { saveUserCv, saveJob, saveFitReport } from '../../lib/notion-client.js';

/**
 * COURIER AGENT - Skill: Save to Notion
 * 
 * Input: Data to save (user CV, job, or fit report)
 * Output: Notion page ID
 * Hallucination risk: ZERO (deterministic database write)
 */

export async function saveUserCvToNotion(email, cvData) {
    try {
        const response = await saveUserCv(email, cvData);
        return {
            success: true,
            pageId: response.id,
            message: 'CV saved successfully'
        };
    } catch (error) {
        console.error('Error saving CV to Notion:', error);
        throw new Error(`Failed to save CV: ${error.message}`);
    }
}

export async function saveJobToNotion(jobData) {
    try {
        const response = await saveJob(jobData);
        return {
            success: true,
            pageId: response.id,
            message: 'Job saved successfully'
        };
    } catch (error) {
        console.error('Error saving job to Notion:', error);
        throw new Error(`Failed to save job: ${error.message}`);
    }
}

export async function saveFitReportToNotion(reportData) {
    try {
        const response = await saveFitReport(reportData);
        return {
            success: true,
            pageId: response.id,
            message: 'Fit report saved successfully'
        };
    } catch (error) {
        console.error('Error saving fit report to Notion:', error);
        throw new Error(`Failed to save fit report: ${error.message}`);
    }
}
