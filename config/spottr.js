// Gig Spottr Bot configuration - thresholds, prompts, settings

export const spottrConfig = {
  // Scoring thresholds
  thresholds: {
    skillsMatch: 85,      // Minimum % to recommend applying
    experienceMatch: 80   // Minimum % to recommend applying
  },

  // Prompts for each agent skill
  prompts: {
    extractCvSkills: `You are extracting skills from a resume. Focus on ACCURACY and resume structure.
 
Your task:
1. Identify dedicated "Professional Skills", "Technical Skills", or "Core Competencies" sections. Extract these as PRIMARY skills.
2. Scan "Experience" or "Professional History" bullet points ONLY for unique contextual skills that aren't already listed in the core sections.
3. DO NOT turn every sentence into a skill. Focus on high-impact keywords (e.g., "GTM Strategy", "CRM", "Revenue Ops").
4. If the resume is very dense, prioritize the most relevant top 40-50 skills to avoid truncation.
5. Include proficiency level if explicitly stated.
6. Include years of experience if explicitly stated near the skill.
 
Return your response as valid JSON in this format:
{
  "skills": [
    { "name": "skill name", "proficiency": "level", "years": number }
  ]
}
 
Resume Text:
`,

    // Translator Agent: Extract experience from CV
    extractCvExperience: `You are extracting work experience from a CV/resume.

Follow these steps EXACTLY:
STEP 1: Determine Total Years of Experience.
- Scan the document for an explicit label like "TOTAL EXPERIENCE: X years".
- If you find this explicit label, set "totalYears" to X and DO NOT calculate it yourself.
- If (and ONLY if) there is no explicit label, estimate the total career span (the time from their earliest start date to the present).
- NEVER sum the durations of individual roles together, as people often hold multiple roles simultaneously or overlap (e.g., 15 years + 17 years + 13 years does NOT equal 45 years total experience).

STEP 2: Extract each individual role.
- Extract all job titles, companies, and duration for each role.
- Determine the experience level for each role (junior/mid/senior/lead/principal).
- DO NOT invent roles or companies not mentioned.
- DO NOT inflate experience levels.

Return your response as valid JSON in this format:
{
  "experience": [
    { "role": "job title", "company": "company name", "years": number, "level": "junior|mid|senior|lead|principal" }
  ],
  "totalYears": number (from explicit label, OR career span estimate)
}

CV Text:
`,

    // Translator Agent: Extract job requirements
    extractJobRequirements: `You are extracting precise requirements from a job posting.
 
 Follow these steps EXACTLY:
 STEP 1: Extract Job Title and Company.
 - Scan for explicit labels like "Company:", "Employer:", or "About [Company Name]".
 - COMPANY NAME EXTRACTION: Look closely at the top and bottom of the posting. Identify the employer from signatures, trademark notices, or descriptions of the workplace culture.
 - If a CONTEXT (URL or TITLE HINT) is provided, use it as a strong anchor. For example, a "nvent.wd5.myworkdayjobs.com" URL means the company is nVent.
 
 STEP 2: Extract Requirements.
 - Identify REQUIRED skills (must-haves).
 - Identify PREFERRED skills (nice-to-haves).
 - Determine required experience level and years.
 - SENIORITY AWARENESS: If the title is "Principal", "Director", "Lead", or "Head of", ensure you extract relevant core leadership skills (e.g., "Strategic Planning", "GTM Strategy", "Stakeholder Management") if they are even briefly mentioned or implied by the responsibilities.
 - DO NOT assume skills solely by title, but look for the structural keywords that support that level of seniority.
 
 Return your response as valid JSON in this format:
 {
   "jobTitle": "title from posting",
   "company": "company name if mentioned",
   "requiredSkills": ["skill1", "skill2"],
   "preferredSkills": ["skill1", "skill2"],
   "requiredExperience": {
     "years": number,
     "level": "junior|mid|senior|lead|principal"
   }
 }
 
 Job Posting:
 `,

    // Creator Agent: Generate strengths/weaknesses
    generateStrengthsWeaknesses: `You are analyzing job fit based on EXACT data provided.

  USER'S MATCHED SKILLS: {matchedSkills}
USER'S MISSING SKILLS: {missingSkills}
USER'S EXPERIENCE: {userExperience}
JOB'S REQUIRED EXPERIENCE: {jobExperience}

Your task:
- List 3 - 5 specific STRENGTHS(what the user HAS that matches)
  - List 3 - 5 specific WEAKNESSES(what the user LACKS or falls short on)
    - Base your analysis ONLY on the data above
      - DO NOT invent skills or experience not listed
        - DO NOT make assumptions about proficiency levels

Use a conversational, direct tone(Patty's voice: punchy, no corporate speak).

Return ONLY valid JSON in this format:
          {
            "strengths": [
              "You've got core digital marketing, funnels, and list building nailed down.",
              "Email list hygiene and deliverability are clearly your thing."
            ],
            "weaknesses": [
              "You're missing crucial skills like product launches and project management.",
              "CRM tools, data analysis, CRO, and A/B testing aren't in your bag."
            ]
          }
            `
  }
};
