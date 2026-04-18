import * as cheerio from 'cheerio';
import pdf from 'pdf-parse';

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

// Some job URLs point at a host page (Squarespace, Webflow, company marketing site)
// that only embeds a client-side widget (Ashby, Greenhouse) — the actual job content
// isn't in the HTML. Detect those patterns and resolve to the real job data.
// Returns either { directResult: {...parseUrl result} } or { rewriteUrl: '...' } or null.
async function resolveEmbeddedJobBoard(url) {
    try {
        const u = new URL(url);
        const ashbyJid = u.searchParams.get('ashby_jid');
        const ghJid = u.searchParams.get('gh_jid');
        if (!ashbyJid && !ghJid) return null;
        if (u.hostname === 'jobs.ashbyhq.com' || u.hostname.includes('greenhouse.io')) return null;

        const hostResp = await fetch(url, { headers: { 'User-Agent': SCRAPE_USER_AGENT } });
        if (!hostResp.ok) return null;
        const hostHtml = await hostResp.text();

        if (ashbyJid) {
            const m = hostHtml.match(/ashbyhq\.com\/([a-zA-Z0-9_-]+)\/embed/);
            if (m) {
                console.log(`🔗 Ashby embed detected — rewriting to direct URL (org: ${m[1]})`);
                return { rewriteUrl: `https://jobs.ashbyhq.com/${m[1]}/${ashbyJid}` };
            }
        }

        if (ghJid) {
            const m = hostHtml.match(/boards\.greenhouse\.io\/embed\/job_board\/js\?for=([a-zA-Z0-9_-]+)/);
            if (m) {
                console.log(`🔗 Greenhouse embed detected — calling public API (board: ${m[1]}, job: ${ghJid})`);
                const apiResp = await fetch(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${ghJid}`);
                if (apiResp.ok) {
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
