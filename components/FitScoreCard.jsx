export default function FitScoreCard({ skillsScore, experienceScore, recommendation }) {
    return (
        <div className="fit-score-card">
            <h2>🎯 FIT SCORE</h2>

            <div style={{ position: 'relative', zIndex: 1, marginTop: '1.5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span>Skills Match</span>
                        <span style={{ fontWeight: 700, color: 'var(--cyan)' }}>{skillsScore}%</span>
                    </div>
                    <div className="score-bar">
                        <div
                            className="score-bar-fill"
                            style={{ width: `${skillsScore}%` }}
                        ></div>
                    </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span>Experience Match</span>
                        <span style={{ fontWeight: 700, color: 'var(--purple)' }}>{experienceScore}%</span>
                    </div>
                    <div className="score-bar">
                        <div
                            className="score-bar-fill"
                            style={{ width: `${experienceScore}%` }}
                        ></div>
                    </div>
                </div>

                <div style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    borderRadius: '8px',
                    background: recommendation === 'Apply'
                        ? 'rgba(60, 255, 158, 0.1)'
                        : 'rgba(255, 47, 146, 0.1)',
                    border: recommendation === 'Apply'
                        ? '1px solid var(--mint)'
                        : '1px solid var(--hot-pink)'
                }}>
                    <p style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: recommendation === 'Apply' ? 'var(--mint)' : 'var(--hot-pink)',
                        margin: 0
                    }}>
                        {recommendation === 'Apply' ? '✅ APPLY' : '❌ DON\'T APPLY'}
                    </p>
                </div>
            </div>
        </div>
    );
}
