import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as cheerio from "cheerio";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import multer from "multer";
import { AssemblyAI } from "assemblyai";

const upload = multer({ storage: multer.memoryStorage() });
const aai = new AssemblyAI({ apiKey: "d266f29e127a4d1ea9279e37451a0bfe" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory cache to ensure we only scrape/fetch once
  const logoCache = new Map<string, { iconUrl: string, logoUrl: string }>();
  const imageBufferCache = new Map<string, { buffer: Buffer, contentType: string }>();

  async function scrapeLogos(domain: string) {
    if (logoCache.has(domain)) return logoCache.get(domain)!;

    const url = domain.startsWith("http") ? domain : `https://${domain}`;
    const response = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' 
      } 
    });
    const finalUrl = response.url;
    const html = await response.text();
    const $ = cheerio.load(html);
    const baseUrl = new URL(finalUrl);
    
    console.log(`[API/Logo] Scraping ${domain} -> Final URL: ${finalUrl}`);
    
    // 1. Scrape icon
    let iconHref = '';
    const iconSelectors = [
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]',
      'link[rel="icon"][sizes="512x512"]',
      'link[rel="icon"][sizes="500x500"]',
      'link[rel="icon"][sizes="256x256"]',
      'link[rel="icon"][sizes="192x192"]',
      'link[rel="shortcut icon"]',
      'link[rel="icon"]'
    ];
    for (const selector of iconSelectors) {
      const href = $(selector).attr('href');
      if (href) {
        iconHref = href;
        break;
      }
    }
    if (!iconHref) iconHref = '/favicon.ico';
    const iconUrl = iconHref.startsWith('http') ? iconHref : new URL(iconHref, baseUrl).toString();

    // 2. Scrape main logo
    let logoUrl = '';
    
    // Priority 1: Images explicitly wrapping the homepage link in the header
    const primaryImgSelectors = [
      'header a[href="/"] img',
      'nav a[href="/"] img',
      '[class*="header" i] a[href="/"] img',
      '[class*="nav" i] a[href="/"] img',
      'a.logo img',
      'a.brand img',
      'a[aria-label*="logo" i] img'
    ];
    
    for (const selector of primaryImgSelectors) {
      const img = $(selector).first();
      if (img.length) {
        const src = img.attr('src') || img.attr('data-src');
        if (src) {
          logoUrl = src.startsWith('http') ? src : new URL(src, baseUrl).toString();
          console.log(`[API/Logo] Found logo via priority selector: ${selector}`);
          break; 
        }
      }
    }

    // Priority 2: Inline SVGs explicitly wrapping the homepage link
    if (!logoUrl) {
      const primarySvgSelectors = [
        'header a[href="/"] svg',
        'nav a[href="/"] svg',
        '[class*="header" i] a[href="/"] svg',
        'a.logo svg',
        'a.brand svg',
        'a[aria-label*="logo" i] svg'
      ];
      for (const selector of primarySvgSelectors) {
        const inlineSvg = $(selector).first();
        if (inlineSvg.length) {
          if (!inlineSvg.attr('xmlns')) {
            inlineSvg.attr('xmlns', 'http://www.w3.org/2000/svg');
          }
          const svgContent = $('<div>').append(inlineSvg.clone()).html();
          logoUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent || '').toString('base64')}`;
          console.log(`[API/Logo] Found logo via inline SVG priority: ${selector}`);
          break;
        }
      }
    }

    // Priority 3: Fallback Header Image Lookups
    if (!logoUrl) {
      const secondaryImgSelectors = [
        'header img[alt*="logo" i]',
        'nav img[alt*="logo" i]',
        'header img[src*="logo" i]',
        'nav img[src*="logo" i]',
      ];
      for (const selector of secondaryImgSelectors) {
        const img = $(selector).first();
        if (img.length) {
          const src = img.attr('src') || img.attr('data-src');
          if (src) {
            logoUrl = src.startsWith('http') ? src : new URL(src, baseUrl).toString();
            console.log(`[API/Logo] Found logo via secondary img fallback: ${selector}`);
            break; 
          }
        }
      }
    }

    // Priority 4: Final Fallback global images
    if (!logoUrl) {
       const globalImgSelectors = [
         'img[alt*="logo" i]',
         'img[src*="logo" i]'
       ];
       for (const selector of globalImgSelectors) {
          const img = $(selector).first();
          if (img.length) {
            const src = img.attr('src') || img.attr('data-src');
            if (src) {
              logoUrl = src.startsWith('http') ? src : new URL(src, baseUrl).toString();
              console.log(`[API/Logo] Found logo via desperation fallback: ${selector}`);
              break; 
            }
          }
       }
    }

    if (!logoUrl) {
        const ogImg = $('meta[property="og:image"]').attr('content');
        if (ogImg) {
            logoUrl = ogImg.startsWith('http') ? ogImg : new URL(ogImg, baseUrl).toString();
            console.log(`[API/Logo] Found logo via OpenGraph fallback`);
        }
    }

    const result = { iconUrl, logoUrl: logoUrl || iconUrl };
    logoCache.set(domain, result);
    return result;
  }

  // Unified API route for scraping and proxying logos
  app.get("/api/logo", async (req, res) => {
    const domain = req.query.domain as string;
    const type = (req.query.type as string) || "full"; // "full" or "icon"

    console.log(`[API/Logo] Request received for domain: ${domain}, type: ${type}`);

    if (!domain) {
      console.log(`[API/Logo] Missing domain`);
      return res.status(400).send("Domain is required");
    }

    try {
      const urls = await scrapeLogos(domain);
      const targetUrl = type === "icon" ? urls.iconUrl : urls.logoUrl;
      console.log(`[API/Logo] Scraped targetUrl: ${targetUrl}`);

      // Create a brand-isolated cache key to prevent collision
      const cacheKey = `${domain}:${type}`;

      // Handle data URIs (inline SVGs)
      if (targetUrl.startsWith('data:')) {
         const match = targetUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
         if (match) {
           res.setHeader('Content-Type', match[1]);
           res.setHeader('Access-Control-Allow-Origin', '*');
           // Reduce TTL to allow recovery from prompt iterations
           res.setHeader('Cache-Control', 'public, max-age=3600');
           console.log(`[API/Logo] Sending data URI base64 buffer for ${domain}`);
           return res.send(Buffer.from(match[2], 'base64'));
         }
      }

      // Check image cache with isolated key
      if (imageBufferCache.has(cacheKey)) {
         const cached = imageBufferCache.get(cacheKey)!;
         res.setHeader('Content-Type', cached.contentType);
         res.setHeader('Access-Control-Allow-Origin', '*');
         res.setHeader('Cache-Control', 'public, max-age=3600');
         console.log(`[API/Logo] Sending cached buffer for ${domain}`);
         return res.send(cached.buffer);
      }

      // Fetch and proxy the image to bypass CORS and prevent tainted canvas
      const imgRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch image: ${imgRes.statusText}`);
      }

      const contentType = imgRes.headers.get('content-type') || 'image/png';
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      imageBufferCache.set(cacheKey, { buffer, contentType });

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      console.log(`[API/Logo] Fetched and sending buffer of size ${buffer.length} for ${domain}`);
      res.send(buffer);
    } catch (err: any) {
      console.error(`[API/Logo] Error processing logo for ${domain}:`, err.message);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      // Return a transparent fallback SVG on error
      res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
    }
  });

  app.post("/api/voiceover", async (req, res) => {
    try {
      const { script, voice } = req.body;
      if (!script) {
        return res.status(400).json({ error: "Script is required" });
      }

      console.log(`[API/Voiceover] Generating TTS for script using EdgeTTS...`);
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice || "en-US-ChristopherNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
          wordBoundaryEnabled: true
      });
      const { audioStream, metadataStream } = tts.toStream(script);
      
      const audioChunks: Buffer[] = [];
      const metaChunks: Buffer[] = [];
      
      audioStream.on('data', (c) => audioChunks.push(c));
      metadataStream.on('data', (c) => metaChunks.push(c));

      await new Promise((resolve) => audioStream.on('end', resolve));
      
      const audioBuffer = Buffer.concat(audioChunks);
      const audioBase64 = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
      console.log(`[API/Voiceover] Audio generated. Size: ${audioBuffer.length} bytes`);

      let metaRaw = Buffer.concat(metaChunks).toString('utf-8');
      metaRaw = metaRaw.replace(/}{/g, '},{');
      let metaObj = [];
      try {
        metaObj = metaRaw ? JSON.parse('[' + metaRaw + ']') : [];
      } catch(e) {}

      const words: any[] = [];
      let compressed = "";
      metaObj.forEach((block: any) => {
          if(block.Metadata) {
              block.Metadata.forEach((m: any) => {
                  if (m.Type === "WordBoundary") {
                      const startMs = Math.floor(m.Data.Offset / 10000);
                      const endMs = startMs + Math.floor(m.Data.Duration / 10000);
                      const word = m.Data.text.Text;
                      words.push({ word, startMs, endMs });
                      compressed += `[${startMs}:${word}:${endMs}] `;
                  }
              });
          }
      });

      if (!compressed.trim()) {
          throw new Error("No WordBoundary data extracted from Edge TTS, fallback required.");
      }

      res.json({
        audioUrl: audioBase64,
        compressed: compressed.trim(),
        words: words
      });
    } catch (error: any) {
      console.error("[API/Voiceover] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file uploaded" });
      }

      console.log(`[API/Transcribe] Uploading uploaded audio to AssemblyAI...`);
      // Use AssemblyAI to upload and transcribe
      const uploadedFile = await aai.files.upload(req.file.buffer);

      console.log(`[API/Transcribe] Audio uploaded. Starting transcription...`);
      const transcript = await aai.transcripts.transcribe({
        audio: uploadedFile
      });

      if (transcript.status === 'error') {
        throw new Error(transcript.error);
      }

      let compressed = "";
      const words: any[] = [];
      if (transcript.words) {
        transcript.words.forEach(w => {
          words.push({ word: w.text, startMs: w.start, endMs: w.end });
          compressed += `[${w.start}:${w.text}:${w.end}] `;
        });
      }

      res.json({
        script: transcript.text,
        compressed: compressed.trim(),
        words: words
      });
    } catch (error: any) {
      console.error("[API/Transcribe] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
