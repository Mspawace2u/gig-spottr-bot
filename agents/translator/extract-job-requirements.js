import { callLLM, parseJsonFromLLM } from '../../lib/llm.js';
import { spottrConfig } from '../../config/spottr.js';

/**
 * TRANSLATOR AGENT - Skill: Extract Job Requirements
 *
 * Input: Job posting text
 * Output: Required skills, preferred skills, required experience
 *
 * Goal:
 * Extract bundled hiring competencies, not every noun, tool, example, or sub-action.
 */

const EXTRACTION_GUARDRAILS = `
You are extracting hiring requirements for a job-fit scoring system.

CRITICAL RULE:
Return bundled hiring competencies, not keyword fragments.

Do NOT split examples, tools, metrics, or sub-actions into standalone requirements.

Examples:
- "Google Sheets, Looker, Metabase, and other analytics tools"
  becomes:
  "Customer and team performance data analysis using analytics tools"

- "productivity, reliability, and customer satisfaction"
  becomes:
  "Quality and performance standards management"

- "identify bottlenecks, trends, and make recommendations"
  becomes:
  "Operational insight, trend identification, and impact-driven recommendations"

- "Product, Design, and Marketing"
  becomes:
  "Cross-functional collaboration with Product, Design, and Marketing"

- "insurance and billing related issues"
  becomes:
  "Complex product issue resolution in insurance or billing context"

Do NOT return individual tools as required skills unless the job explicitly says the tool itself is mandatory.

Bad required skills:
- Google Sheets
- Looker
- Metabase
- CSAT
- productivity
- reliability
- Product
- Design
- Marketing

Better required skills:
- Data-driven CX performance analysis
- Quality standards and performance management
- Cross-functional customer insight sharing
- Operational efficiency and cost-target awareness
- Team leadership, coaching, and performance management

Return 8 to 12 required skills unless the role truly requires more.
Return 0 to 6 preferred skills.
Prefer concise but complete competency phrases.
`;

const MAX_REQUIRED_SKILLS = 12;
const MAX_PREFERRED_SKILLS = 6;

export async function extractJobRequirements(jobText, jobUrl = '', titleHint = '') {
    if (!jobText || jobText.trim().length === 0) {
        throw new Error('Job posting text is empty');
    }

    try {
        let prompt = `${EXTRACTION_GUARDRAILS}\n\n${spottrConfig.prompts.extractJobRequirements}`;

        if (titleHint || jobUrl) {
            prompt = `CONTEXT:\nURL: ${jobUrl}\nTITLE HINT: ${titleHint}\n\n` + prompt;
        }

        prompt += jobText;

        const response = await callLLM(prompt, {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            temperature: 0.1,
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    jobTitle: { type: 'STRING' },
                    company: { type: 'STRING' },
                    requiredSkills: {
                        type: 'ARRAY',
                        items: { type: 'STRING' }
                    },
                    preferredSkills: {
                        type: 'ARRAY',
                        items: { type: 'STRING' }
                    },
                    requiredExperience: {
                        type: 'OBJECT',
                        properties: {
                            years: { type: 'NUMBER' },
                            level: { type: 'STRING' }
                        },
                        required: ['years', 'level']
                    }
                },
                required: ['jobTitle', 'company', 'requiredSkills', 'preferredSkills', 'requiredExperience']
            }
        });

        const data = parseJsonFromLLM(response);

        if (!data.requiredSkills || !Array.isArray(data.requiredSkills)) {
            throw new Error('Invalid response structure: missing requiredSkills array');
        }

        if (!data.preferredSkills || !Array.isArray(data.preferredSkills)) {
            throw new Error('Invalid response structure: missing preferredSkills array');
        }

        if (!data.requiredExperience || typeof data.requiredExperience !== 'object') {
            throw new Error('Invalid response structure: missing requiredExperience object');
        }

        const cleanedRequiredSkills = normalizeSkillList(data.requiredSkills, MAX_REQUIRED_SKILLS);
        const cleanedPreferredSkills = normalizeSkillList(data.preferredSkills, MAX_PREFERRED_SKILLS);

        const requiredExperience = {
            years: data.requiredExperience.years || 0,
            level: data.requiredExperience.level || 'not specified'
        };

        return {
            jobTitle: data.jobTitle || '',
            company: data.company || '',
            requiredSkills: cleanedRequiredSkills,
            preferredSkills: cleanedPreferredSkills,
            requiredExperience
        };

    } catch (error) {
        console.error('Error extracting job requirements:', error);
        throw new Error(`Failed to extract job requirements: ${error.message}`);
    }
}

function normalizeSkillList(skills, maxItems) {
    const seen = new Set();

    return skills
        .map(skill => String(skill || '').trim())
        .filter(Boolean)
        .map(skill => cleanRequirementName(skill))
        .filter(skill => skill.length > 0)
        .filter(skill => !isBadStandaloneRequirement(skill))
        .filter(skill => {
            const key = skill.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, maxItems);
}

function cleanRequirementName(skill) {
    return skill
        .replace(/\s+/g, ' ')
        .replace(/^[-•*]\s*/, '')
        .trim();
}

function isBadStandaloneRequirement(skill) {
    const lower = skill.toLowerCase();

    const badStandalone = [
        'google sheets',
        'looker',
        'metabase',
        'csat',
        'productivity',
        'reliability',
        'product',
        'design',
        'marketing',
        'salesforce',
        'hubspot',
        'zendesk',
        'intercom'
    ];

    return badStandalone.includes(lower);
}