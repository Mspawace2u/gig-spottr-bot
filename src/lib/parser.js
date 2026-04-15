import * as cheerio from 'cheerio';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export async function parseUrl(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
            const { PDFParse } = require('pdf-parse');
            const parser = new PDFParse({ data: buffer });
            const data = await parser.getText();
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
