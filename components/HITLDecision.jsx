import { brandConfig } from '../config/brand.js';

export default function HITLDecision({ onApply, onSkip, loading = false }) {
    return (
        <div style={{
            display: 'flex',
            gap: '1rem',
            marginTop: '2rem',
            flexWrap: 'wrap'
        }}>
            <button
                className="btn-primary"
                onClick={onApply}
                disabled={loading}
                style={{ flex: 1, minWidth: '200px' }}
            >
                {loading ? 'SAVING...' : '✅ APPLY TO THIS'}
            </button>

            <button
                className="btn-primary btn-secondary"
                onClick={onSkip}
                disabled={loading}
                style={{ flex: 1, minWidth: '200px' }}
            >
                {loading ? 'SAVING...' : '❌ SKIP THIS'}
            </button>
        </div>
    );
}
