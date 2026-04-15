import { Client } from '@notionhq/client';
import { notionConfig, getNotionProperty, formatNotionProperty } from '../config/notion.js';

// Initialize Notion client
const notion = new Client({
    auth: import.meta.env.NOTION_API_KEY
});

// ============================================
// USERS DATABASE
// ============================================

export async function saveUserCv(email, cvData) {
    try {
        const response = await notion.pages.create({
            parent: { database_id: notionConfig.databases.users },
            properties: {
                email: formatNotionProperty('title', email),
                cv_original: formatNotionProperty('rich_text', cvData.original),
                skills: formatNotionProperty('rich_text', JSON.stringify(cvData.skills)),
                experience: formatNotionProperty('rich_text', JSON.stringify(cvData.experience)),
                created_at: formatNotionProperty('date', new Date().toISOString()),
                updated_at: formatNotionProperty('date', new Date().toISOString())
            }
        });
        return response;
    } catch (error) {
        console.error('Error saving user CV to Notion:', error);
        throw error;
    }
}

export async function getUserCv(email) {
    try {
        const response = await notion.databases.query({
            database_id: notionConfig.databases.users,
            filter: {
                property: 'email',
                title: {
                    equals: email
                }
            }
        });

        if (response.results.length === 0) {
            return null;
        }

        const page = response.results[0];
        return {
            original: getNotionProperty(page, 'cv_original'),
            skills: JSON.parse(getNotionProperty(page, 'skills') || '[]'),
            experience: JSON.parse(getNotionProperty(page, 'experience') || '[]')
        };
    } catch (error) {
        console.error('Error getting user CV from Notion:', error);
        throw error;
    }
}

// ============================================
// JOBS DATABASE
// ============================================

export async function saveJob(jobData) {
    try {
        const response = await notion.pages.create({
            parent: { database_id: notionConfig.databases.jobs },
            properties: {
                job_title: formatNotionProperty('title', jobData.title),
                job_url: formatNotionProperty('url', jobData.url),
                company: formatNotionProperty('rich_text', jobData.company || ''),
                job_description: formatNotionProperty('rich_text', jobData.description),
                required_skills: formatNotionProperty('rich_text', JSON.stringify(jobData.requiredSkills || [])),
                preferred_skills: formatNotionProperty('rich_text', JSON.stringify(jobData.preferredSkills || [])),
                required_experience: formatNotionProperty('rich_text', JSON.stringify(jobData.requiredExperience || {})),
                scraped_at: formatNotionProperty('date', new Date().toISOString())
            }
        });
        return response;
    } catch (error) {
        console.error('Error saving job to Notion:', error);
        throw error;
    }
}

export async function getJob(jobUrl) {
    try {
        const response = await notion.databases.query({
            database_id: notionConfig.databases.jobs,
            filter: {
                property: 'job_url',
                url: {
                    equals: jobUrl
                }
            }
        });

        if (response.results.length === 0) {
            return null;
        }

        const page = response.results[0];
        return {
            title: getNotionProperty(page, 'job_title'),
            url: getNotionProperty(page, 'job_url'),
            company: getNotionProperty(page, 'company'),
            description: getNotionProperty(page, 'job_description'),
            requiredSkills: JSON.parse(getNotionProperty(page, 'required_skills') || '[]'),
            preferredSkills: JSON.parse(getNotionProperty(page, 'preferred_skills') || '[]'),
            requiredExperience: JSON.parse(getNotionProperty(page, 'required_experience') || '{}')
        };
    } catch (error) {
        console.error('Error getting job from Notion:', error);
        throw error;
    }
}

// ============================================
// FIT REPORTS DATABASE
// ============================================

