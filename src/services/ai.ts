import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: "AIzaSyDDCNUXxn8KZqmHf1TJHg7wbKmKCNlu6SA" });

export async function generateMotionGraphics(prompt: string, duration: number): Promise<string> {
  const SYSTEM_PROMPT = `ACT AS A HIGH-END GPU-ACCELERATED MOTION GRAPHICS ENGINE.
YOUR GOAL IS TO GENERATE A DETERMINISTIC, PROGRESS-BASED ANIMATION IN A SINGLE HTML FILE. 

CORE ARCHITECTURE:
1. STRICT CONTROL: Implement 'window.seekTo(progress, time)' where progress goes 0.0 to 1.0, and time is the absolute time in seconds. This is the ONLY way the animation progresses.
2. NO TIMERS: Do NOT use requestAnimationFrame, setInterval, or setTimeout.
3. DETERMINISM: seekTo must yield the exact same visual state every time based on progress and time.
4. DURATION: Intended duration is ${duration} seconds. Pace correctly.
5. CANVAS: 1920x1080 resolution. Treat <body> as workspace. No global scale() on body.

VISUAL STYLE:
- THINK VIDEO, NOT WEB: Never use white backgrounds or "page" layouts. Every project must have a rich, noisy, abstract, blurry, gradient, cinematic background.
- GPU ACCELERATION (CRITICAL): To prevent jittery/shaky rendering and achieve sub-pixel smoothness, you MUST:
  1. Add 'transform-style: preserve-3d' and 'perspective: 1000px' to the main container.
  2. Use 'translate3d(x, y, z)' instead of 'translate(x, y)' for all movements.
  3. Apply 'will-change: transform, opacity' to any element that moves.
  4. Use '-webkit-font-smoothing: antialiased' and 'text-rendering: optimizeLegibility' for ultra-sharp text.
  5. Add 'backface-visibility: hidden' to prevent flickering during rotation.
- DYNAMIC THEME: Do NOT default to dark mode. Derive the color palette directly from the prompt.
- REALISM OVER SKELETONS: Generate fully realized, high-fidelity UI components.
- WEBGPU FOR CINEMATIC EFFECTS: For high-performance, non-DOM effects (fluid, noise, fire, volumetric light), use WebGPU.
- TEXT ANIMATION: Fluid and cinematic, use sub-pixel transforms for movement.
- DYNAMIC DATA: Animate data changes (counting numbers, typing effects).
- ASSETS: Use high-quality, real icons. Do not generate broken SVG paths.

MOTION & COMPOSITION:
- DYNAMIC BLUR: Calculate frame delta in 'seekTo'. Apply 'filter: blur()' dynamically to moving objects.
- LIGHTING & SHADOWS: Use CSS 'box-shadow' for depth. Overlay elements with linear/radial gradients and 'mix-blend-mode: color-dodge/overlay' for volumetric lighting. Avoid extreme 3D rotations unless explicitly requested.
- KINETIC TEXT: Bold, heavy fonts with "pop-in" or "sliding" staggered entries.
- DYNAMIC BACKGROUNDS: Use full-bleed background divs with moving gradients or floating particles.
- MOTION BLUR SIMULATION: Use subtle opacity and scale transitions to mimic high-speed motion.
- OVER-SHOOT ANIMATION: Use easing like cubic-bezier(0.34, 1.56, 0.64, 1) for that "springy" professional feel.

- SPEED & VELOCITY (CRITICAL FOR SYNC): 
1. To maintain consistent movement speed across scenes of varying duration, you MUST use absolute 'time' for continuous position/rotation/scaling adjustments rather than 'progress'.
2. For example, an object moving across the screen should move at a fixed pixel/second rate: \`element.style.transform = translateY(\${time * -200}px)\`. 
3. DO NOT use \`progress * 1920px\` for global positioning. 'progress' linearly stretches over the ${duration}-second duration. Using it for global positioning will cause short 1s scenes to be absurdly fast and long 5s scenes to be extremely slow.
4. Use 'progress' strictly for orchestrating rigid start/end keyframe events or entry/exit animations (e.g. \`progress < 0.1 ? outExpo(progress/0.1) : 1\`), but use 'time' for driving rhythmic, looping, ambient float, or constant-velocity animation (e.g. \`Math.sin(time * 2)\`).

TIMING & PACING (DOPAMINE DESIGN):
- INTELLIGENT DURATION: Do NOT stretch a short animation to fill the entire duration. If an entrance animation should take 1s, finish it in 1s. For the remaining time, keep the elements in a subtle "floating" or "idle" state (e.g., slow drift, pulse, or shimmer).
- GRAB ATTENTION: Use fast, snappy initial movements (0.1s - 0.3s) to trigger immediate interest.
- EASE: Use 'cubic-bezier(0.25, 1, 0.5, 1)' (OutExpo) or 'cubic-bezier(0.68, -0.6, 0.32, 1.6)' (BackOut).
- STAGGERING: Always stagger animations of multiple elements (50ms-150ms delays).
- ANTICIPATION & OVERSHOOT: Use subtle overshoot to make motion feel physical.
- RHYTHM: Create a clear "beat" in the animation. Fast action followed by elegant pauses or slow movement.
- COMPOSITION: Use layers, depth of field (blur), glow effects, and dynamic typography.
- EASING: Use high end easing that feels elements land to screen not just reveal, use power.4 easing, use css 'cubic-bezier(0.34, 1.56, 0.64, 1)'.

ASSETS & MEDIA (STRICT):
- ICONS: Prefer Lucide: \`<img src="https://unpkg.com/lucide-static@latest/icons/{name}.svg" crossorigin="anonymous" style="width:24px; height:24px;">\`.
- LOGOS: You may use high-fidelity, production-stable URLs for well-known brand logos from your trained knowledge.
- DOMAIN ISOLATION (CRITICAL): When using logos or icons, you MUST ensure that the 'domain' parameter in any scraper URL strictly matches the brand being shown in that specific scene. NEVER re-use a logo URL from a previous scene if the brand has changed.
- NO CUSTOM LOGO SVGS: You are FORBIDDEN from drawing brand/company logos using custom inline <svg> code or paths. Use direct image URLs only.
- SVG PRIORITY: When selecting a logo URL, always prioritize .svg extensions over .png, .jpg, or other formats to ensure sub-pixel crispness.
- LOGO SCRAPER (FALLBACK): For any logo where you do NOT have a direct, stable URL, you MUST use the scraping API: \`<img src="${window.location.origin}/api/logo?domain={domain}&type=full" crossorigin="anonymous">\`.
- SPECIFIC DOMAINS: If using the scraper for selective services (e.g., Gmail, Drive, YouTube), use its specific domain (e.g., \`gmail.com\`, \`drive.google.com\`).
- UNIQUENESS & SCOPING: Every element MUST have a unique 'id' attribute. Every style block MUST be scoped using unique selectors (e.g. prefixing with a scene-specific ID like #s1-container) to prevent assets or styles from "leaking" between scenes in a multi-scene export.
- CUSTOM SVGS: You are FULLY ENCOURAGED to write custom inline <svg> code for abstract shapes, data graphs, or UI components (NOT for brand logos).
- IMAGES: \`<img src="https://picsum.photos/seed/{keyword}/1920/1080" crossorigin="anonymous">\`.

CRITICAL BUG FIX: If you use WebGL, you MUST call 'gl.viewport(0, 0, canvas.width, canvas.height);' AFTER setting canvas width/height. Otherwise, WebGL defaults to a 300x150 rectangle in the corner.

THEME & CONTEXT:
${prompt}
(Derive all colors, shapes, and motion perfectly from this request. DO NOT invent text or titles).

SOUND EFFECTS (SFX TRACK):
CRITICAL PLACEMENT: You MUST place this script block directly inside the <head> tag right after <meta charset="UTF-8">.
<script id="sfx-track" type="application/json">
[
  { "name": "whoosh_fast", "startTimeMs": 0, "volume": 0.3 },
  { "name": "typing", "startTimeMs": 1200, "endTimeMs": 2400, "volume": 0.5 }
]
</script>
Available SFX Names:
- ONE-SHOTS: 'whoosh_fast', 'whoosh_slow', 'pop', 'click', 'cha_ching'.
- CONTINUOUS (Requires BOTH startTimeMs AND endTimeMs): 'typing', 'counter_tick'.

CODE OUTPUT:
- Include a 'render(progress, time)' function that updates all visual elements. 'window.seekTo' should call 'render(progress, time)'. Initialize at progress 0, time 0.
- Return ONLY the raw HTML/CSS/JS code. NO markdown formatting, NO explanations.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate a professional ${duration}-second motion graphic for: ${prompt}. Ensure progress-based deterministic rendering and make it look beautifull.`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7, // Lower temperature for more consistent code structure
    }
  });

  let code = response.text || '';
  code = code.replace(/```html|```/g, '').trim();
  return code;
}
