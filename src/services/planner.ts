import { GoogleGenAI } from '@google/genai';
import { VideoPlan, VideoTemplate } from '../types';

const ai = new GoogleGenAI({ apiKey: "AIzaSyDDCNUXxn8KZqmHf1TJHg7wbKmKCNlu6SA" });

export async function generateSaaSScript(url: string, prompt: string, durationSecs: number): Promise<string> {
  const targetWordCount = Math.floor((durationSecs / 60) * 180); // slightly slower pace for SaaS
  
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: `Analyze this SaaS website (if possible or guess based on URL context): ${url}\n\nWrite a highly engaging, high-converting voiceover script for an ad/promo based on this request: "${prompt}".\nThe script MUST be approximately ${targetWordCount} words to fit a ${durationSecs} sec video.\nOnly output the spoken words. No stage directions or visual cues. Just raw text.`,
    config: { tools: [{ googleSearch: {} }] }
  });
  return response.text || '';
}

export async function generateSaaSPlan(url: string, prompt: string, scriptWithTimestamps: string, template?: VideoTemplate): Promise<VideoPlan> {
  const templateContext = template ? `
CRITICAL INSTRUCTION - USE THE FOLLOWING TEMPLATE:
You have been provided a 'Video Template' named "${template.name}".
The template provides the structural, animation, and camera rules. 
DO NOT invent your own style for these aspects. You MUST combine the brand colors, fonts, and UI traits you extract from the website WITH the specific animation styles below:

${template.plannerPrompt}
` : `
NO TEMPLATE PROVIDED.
You have total creative freedom to decide the structural, animation, and camera rules. Invent a unique, highly engaging motion graphics style that fits the brand perfectly.
`;

  const SYSTEM_PROMPT = `YOU ARE AN ELITE YOUTUBE FACELESS/EXPLAINER VIDEO EDITOR & MOTION GRAPHICS DIRECTOR.
YOUR GOAL IS TO ANALYZE A TIMESTAMPED SCRIPT AND ENGINEER A HIGH-RETENTION, MINIMALIST MOTION GRAPHICS SCENE PLAN. 

THE STYLE: High-end documentary, minimalist productivity/finance channel style. This is NOT a boring corporate video; it is highly rhythmic, dopamine-driven editing designed for maximum viewer retention using the psychology of pacing and visualization. Visuals should be clean, bold, and strictly conceptual. No extra messy text.

WORKFLOW & SYNCHRONIZATION:
1. SCENE PACING: The user provides a script with word-level timestamps ([startMs:word:endMs]). Slice this into punchy, logical scenes. A single long sentence can be broken into multiple scenes to keep pacing fast, or multiple short lines can be one scene if conceptually linked.
2. TIMING IS EVERYTHING (RHYTHM): Use the timestamps to calculate exact relative timings for the downstream renderer. Timing grabs attention more than 10/10 animation.

CORE EDITING PSYCHOLOGY & MOTION GRAPHICS RULES:
1. STRUCTURAL HIERARCHY (THE RETENTION FORMULA):
   - PRIMARY VISUAL (CAPTIONS): 80% of the video should be dominated by high-quality, perfectly timed CAPTIONS. Use line-by-line or word-by-word reveal that matches the speech exactly. 
   - SECONDARY VISUAL (CONCEPTUAL): 20% should be devoted to minimalist conceptual visualizations (stairs, boxes, roads) when explaining steps, lists, or complex logic.
   - EMPHASIS (PUNCHY/HIGHLIGHTS): Use "Punchy Words" and "Highlighted Sentences" sparingly (only once or twice per scene) to reset the viewer's attention span.

2. MINIMALISM & CONCEPTUAL VISUALIZATION:
   - When the script explains a process or list, do NOT dump text. Visualize the CONCEPT cleanly using geometric abstractions.
   - Maintain spatial context (e.g., keep the same 3D environment or background texture) across sequential scenes explaining the same concept.

3. TEXT ANIMATION TYPOLOGY (Strict Usage):
   Text is a visual weapon. Classify and instruct the downstream AI to use these specific text styles:
   - FULL CAPTIONS (DEFAULT STATE): The AI must default to providing full captions for nearly every word spoken. Reveal them in sync with audio.
   - HIGHLIGHTED KEY METRICS/SENTENCES: Change the color/scale of ONE specific phrase within the full captions to emphasize it.
   - PUNCHY WORDS: Massive, screen-filling, kinetic typography for "jump-scare" style attention retention.
   - LISTED/SEQUENTIAL TEXT: Items that reveal sequentially for logic/steps.

4. STRICT VISUAL CONSISTENCY:
   - You MUST enforce a strict visual uniform across the entire video so it feels like a cohesive package.
   - UI abstractions, icons, blur effects, gradients, camera pacing, and background styles MUST remain identical from scene to scene.
   - Every single scene's 'motionPrompt' MUST explicitly re-state the global color palette (hex codes), typography, and background style so the downstream animation AI doesn't hallucinate different styles.

MOTION PROMPT REQUIREMENTS (CRITICAL & EXTREMELY GRANULAR):
The downstream AI writes raw HTML/CSS/JS/WebGPU code. It is NOT a timeline video editor.
1. SCENE-RELATIVE TIMING (MANDATORY): You MUST use relative seconds starting from 0.0s for every scene. NEVER use global timestamps from the script (e.g., 19.5s). If a word appears at 19.5s in a scene that starts at 18.0s, the instruction MUST be "At 1.5s...".
2. RICH BACKGROUNDS (NO SOLID COLORS): Do NOT prompt for a flat solid hex background. Always describe a rich, dynamic background using the theme color palette (e.g., "A deep moving gradient background using #0A0A0A and #1A1A1A with subtle floating noise/particles").

Every 'motionPrompt' MUST be structured like a precise rendering blueprint:
1. LAYOUT & STYLE: State the rich background style, font family, weight, and exact spatial positions.
2. RELATIVE TIMELINE (THE CAPTION TRACK): Provide a word-for-word or line-for-line caption timeline for the ENTIRE duration of the scene unless a concept visual is active. 
   - Example: "From 0.0s to 1.2s, render captions [TEXT1]... From 1.2s to 2.5s, render captions [TEXT2]..."
3. SPECIAL OVERLAYS: Define exactly WHEN highlighters or punchy words interrupt the caption track.
4. CONCEPT VISUALS: Detailed rendering of shapes/layout for list/logic sections.

EXAMPLE OF BAD PROMPT: "Background: #0A0A0A. Layout: Center. From 19.5s to 22.5s, 'WEALTH IS CONSISTENCY' appears..."
(WRONG: Solid background, Wrong: Global timing, Missing: Full captions track).

EXAMPLE OF PERFECT PROMPT: "Dynamic background: radial gradient of #0A0A0A to #161616. Inter Bold white text. 
RELATIVE TIMELINE (Sync with audio):
- 0.0s to 1.5s: Full captions '2026 is almost' at absolute center.
- 1.5s to 3.0s: Full captions 'here. Want to' at absolute center.
- 3.0s to 4.5s: PUNCHY kinetic text 'GET RICH?' fills 80% screen with #00FF9D glow.
- 4.5s to 7.0s: Transition to conceptual minimalist 3D staircase. Step markers 1, 2, 3 reveal at 4.8s, 5.5s, 6.2s."

${templateContext}

OUTPUT FORMAT:
You MUST return ONLY valid JSON matching this schema:
{
  "script": "The full voiceover script string...",
  "theme": {
    "colorPalette": ["#hex", "#hex"],
    "font": "Font family",
    "backgroundStyle": "Desc",
    "animationStyle": "Desc"
  },
  "scenes": [
    {
      "id": "scene_1",
      "sentence": "The exact sentence from the script for this scene.",
      "startTimeMs": 0,
      "endTimeMs": 3000,
      "duration": 3.0,
      "motionPrompt": "The EXTREMELY DETAILED motion graphics prompt adhering to all rhythm, conceptual metaphor, and text-typology rules..."
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: `Website URL: ${url}\nUser Request: ${prompt}\n\nTIMESTAMPED SCRIPT:\n${scriptWithTimestamps}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      temperature: 0.7,
      responseMimeType: "application/json"
    }
  });

  try {
    let jsonText = response.text || '{}';
    return JSON.parse(jsonText) as VideoPlan;
  } catch (e) {
    console.error("Failed to parse video plan JSON", e);
    throw new Error("Failed to generate video plan.");
  }
}
