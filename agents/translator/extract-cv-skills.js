import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { logSkillsExtraction } from '../../lib/score-debug.js';

/**
 * TRANSLATOR AGENT - Skill: Extract CV Skills
 *
 * Input: Raw CV text
 * Output: Array of skills with proficiency + years
 *
 * Goal:
 * Keep CV skill extraction stable enough for scoring.
 *
 * Strategy:
 * 1. Try compact structured LLM extraction.
 * 2. If malformed/truncated, retry once with an even smaller prompt.
 * 3. If still broken, use safe deterministic extraction.
 * 4. Never save sentence-fragment fallback soup.
 */

const MAX_LLM_SKILLS = 35;
const MAX_FINAL_SKILLS = 45;

export async function extractCvSkills(cvText) {
    if (!cvText || cvText.trim().length === 0) {
        throw new Error('CV text is empty');
    }

    try {
        console.log('Split CV into 1 chunks for processing');

        let skills = [];

        try {
            skills = await extractSkillsWithLLM(cvText, MAX_LLM_SKILLS);
        } catch (firstError) {
            console.warn('Primary CV skill extraction failed. Retrying compact extraction...');
            console.warn(firstError.message);

            try {
                skills = await extractSkillsWithLLM(cvText, 25, true);
            } catch (retryError) {
                console.warn('Compact CV skill extraction failed. Using safe deterministic fallback.');
                console.warn(retryError.message);
                skills = safeFallbackExtractSkills(cvText);
            }
        }

        const validatedSkills = dedupeAndNormalizeSkills(skills).slice(0, MAX_FINAL_SKILLS);

        if (validatedSkills.length < 10) {
            throw new Error(`Only ${validatedSkills.length} usable skills found. Refusing to save weak CV skill baseline.`);
        }

        logSkillsExtraction('extractCvSkills', validatedSkills);
        return validatedSkills;

    } catch (error) {
        console.error('Error extracting CV skills:', error);
        throw new Error(`Failed to extract skills: ${error.message}`);
    }
}

async function extractSkillsWithLLM(cvText, maxSkills = 35, compact = false) {
    const prompt = compact
        ? buildCompactSkillPrompt(cvText, maxSkills)
        : buildPrimarySkillPrompt(cvText, maxSkills);

    const response = await callLLM(prompt, {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        responseSchema: {
            type: 'OBJECT',
            properties: {
                skills: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            name: { type: 'STRING' },
                            proficiency: { type: 'STRING' },
                            years: { type: 'STRING' }
                        },
                        required: ['name']
                    }
                }
            },
            required: ['skills']
        }
    });

    const parsed = typeof response === 'string' ? parseJsonFromLLM(response) : response;

    if (!parsed || !Array.isArray(parsed.skills)) {
        throw new Error('LLM returned no usable skills array');
    }

    return parsed.skills.map(skill => ({
        ...skill,
        source: 'Extracted from CV'
    }));
}

function buildPrimarySkillPrompt(cvText, maxSkills) {
    return `Extract the strongest resume/CV skills for job-fit analysis.

Rules:
- Return no more than ${maxSkills} skills.
- Extract only skills actually supported by the CV.
- Prefer concise skill names, not sentences.
- Keep combined skills together when they belong together.
- Do not split every phrase into tiny fragments.
- Do not invent tools, platforms, or domains.
- Years may be "0", "10", "12+", "15+", etc.
- If years are not clear, use "0".

Good examples:
- Customer Experience Design
- Client Onboarding & Lifecycle Systems
- Revenue Optimization & Performance Tracking
- GTM Strategy & Revenue Operations
- Process Optimization & Workflow Architecture
- Project & Program Management
- Team Leadership, Development & Retention
- Digital Marketing, Lifecycle & Growth Systems
- AI Strategy, Workflow Automation & Agentic Systems
- Enablement & Playbook Infrastructure

Return ONLY valid JSON:
{
  "skills": [
    {
      "name": "Skill name",
      "proficiency": "short context or not specified",
      "years": "number or 0"
    }
  ]
}

CV TEXT:
${cvText}`;
}

function buildCompactSkillPrompt(cvText, maxSkills) {
    return `Return JSON only.

Extract up to ${maxSkills} concise resume skills from this CV.

Do not return sentences.
Do not return fragments.
Do not invent missing experience.
Use "0" for unknown years.

JSON shape:
{
  "skills": [
    { "name": "Skill name", "proficiency": "not specified", "years": "0" }
  ]
}

CV:
${cvText.slice(0, 9000)}`;
}

function dedupeAndNormalizeSkills(skills) {
    const uniqueSkillsMap = new Map();

    skills.forEach(skill => {
        const rawName = typeof skill === 'string' ? skill : skill?.name;
        if (!rawName || !String(rawName).trim()) return;

        const cleanName = cleanSkillName(rawName);
        if (!looksLikeCleanSkill(cleanName)) return;

        const key = cleanName.toLowerCase();
        const years = normalizeYears(skill?.years);

        if (!uniqueSkillsMap.has(key) || (years && !uniqueSkillsMap.get(key).years)) {
            uniqueSkillsMap.set(key, {
                name: cleanName,
                proficiency: skill?.proficiency || 'not specified',
                years,
                source: skill?.source || 'Safe deterministic fallback'
            });
        }
    });

    return Array.from(uniqueSkillsMap.values());
}

