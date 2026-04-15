// Notion database schema and configuration

export const notionConfig = {
    // Database IDs (from .env.local)
    databases: {
        users: import.meta.env.NOTION_DB_USERS,
        jobs: import.meta.env.NOTION_DB_JOBS,
        fitReports: import.meta.env.NOTION_DB_FIT_REPORTS
    },

    // Users Database Schema
    usersSchema: {
        email: 'title',           // Primary key
        cv_original: 'rich_text', // Original CV text
        skills: 'rich_text',      // JSON string of extracted skills
        experience: 'rich_text',  // JSON string of extracted experience
        created_at: 'date',
        updated_at: 'date'
    },

    // Jobs Database Schema
    jobsSchema: {
        job_url: 'url',
        job_title: 'title',
        company: 'rich_text',
        job_description: 'rich_text',
        required_skills: 'rich_text',    // JSON string
        preferred_skills: 'rich_text',   // JSON string
        required_experience: 'rich_text', // JSON string
        scraped_at: 'date'
    },

    // Fit Reports Database Schema
    fitReportsSchema: {
        user_email: 'rich_text',
        job_url: 'url',
        job_title: 'title',
        skills_match_percent: 'number',
        experience_match_percent: 'number',
        strengths: 'rich_text',      // JSON string
        weaknesses: 'rich_text',     // JSON string
        recommendation: 'select',    // Options: "Apply", "Don't Apply"
        user_decision: 'select',     // Options: "Applied", "Skipped", "Pending"
        created_at: 'date'
    }
};

// Helper: Get property value from Notion page
export function getNotionProperty(page, propertyName) {
    const prop = page.properties[propertyName];

    if (!prop) return null;

    switch (prop.type) {
        case 'title':
            return prop.title[0]?.plain_text || '';
        case 'rich_text':
            return prop.rich_text.map(t => t.plain_text).join('');
        case 'number':
            return prop.number;
        case 'select':
            return prop.select?.name || null;
        case 'date':
            return prop.date?.start || null;
        case 'url':
            return prop.url || '';
        default:
            return null;
    }
}

// Helper: Format property for Notion API
export function formatNotionProperty(type, value) {
    switch (type) {
        case 'title':
            return { title: [{ text: { content: value } }] };
        case 'rich_text':
            if (!value) return { rich_text: [] };
            const chunks = value.match(/[\s\S]{1,2000}/g) || [];
            return {
                rich_text: chunks.slice(0, 100).map(chunk => ({
                    text: { content: chunk }
                }))
            };
        case 'number':
            return { number: value };
        case 'select':
            return { select: { name: value } };
        case 'date':
            return { date: { start: value } };
        case 'url':
            return { url: value };
        default:
            return null;
    }
}
