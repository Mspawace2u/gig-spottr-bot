import { updateUserDecision } from '../../../lib/notion-client.js';

export const POST = async ({ request }) => {
    try {
        const { reportId, decision } = await request.json();

        if (!reportId || !decision) {
            return new Response(JSON.stringify({ error: 'Report ID and decision are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        console.log(`📝 Updating status for report ${reportId}: ${decision}`);

        await updateUserDecision(reportId, decision);

        console.log(`✅ Status updated successfully`);

        return new Response(JSON.stringify({
            success: true,
            message: 'Status updated successfully'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('❌ Failed to update status:', error);

        return new Response(JSON.stringify({
            error: error.message || 'Failed to update status'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
