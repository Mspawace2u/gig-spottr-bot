/**
 * Lightweight diagnostic logging for the scoring pipeline.
 *
 * Gated by SCORE_DEBUG=1 (set the env var in Vercel to enable; unset/absent
 * to disable). All output goes through console.log with a [SCORE-DEBUG]
 * prefix so it can be filtered out of Vercel function logs with a single
 * search term.
 *
 * Designed to capture pipeline state without leaking PII:
 * - parser/extraction text is reduced to length + structural counts
 * - skills/experience are reduced to counts + sample prefixes (first 80 chars)
 * - matches/evidence are reduced to per-bucket counts only
 * - email + full CV text + full job description are NEVER logged
 *
 * Toggle:
 *   SCORE_DEBUG=1   — enabled
 *   (anything else) — disabled (zero-cost no-op)
 */

const PREFIX = '[SCORE-DEBUG]';

function read(varName) {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[varName] !== undefined) {
            return import.meta.env[varName];
        }
    } catch {
        // import.meta.env can be undefined outside Astro/Vite contexts
    }
    if (typeof process !== 'undefined' && process.env && process.env[varName] !== undefined) {
        return process.env[varName];
    }
    return undefined;
}

export function isDebugEnabled() {
    return read('SCORE_DEBUG') === '1';
}

function log(label, payload) {
    if (!isDebugEnabled()) return;
    try {
        console.log(`${PREFIX} ${label} ${JSON.stringify(payload)}`);
    } catch {
        console.log(`${PREFIX} ${label} <unserializable>`);
    }
}

/**
 * Parser extraction stats. Captures structural quality of the extracted
 * text so we can compare across parser versions / file types / runs.
 */
export function logExtractionStats(label, text) {
    if (!isDebugEnabled() || typeof text !== 'string') return;

    const lines = text.split('\n');
    const blankLines = lines.filter(l => l.trim().length === 0).length;
    const bullets = (text.match(/[•◦●▪]/g) || []).length;
    const tokens = new Set(
        text.split(/\s+/).filter(t => t.replace(/[^A-Za-z0-9]/g, '').length >= 4)
    );

    log(label, {
        chars: text.length,
        lines: lines.length,
        newlines: (text.match(/\n/g) || []).length,
        blankLines,
        bullets,
        uniqueTokens4plus: tokens.size,
        first80: text.slice(0, 80).replace(/\s+/g, ' '),
        last80: text.slice(-80).replace(/\s+/g, ' ')
    });
}

/**
 * Skills extraction summary. Logs count + first 5 skill names so we can
 * see whether extraction quality is consistent across runs / parsers.
 */
export function logSkillsExtraction(label, skills) {
    if (!isDebugEnabled()) return;

    const names = (Array.isArray(skills) ? skills : [])
        .map(s => typeof s === 'string' ? s : s?.name)
        .filter(Boolean);

    log(label, {
        count: names.length,
        sample: names.slice(0, 5)
    });
}

/**
 * Experience extraction summary. Logs job count + total years.
 */
export function logExperienceExtraction(label, experienceData) {
    if (!isDebugEnabled()) return;

    const jobs = experienceData?.experience || [];

    log(label, {
        jobCount: jobs.length,
        totalYears: experienceData?.totalYears,
        levels: jobs.map(j => j?.level).filter(Boolean)
    });
}

/**
 * Semantic-match distribution. Logs the count of each matchType bucket
 * for required + preferred skills so we can see how lenient/strict the
 * model is being on a given run.
 */
export function logSemanticMatchStats(label, semanticResult) {
    if (!isDebugEnabled()) return;

    const distribution = (matches) => {
        const buckets = { exact_match: 0, strong_transferable_match: 0, weak_transferable_match: 0, missing_proof: 0, no_match: 0 };
        for (const m of (matches || [])) {
            if (buckets[m.matchType] !== undefined) buckets[m.matchType]++;
        }
        return buckets;
    };

    log(label, {
        score: semanticResult?.score,
        requiredScore: semanticResult?.requiredScore,
        preferredScore: semanticResult?.preferredScore,
        required: {
            total: semanticResult?.totalRequired,
            distribution: distribution(semanticResult?.requiredMatches)
        },
        preferred: {
            total: semanticResult?.totalPreferred,
            distribution: distribution(semanticResult?.preferredMatches)
        }
    });
}

/**
 * Evidence-classification distribution. Logs the count of each
 * evidenceType bucket so we can see how the OpenAI agent is bucketing
 * skills.
 */
export function logEvidenceStats(label, evidenceResult) {
    if (!isDebugEnabled()) return;

    const buckets = { direct_evidence: 0, adjacent_evidence: 0, implied_founder_operator: 0, missing_proof: 0, missing_capability: 0 };
    const classifications = evidenceResult?.classifications || [];
    for (const c of classifications) {
        if (buckets[c.evidenceType] !== undefined) buckets[c.evidenceType]++;
    }

    log(label, {
        score: evidenceResult?.score,
        totalClassifications: classifications.length,
        distribution: buckets
    });
}

/**
 * Final score breakdown. Logs the three component scores + their
 * weighted contributions + the overall score so we can see at a glance
 * which component pushed the score in which direction.
 */
export function logScoreBreakdown(components) {
    if (!isDebugEnabled()) return;

    const { rawSkillsScore = 0, evidenceScore = 0, experienceScore = 0 } = components;
    const weighted = {
        rawSkills_50: Math.round(rawSkillsScore * 0.50 * 100) / 100,
        evidence_15: Math.round(evidenceScore * 0.15 * 100) / 100,
        experience_35: Math.round(experienceScore * 0.35 * 100) / 100
    };
    const overall = Math.round(weighted.rawSkills_50 + weighted.evidence_15 + weighted.experience_35);

    log('overallFitScore', {
        components: { rawSkillsScore, evidenceScore, experienceScore },
        weighted,
        overall
    });
}
