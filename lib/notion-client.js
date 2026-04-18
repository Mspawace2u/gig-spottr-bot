import { Client } from '@notionhq/client';
import { notionConfig, getNotionProperty, formatNotionProperty } from '../config/notion.js';

// Initialize Notion client. trim() defends against trailing whitespace/newlines
// sneaking in via copy-paste when the env var is set in hosting UIs — Notion's
// SDK passes the value straight into an HTTP header, which rejects \n/CR as
// illegal header values (TypeError: "Bearer <key>\n" is not a legal HTTP header value).
const notion = new Client({
    auth: (import.meta.env.NOTION_API_KEY || '').trim()
});

// Parse a Notion validation error like `company is not a property that exists.`
// and return the property name. Returns null if the shape doesn't match.
function getMissingPropertyName(error) {
    if (!error || error.code !== 'validation_error' || typeof error.message !== 'string') return null;
    // Notion's error message may be prefixed (e.g. "body failed validation:
    // body.properties.company is not a property that exists."), so use a
    // word-boundary rather than a start anchor.
    const m = error.message.match(/\b(\w+) is not a property that exists/);
    return m ? m[1] : null;
}

// Create a Notion page with retry-on-schema-drift. If the Notion DB is missing
// a property the code is trying to write (common when the code-side schema
// drifts ahead of a user-managed DB), strip the missing prop and try again.
// Repeats up to `maxRetries` times so multiple drifted props resolve in one call.
async function createPageWithSchemaRetry(parent, properties, label, maxRetries = 5) {
    const props = { ...properties };
    const stripped = [];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await notion.pages.create({ parent, properties: props });
        } catch (error) {
            const missing = getMissingPropertyName(error);
            if (missing && props[missing] !== undefined) {
                stripped.push(missing);
                delete props[missing];
                console.warn(`⚠️  ${label}: Notion DB missing "${missing}" property; retrying without it. Add the property to stop seeing this. (so far stripped: ${stripped.join(', ')})`);
                continue;
            }
            throw error;
        }
    }
    throw new Error(`${label}: exceeded max schema-drift retries (${maxRetries}); stripped so far: ${stripped.join(', ')}`);
}

// ============================================
// USERS DATABASE
// ============================================

export async function saveUserCv(email, cvData) {
    try {
        return await createPageWithSchemaRetry(
            { database_id: notionConfig.databases.users },
            {
                email: formatNotionProperty('title', email),
                cv_original: formatNotionProperty('rich_text', cvData.original),
                skills: formatNotionProperty('rich_text', JSON.stringify(cvData.skills)),
                experience: formatNotionProperty('rich_text', JSON.stringify(cvData.experience)),
                created_at: formatNotionProperty('date', new Date().toISOString()),
                updated_at: formatNotionProperty('date', new Date().toISOString())
            },
            'saveUserCv'
        );
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
        return await createPageWithSchemaRetry(
            { database_id: notionConfig.databases.jobs },
            {
                job_title: formatNotionProperty('title', jobData.title),
                job_url: formatNotionProperty('url', jobData.url),
                company: formatNotionProperty('rich_text', jobData.company || ''),
                job_description: formatNotionProperty('rich_text', jobData.description),
                required_skills: formatNotionProperty('rich_text', JSON.stringify(jobData.requiredSkills || [])),
                preferred_skills: formatNotionProperty('rich_text', JSON.stringify(jobData.preferredSkills || [])),
                required_experience: formatNotionProperty('rich_text', JSON.stringify(jobData.requiredExperience || {})),
                scraped_at: formatNotionProperty('date', new Date().toISOString())
            },
            'saveJob'
        );
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
    try {
        return await createPageWithSchemaRetry(
            { database_id: notionConfig.databases.fitReports },
            {
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
            },
            'saveFitReport'
        );
    } catch (error) {
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

