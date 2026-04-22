import * as cheerio from 'cheerio';
import * as pdfImport from 'pdf-parse';
const pdf = pdfImport.default || pdfImport;

const SCRAPE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// Decode numeric + named HTML entities emitted by Greenhouse `content` field.
function decodeHtmlEntities(s) {
    return (s || '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
        .replace(/&amp;/g, '&');
}

// Generate candidate ATS board/org slugs from a host URL. Used when the host
// page is bot-protected (e.g. Cloudflare 202 challenge on stitchfix.com) and
// we can't read the embed script to discover the slug. Heuristic — the slug
// often matches the brand's second-level domain (stitchfix.com → stitchfix),
// but not always (unity.com → unity3d on Greenhouse). We try candidates in
// order and accept whichever the ATS API returns 200 for.
function slugCandidatesFromHost(hostname) {
    const bare = hostname.replace(/^(www|careers|jobs|apply|hire|hiring)\./i, '');
    const secondLevel = bare.replace(/\.[a-z]+$/i, '');
    const flat = secondLevel.replace(/[^a-zA-Z0-9_-]/g, '');
    const candidates = new Set();
    if (flat) candidates.add(flat.toLowerCase());
    // Common -digit variants (unity → unity3d, etc.) — cheap to try, 404 is fast.
    if (flat) {
        candidates.add(`${flat.toLowerCase()}hq`);
        candidates.add(`${flat.toLowerCase()}inc`);
    }
    return [...candidates];
}

// Turn a Lever API response into the standard directResult shape.
// Lever's `description` and `descriptionPlain` fields are HTML / plain text;
// `additional`/`additionalPlain` are post-description commitments and EOE
// statements which also contain skills/culture signal, so we concatenate.
// `lists` is an array of section headers with bullet content — these carry
// the actual qualifications/responsibilities, critical for fit analysis.
async function fetchLeverJob(orgSlug, jobId) {
    const apiResp = await fetch(`https://api.lever.co/v0/postings/${orgSlug}/${jobId}`);
    if (!apiResp.ok) return null;
    const data = await apiResp.json();
    const descText = cheerio.load(data.description || '').text().replace(/\s+/g, ' ').trim();
    const listText = Array.isArray(data.lists)
        ? data.lists.map(l => {
            const header = (l.text || '').trim();
            const body = cheerio.load(l.content || '').text().replace(/\s+/g, ' ').trim();
            return header && body ? `${header.toUpperCase()}: ${body}` : body;
        }).filter(Boolean).join(' ')
        : '';
    const additional = (data.additionalPlain || '').replace(/\s+/g, ' ').trim();
    const location = data.categories?.location || '';
    const team = data.categories?.team || '';
    const commitment = data.categories?.commitment || '';
    const parts = [
        data.categories?.department ? `COMPANY_DEPT: ${data.categories.department}` : '',
        data.text ? `TITLE: ${data.text}` : '',
        [location, team, commitment].filter(Boolean).join(' / ') ? `LOCATION: ${[location, team, commitment].filter(Boolean).join(' / ')}` : '',
        descText ? `DESCRIPTION: ${descText}` : '',
        listText ? `SECTIONS: ${listText}` : '',
        additional ? `ADDITIONAL: ${additional}` : ''
    ].filter(Boolean);
    const text = parts.join(' ').trim();
    return {
        directResult: {
            text,
            title: (data.text || '').trim(),
            lowSignal: text.length < 300
        }
    };
}

async function fetchGreenhouseJob(boardSlug, ghJid) {
    const apiResp = await fetch(`https://boards-api.greenhouse.io/v1/boards/${boardSlug}/jobs/${ghJid}`);
    if (!apiResp.ok) return null;
    const data = await apiResp.json();
    const descText = cheerio.load(decodeHtmlEntities(data.content || '')).text().replace(/\s+/g, ' ').trim();
    const parts = [
        data.company_name ? `COMPANY: ${data.company_name}` : '',
        data.title ? `TITLE: ${data.title}` : '',
        data.location?.name ? `LOCATION: ${data.location.name}` : '',
        descText ? `DESCRIPTION: ${descText}` : ''
    ].filter(Boolean);
    const text = parts.join(' ').trim();
    return {
        directResult: {
            text,
            title: (data.title || '').trim(),
            lowSignal: text.length < 300
        }
    };
}

async function verifyAshbyJob(orgSlug, ashbyJid) {
    // HEAD request to confirm the org/job combo exists before rewriting.
    try {
        const resp = await fetch(`https://jobs.ashbyhq.com/${orgSlug}/${ashbyJid}`, {
            method: 'HEAD',
            headers: { 'User-Agent': SCRAPE_USER_AGENT }
        });
        return resp.ok;
    } catch {
        return false;
    }
}

// Some job URLs point at a host page (Squarespace, Webflow, company marketing site)
// that only embeds a client-side widget (Ashby, Greenhouse) — the actual job content
// isn't in the HTML. Detect those patterns and resolve to the real job data.
// Returns either { directResult: {...parseUrl result} } or { rewriteUrl: '...' } or null.
//
// Resolution order per ATS:
//   1. Try to fetch the host HTML and extract the slug from the embed script
//      (boards.greenhouse.io/embed/job_board/js?for=<slug> or ashbyhq.com/<org>/embed).
//   2. If host fetch fails (non-OK) or the slug pattern is absent (e.g. host page
//      is bot-protected and returns a challenge), derive slug candidates from the
//      URL hostname and probe the ATS API / job URL until one succeeds.
async function resolveEmbeddedJobBoard(url) {
    try {
        const u = new URL(url);
        const ashbyJid = u.searchParams.get('ashby_jid');
        const ghJid = u.searchParams.get('gh_jid');

        // Detect a direct Lever URL — no query-param marker, just path shape.
        // Accepts both jobs.lever.co/<org>/<uuid> and api.lever.co/v0/postings/<org>/<uuid>.
        // Captures for later use as primary lever resolver path.
        const leverDirect = (u.hostname === 'lever.co' || u.hostname.endsWith('.lever.co')) && (
            u.pathname.match(/^\/(?:v0\/postings\/)?([a-zA-Z0-9_-]+)\/([a-f0-9-]{36})(?:\/|$)/i)
        );
        if (leverDirect) {
            const [, orgSlug, jobId] = leverDirect;
            console.log(`🔗 Direct Lever URL detected — calling public API (org: ${orgSlug}, job: ${jobId})`);
            const result = await fetchLeverJob(orgSlug, jobId);
            if (result) return result;
        }

        // No markers at all? Not obviously an embedded job board we know how
        // to route directly. Fall through to host-HTML-driven Lever detection
        // below (which handles aggregator sites like swooped.co that relay
        // to Lever without advertising it in the query string).
        const hasKnownMarker = ashbyJid || ghJid;
        if (u.hostname === 'jobs.ashbyhq.com' || u.hostname.includes('greenhouse.io')) return null;

        let hostHtml = '';
        try {
            const hostResp = await fetch(url, { headers: { 'User-Agent': SCRAPE_USER_AGENT } });
            if (hostResp.ok) {
                hostHtml = await hostResp.text();
            } else {
                console.log(`🔗 Host page fetch non-OK (${hostResp.status}); falling back to hostname-derived slug candidates`);
            }
        } catch (e) {
            console.log(`🔗 Host page fetch threw (${e.message}); falling back to hostname-derived slug candidates`);
        }

        if (ashbyJid) {
            const m = hostHtml.match(/ashbyhq\.com\/([a-zA-Z0-9_-]+)\/embed/);
            if (m) {
                console.log(`🔗 Ashby embed detected — rewriting to direct URL (org: ${m[1]})`);
                return { rewriteUrl: `https://jobs.ashbyhq.com/${m[1]}/${ashbyJid}` };
            }
            // Host HTML didn't reveal the org slug. Try candidates derived from hostname.
            for (const candidate of slugCandidatesFromHost(u.hostname)) {
                if (await verifyAshbyJob(candidate, ashbyJid)) {
                    console.log(`🔗 Ashby hostname-slug fallback succeeded (org: ${candidate})`);
                    return { rewriteUrl: `https://jobs.ashbyhq.com/${candidate}/${ashbyJid}` };
                }
            }
        }

        if (ghJid) {
            const m = hostHtml.match(/boards\.greenhouse\.io\/embed\/job_board\/js\?for=([a-zA-Z0-9_-]+)/);
            if (m) {
                console.log(`🔗 Greenhouse embed detected — calling public API (board: ${m[1]}, job: ${ghJid})`);
                const result = await fetchGreenhouseJob(m[1], ghJid);
                if (result) return result;
            }
            // Host HTML didn't reveal the board slug (or was blocked). Try candidates.
            for (const candidate of slugCandidatesFromHost(u.hostname)) {
                const result = await fetchGreenhouseJob(candidate, ghJid);
                if (result) {
                    console.log(`🔗 Greenhouse hostname-slug fallback succeeded (board: ${candidate}, job: ${ghJid})`);
                    return result;
                }
            }
        }

        // Lever aggregator path: no marker in the query string, but the host
        // page links to jobs.lever.co/<org>/<uuid> or api.lever.co/v0/postings/<org>/<uuid>.
        // Matches both patterns; collect all hits and try each until one
        // returns real data (defensive against multiple Lever links per page).
        if (!hasKnownMarker && hostHtml) {
            const seen = new Set();
            const leverRe = /(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([a-zA-Z0-9_-]+)\/([a-f0-9-]{36})/gi;
            let match;
            while ((match = leverRe.exec(hostHtml)) !== null) {
                const key = `${match[1]}/${match[2]}`;
                if (seen.has(key)) continue;
                seen.add(key);
                console.log(`🔗 Lever link found on aggregator page — calling public API (org: ${match[1]}, job: ${match[2]})`);
                const result = await fetchLeverJob(match[1], match[2]);
                if (result) return result;
            }
        }

        return null;
    } catch (e) {
        console.warn(`⚠️  Embedded job board resolver skipped: ${e.message}`);
        return null;
    }
}

export async function parseUrl(url) {
    try {
        const resolved = await resolveEmbeddedJobBoard(url);
        if (resolved?.directResult) return resolved.directResult;
        if (resolved?.rewriteUrl) url = resolved.rewriteUrl;

        const response = await fetch(url, {
            headers: {
                'User-Agent': SCRAPE_USER_AGENT
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let extractedText = '';
        let title = $('title').text() || $('meta[property="og:title"]').attr('content') || $('h1').first().text() || '';

        // STRATEGY 1: JSON-LD (Standard for Lever, Greenhouse, LinkedIn, Workday)
        const jsonLdBlocks = $('script[type="application/ld+json"]');
        jsonLdBlocks.each((_, block) => {
            try {
                const data = JSON.parse($(block).text());
                const postings = Array.isArray(data) ? data : [data];
                for (const item of postings) {
                    if (item['@type'] === 'JobPosting' || item['@type']?.includes('JobPosting')) {
                        console.log('✅ Found SEO-Pure JobPosting JSON-LD');
                        extractedText += ` COMPANY: ${item.hiringOrganization?.name || ''} `;
                        extractedText += ` TITLE: ${item.title || ''} `;
                        extractedText += ` DESCRIPTION: ${item.description || ''} `;
                    }
                }
            } catch (e) { /* skip malformed */ }
        });

        // STRATEGY 2: Platform Specifics (Ashby Deep-Packet)
        if (extractedText.length < 300) {
            const ashbyBlock = $('script#ashby-job-posting-data, script:contains("__autoSerializationID")').first().text();
            if (ashbyBlock) {
                console.log('🔍 Extracting from Ashby/Dynamic serialization...');
                // Hunt for the actual content key in Ashby JSON
                const descMatch = ashbyBlock.match(/"descriptionHtml":"([^"]+)"/);
                if (descMatch) {
                    const cleanHtml = descMatch[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\"/g, '"');
                    extractedText += cheerio.load(cleanHtml).text();
                } else {
                    // Broader fallback for Ashby JSON if descriptionHtml key is missing
                    const strings = ashbyBlock.match(/"text":"([^"]+)"/g);
                    if (strings) extractedText += strings.map(s => s.replace(/"text":"|"/g, '')).join(' ');
                }
            }
        }

        // STRATEGY 3: Targeted Standard Containers
        if (extractedText.length < 300) {
             const containers = [
                '[itemprop="description"]', 
                '.job-description', 
                '.posting-description', 
                '#job-description', 
                '.content',
                'main'
             ];
             containers.forEach(sel => {
                const text = $(sel).text().trim();
                if (text.length > extractedText.length) extractedText = text;
             });
        }

        // STRATEGY 4: Meta-Data Bridging (Clean & SEO-Optimized)
        const metaDesc = $('meta[property="og:description"], meta[name="description"]').attr('content') || '';
        if (metaDesc.length > 50 && extractedText.length < 500) {
            extractedText = metaDesc + "\n\n" + extractedText;
        }

        // QUALITY GUARD
        const cleanSignal = extractedText.replace(/\s+/g, ' ').trim();
        
        // Final fallback if everything is thin
        if (cleanSignal.length < 150) {
            $('script, style, noscript, iframe, img, svg, video').remove();
            const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
            if (bodyText.length > cleanSignal.length) return { text: bodyText, title: title.trim(), lowSignal: true };
        }

        if (cleanSignal.length < 100) {
            return { text: '', title: title.trim(), lowSignal: true };
        }

        return { 
            text: cleanSignal, 
            title: title.trim(),
            lowSignal: cleanSignal.length < 300
        };
    } catch (error) {
        throw new Error(`URL Parsing Error: ${error.message}`);
    }
}

export async function parseFile(fileBlob) {
    try {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = fileBlob.name.toLowerCase();

        if (fileName.endsWith('.pdf')) {
            const data = await pdf(buffer);
            return data.text;
        } else if (fileName.endsWith('.txt')) {
            return buffer.toString('utf-8');
        } else {
            throw new Error(`Unsupported file type: ${fileName}. Please upload a PDF or TXT file.`);
        }
    } catch (error) {
        throw new Error(`File Parsing Error: ${error.message}`);
    }
}
