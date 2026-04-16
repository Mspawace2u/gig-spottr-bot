// Gig Spottr Bot configuration - thresholds, prompts, settings

export const spottrConfig = {
  // Scoring thresholds
  thresholds: {
    skillsMatch: 85,      // Minimum % to recommend applying
    experienceMatch: 80   // Minimum % to recommend applying
  },

  // Prompts for each agent skill
  prompts: {
    extractCvSkills: `You are extracting skills from a resume. Focus on GROUNDED ACCURACY.
 
 Your task:
 1. USE THE USER'S VOCABULARY. Extract skills using the specific terms found in the text.
 2. DO NOT SUMMARIZE OR INFER. For example, if a bullet describes "managing a team of 5", extract "Team Management". DO NOT extract "Organizational Leadership Strategy" if those words aren't in the text.
 3. NO HALLUCINATIONS. If a skill isn't explicitly grounded in a specific line of text or a direct synonym, DO NOT extract it.
 4. Identify dedicated "Professional Skills" or "Technical Skills" sections as PRIMARY sources.
 5. Scan "Experience" bullet points for unique tools or core activities.
 6. If the resume is dense, prioritize the most representative top 40-50 skills.
 
 Return your response as valid JSON in this format:
 {
   "skills": [
     { "name": "skill name", "proficiency": "level", "years": number }
   ]
 }
 
 Resume Text:
 `,

    // Translator Agent: Extract experience from CV
    extractCvExperience: `You are extracting work experience from a CV/resume. Focus on LITERAL EVIDENCE.

Follow these steps EXACTLY:
STEP 1: Determine Total Years of Experience.
- Scan the document for an explicit label like "TOTAL EXPERIENCE: X years".
- If no explicit label, estimate the career span (earliest job to present).
- NEVER sum individual durations.

STEP 2: Extract individual roles.
- Use explicit job titles and company names.
- DO NOT infer higher seniority levels (e.g., don't turn "Manager" into "Director") unless explicitly stated.
- If a role is not in the text, DO NOT invent it.

Return your response as valid JSON in this format:
{
  "experience": [
    { "role": "job title", "company": "company name", "years": number, "level": "junior|mid|senior|lead|principal" }
  ],
  "totalYears": number
}

CV Text:
`,

    // Translator Agent: Extract job requirements
    extractJobRequirements: `You are extracting precise requirements from a job posting.
 
 Follow these steps EXACTLY:
 STEP 1: Extract Job Title and Company.
 - Scan for explicit labels like "Company:", "Employer:", or "About [Company Name]".
 - COMPANY NAME EXTRACTION: Look closely at the top and bottom of the posting. Identify the employer from signatures, trademark notices, or descriptions of the workplace culture.
 - If a CONTEXT (URL or TITLE HINT) is provided, use it as a strong anchor.
 
 STEP 2: Aggressive Skill Mining.
 - DO NOT look just for a heading titled "Requirements". Scan the ENTIRE text.
 - EXHAUSTIVE EXTRACTION: Mine the "Responsibilities", "Daily Tasks", and "What You'll Do" sections for core skills.
 - If the job says "You will manage a team using CRM", extract "Team Management" and "CRM" as REQUIRED skills.
 - Aim for a comprehensive list of 10-15 core skills to ensure an accurate fit analysis.
 - Identify REQUIRED skills (must-haves).
 - Identify PREFERRED skills (nice-to-haves).
 - Determine required experience level and years.
 - SENIORITY AWARENESS: If the title is "Principal", "Director", "Lead", or "Head of", ensure you extract relevant core leadership skills (e.g., "Strategic Planning", "GTM Strategy", "Stakeholder Management") if they are even briefly mentioned or implied by the responsibilities.
 
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
