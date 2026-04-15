import { onboardUser } from '../../../agents/strategist/spottr-workflow.js';
import { parseUrl, parseFile } from '../../lib/parser.js';

export const POST = async ({ request }) => {
    try {
        const formData = await request.formData();
        const email = formData.get('email');
        const mode = formData.get('mode') || 'text';
        
        let cvText = '';

        // Validate basic input
        if (!email || !email.trim()) {
            return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // Handle extraction based on mode
        console.log(`📥 Processing resume payload [mode: ${mode}] for user: ${email}`);
        
        if (mode === 'link') {
            const cvLink = formData.get('cvLink');
            if (!cvLink) return new Response(JSON.stringify({ error: 'URL link is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            cvText = await parseUrl(cvLink);
        } else if (mode === 'file') {
            const cvFile = formData.get('cvFile');
            if (!cvFile || typeof cvFile === 'string') return new Response(JSON.stringify({ error: 'Valid file attachment is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            cvText = await parseFile(cvFile);
        } else {
            const textRaw = formData.get('cvText');
            if (!textRaw || !textRaw.trim()) return new Response(JSON.stringify({ error: 'CV text is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            cvText = textRaw;
        }

        if (!cvText || cvText.length < 50) {
            return new Response(JSON.stringify({ error: 'Extracted CV data is empty or too short. Valid resume content not found.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // Step to original AI module

        // Call the Strategist workflow (Module 1)
        const result = await onboardUser(email, cvText);

        console.log(`✅ User onboarded successfully: ${email}`);

        return new Response(JSON.stringify({
            success: true,
            message: 'User onboarded successfully',
            skills: result.skills,
            experience: result.experience,
            warnings: result.validationWarnings
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('❌ Onboarding failed:', error);

        return new Response(JSON.stringify({
            error: error.message || 'Failed to onboard user'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