function safeFallbackExtractSkills(cvText) {
    const skills = [];
    const lines = cvText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    const sectionMarkers = [
        'core impact areas',
        'professional skills',
        'operations, strategy & revenue',
        'partner, revenue, & stakeholder operations',
        'customer experience & enablement',
        'marketing, growth & systems',
        'technical & adaptive strengths',
        'sales + revenue snapshot',
        'career highlights'
    ];

    const endMarkers = [
        'experience summary',
        'prior experience',
        'education',
        'certifications',
        'tools',
        'references'
    ];

    let capture = false;
    const capturedLines = [];

    for (const line of lines) {
        const normalized = line.toLowerCase();

        if (sectionMarkers.some(marker => normalized.includes(marker))) {
            capture = true;
            continue;
        }

        if (capture && endMarkers.some(marker => normalized.startsWith(marker))) {
            capture = false;
            continue;
        }

        if (capture) {
            capturedLines.push(line);
        }
    }

    const linesToParse = capturedLines.length ? capturedLines : lines;

    for (const line of linesToParse) {
        const candidates = extractCandidatesFromLine(line);

        for (const candidate of candidates) {
            const cleanName = cleanSkillName(candidate);
            if (!looksLikeCleanSkill(cleanName)) continue;

            const yearsMatch = line.match(/(\d+)\+?\s*years?/i);

            skills.push({
                name: cleanName,
                proficiency: 'not specified',
                years: yearsMatch ? yearsMatch[1] : '0',
                source: 'Safe deterministic fallback'
            });
        }
    }

    return skills.slice(0, MAX_FINAL_SKILLS);
}

function extractCandidatesFromLine(line) {
    const cleanedLine = line
        .replace(/^[-•*●]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleanedLine) return [];

    const candidates = [];

    // Prefer labels before colons:
    // "Sales + Customer Handoff Repair: I connect marketing..."
    if (cleanedLine.includes(':')) {
        const label = cleanedLine.split(':')[0].trim();
        candidates.push(label);
    }

    // Handle pipe-separated skill lists.
    if (cleanedLine.includes('|')) {
        candidates.push(...cleanedLine.split('|').map(item => item.trim()));
    }

    // Handle plus-separated section labels conservatively.
    if (
        cleanedLine.length <= 90 &&
        /strategy|operations|customer|lifecycle|enablement|revenue|workflow|automation|leadership|analytics|reporting/i.test(cleanedLine)
    ) {
        candidates.push(cleanedLine);
    }

    return candidates;
}

function cleanSkillName(value) {
    return String(value)
        .trim()
        .replace(/^[-•*●]\s*/, '')
        .replace(/\(\d+\+?\s*years?\)/i, '')
        .replace(/\s+/g, ' ')
        .replace(/[“”"]/g, '')
        .replace(/\s+\.$/, '')
        .replace(/\s+,$/, '')
        .trim();
}

function looksLikeCleanSkill(value) {
    if (!value) return false;

    const lower = value.toLowerCase();
    const words = value.split(/\s+/).filter(Boolean);

    if (value.length < 3 || value.length > 85) return false;
    if (words.length > 9) return false;

    const rejectPatterns = [
        'cv | resume',
        'patty woods',
        'hey@',
        'http',
        'linkedin',
        'total on the job',
        'wavemaker llc',
        'present',
        'what’s working',
        "what's working",
        'how do we do this again',
        'and revenue workflows',
        'and revenue movement',
        'so leads',
        'customers',
        'clients',
        'providers'
    ];

    if (rejectPatterns.some(pattern => lower.includes(pattern))) return false;

    const rejectStarts = [
        'and ',
        'or ',
        'so ',
        'how ',
        'what ',
        'where ',
        'when ',
        'why ',
        'who ',
        'the ',
        'a '
    ];

    if (rejectStarts.some(start => lower.startsWith(start))) return false;

    if (/[?]/.test(value)) return false;

    const skillSignals = [
        'strategy',
        'operations',
        'revenue',
        'customer',
        'client',
        'lifecycle',
        'onboarding',
        'retention',
        'funnel',
        'optimization',
        'automation',
        'analytics',
        'analysis',
        'reporting',
        'data',
        'crm',
        'marketing',
        'gtm',
        'process',
        'workflow',
        'project',
        'program',
        'stakeholder',
        'vendor',
        'contractor',
        'team',
        'leadership',
        'enablement',
        'quality',
        'qa',
        'ai',
        'agentic',
        'integration',
        'monetization',
        'forecasting',
        'kpi',
        'okr',
        'documentation',
        'sales',
        'consultative',
        'support',
        'service',
        'delivery',
        'playbook',
        'sop'
    ];

    return skillSignals.some(signal => lower.includes(signal));
}

function normalizeYears(value) {
    if (value === undefined || value === null) return 0;

    if (typeof value === 'number') return value;

    const match = String(value).match(/\d+/);
    return match ? Number(match[0]) : 0;
}