export async function saveFitReport(reportData) {
    const props = {
        job_title: formatNotionProperty('title', reportData.jobTitle),
        user_email: formatNotionProperty('rich_text', reportData.userEmail),
        job_url: formatNotionProperty('url', reportData.jobUrl),
        skills_match_percent: formatNotionProperty('number', reportData.skillsMatchPercent),
        experience_match_percent: formatNotionProperty('number', reportData.experienceMatchPercent),
        strengths: formatNotionProperty('rich_text', JSON.stringify(reportData.strengths)),
        weaknesses: formatNotionProperty('rich_text', JSON.stringify(reportData.weaknesses)),
        recommendation: formatNotionProperty('select', reportData.recommendation),
        company: formatNotionProperty('rich_text', reportData.company || ''),
        user_decision: formatNotionProperty('select', 'Pending'),
        created_at: formatNotionProperty('date', new Date().toISOString())
    };

    try {
        const response = await notion.pages.create({
            parent: { database_id: notionConfig.databases.fitReports },
            properties: props
        });
        return response;
    } catch (error) {
        // Graceful handling for missing 'company' property in Notion schema
        if (error.code === 'validation_error' && error.message.includes('company')) {
            console.warn('⚠️  Notion Schema Mismatch: "company" property not found. Retrying without it...');
            delete props.company;
            return await notion.pages.create({
                parent: { database_id: notionConfig.databases.fitReports },
                properties: props
            });
        }
        
        console.error('Error saving fit report to Notion:', error);
        throw error;
    }
}

export async function updateUserDecision(reportId, decision) {
    try {
        const response = await notion.pages.update({
            page_id: reportId,
            properties: {
                user_decision: formatNotionProperty('select', decision)
            }
        });
        return response;
    } catch (error) {
        console.error('Error updating user decision in Notion:', error);
        throw error;
    }
}

export async function getFitReports(userEmail) {
    try {
        const response = await notion.databases.query({
            database_id: notionConfig.databases.fitReports,
            filter: {
                property: 'user_email',
                rich_text: {
                    equals: userEmail
                }
            },
            sorts: [
                {
                    property: 'created_at',
                    direction: 'descending'
                }
            ]
        });

        const reports = response.results.map(page => ({
            id: page.id,
            jobTitle: getNotionProperty(page, 'job_title'),
            jobUrl: getNotionProperty(page, 'job_url'),
            skillsMatchPercent: getNotionProperty(page, 'skills_match_percent'),
            experienceMatchPercent: getNotionProperty(page, 'experience_match_percent'),
            strengths: JSON.parse(getNotionProperty(page, 'strengths') || '[]'),
            weaknesses: JSON.parse(getNotionProperty(page, 'weaknesses') || '[]'),
            recommendation: getNotionProperty(page, 'recommendation'),
            userDecision: getNotionProperty(page, 'user_decision'),
            company: getNotionProperty(page, 'company'),
            createdAt: getNotionProperty(page, 'created_at')
        }));

        // DATABASE JOIN: Enrich with company names from the JOBS database if missing
        const missingCompanies = reports.filter(r => !r.company || ['UNKNOWN', 'Unknown', 'Unknown Company'].includes(r.company));
        
        if (missingCompanies.length > 0) {
            const uniqueUrls = [...new Set(missingCompanies.map(r => r.jobUrl).filter(Boolean))];
            
            if (uniqueUrls.length > 0) {
                // Batch lookup in Jobs database (max 100 OR filters in Notion)
                const jobLookupResponse = await notion.databases.query({
                    database_id: notionConfig.databases.jobs,
                    filter: {
                        or: uniqueUrls.map(url => ({
                            property: 'job_url',
                            url: { equals: url }
                        }))
                    }
                });

                // Create a mapping of URL -> Company
                const companyMap = {};
                jobLookupResponse.results.forEach(page => {
                    const url = getNotionProperty(page, 'job_url');
                    const companyName = getNotionProperty(page, 'company');
                    if (url && companyName) companyMap[url] = companyName;
                });

                // Apply the mapping to the reports
                reports.forEach(report => {
                    if ((!report.company || ['UNKNOWN', 'Unknown', 'Unknown Company'].includes(report.company)) && companyMap[report.jobUrl]) {
                        report.company = companyMap[report.jobUrl];
                    }
                });
            }
        }

        return reports;
    } catch (error) {
        console.error('Error getting fit reports from Notion:', error);
        throw error;
    }
}

