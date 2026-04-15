import { analyzeJobFit } from '../../../agents/strategist/spottr-workflow.js';
import { getUserCv } from '../../../lib/notion-client.js';
import { parseUrl } from '../../lib/parser.js';

export const POST = async ({ request }) => {
    try {
        let { email, jobText, jobUrl } = await request.json();

        // Validate input
        if (!email || !email.trim()) {
            return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // AUTO-SCRAPE LOGIC: If jobText is empty but jobUrl is provided
        let titleHint = '';
        if ((!jobText || !jobText.trim()) && jobUrl && jobUrl.trim()) {
            console.log(`🌐 Auto-scraping job description from: ${jobUrl}`);
            try {
                const scraped = await parseUrl(jobUrl);
                
                // Signal Quality Guard
                if (scraped.lowSignal || !scraped.text || scraped.text.length < 300) {
                    console.warn('⚠️ Low signal detected from URL scraper. Reverting to manual paste.');
                    return new Response(JSON.stringify({ 
                        error: `I'm having trouble reading that specific link (likely protected or require a login). Please paste the Job Description text manually below to ensure an accurate fit analysis.` 
                    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }

                jobText = scraped.text;
                titleHint = scraped.title;
            } catch (scrapeError) {
                return new Response(JSON.stringify({ 
                    error: `Scraping failed: ${scrapeError.message}. Please paste the text manually.` 
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
        }

        if (!jobText || !jobText.trim()) {
            return new Response(JSON.stringify({ error: 'Please provide either a Job URL or paste the Job Description' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        console.log(`📥 Analyzing job for user: ${email}`);

        // Step 1: Get user's CV data from Notion
        console.log('  → Fetching user CV from Notion...');
        const userData = await getUserCv(email);

        if (!userData) {
            return new Response(JSON.stringify({
                error: 'User not found. Please complete onboarding first.'
            }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // Step 2: Call the Strategist workflow (Module 3)
        const result = await analyzeJobFit(email, jobText, jobUrl, {
            skills: userData.skills,
            experience: userData.experience,
            totalYears: userData.experience.reduce((sum, exp) => sum + (exp.years || 0), 0)
        }, titleHint);

        console.log(`✅ Job analyzed successfully for: ${email}`);

        return new Response(JSON.stringify({
            success: true,
            reportId: result.reportId,
            skillsMatch: result.skillsMatch,
            experienceMatch: result.experienceMatch,
            recommendation: result.recommendation,
            strengths: result.strengths,
            weaknesses: result.weaknesses
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('❌ Job analysis failed:', error);

        return new Response(JSON.stringify({
            error: error.message || 'Failed to analyze job'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
