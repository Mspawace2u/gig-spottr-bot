import { getFitReports } from '../../../lib/notion-client.js';

export const GET = async ({ url }) => {
    try {
        const email = url.searchParams.get('email');

        if (!email) {
            return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400 });
        }

        console.log(`📥 Fetching dashboard logs for: ${email}`);
        const reports = await getFitReports(email);

        // Calculate counts and organize buckets if needed, but we'll let the client handle filtering
        return new Response(JSON.stringify({
            success: true,
            reports
        }), { status: 200 });

    } catch (error) {
        console.error('❌ Failed to fetch dashboard:', error);
        return new Response(JSON.stringify({ 
            error: error.message || 'Failed to fetch logs' 
        }), { status: 500 });
    }
}
