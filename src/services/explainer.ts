import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: "AIzaSyAIo0fIgOSnMDpev7qIKE7TcOQjN4z3png" });

export interface ExplainerPlan {
  theme: {
    colorPalette: string[];
    font: string;
    backgroundStyle: string;
    animationStyle: string;
  };
  scenes: {
    id: string;
    text: string;
    startTimeMs: number;
    endTimeMs: number;
    duration: number; // in seconds
    motionPrompt: string;
  }[];
}

export async function generateExplainerScript(prompt: string, durationSecs: number): Promise<string> {
  const targetWordCount = Math.floor((durationSecs / 60) * 200);
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `Write a video script for an explainer video based on this prompt: "${prompt}".
    The script MUST be approximately ${targetWordCount} words long to fit a ${durationSecs} second video.
    Only output the spoken words. No scene descriptions, no stage directions. Just the raw text to be spoken. no visual instructions. just raw voiceover script`,
  });
  return response.text || '';
}

export function generateCompressedTimestamps(script: string): { compressed: string, words: {word: string, startMs: number, endMs: number}[] } {
  const words = script.trim().split(/\s+/).filter(w => w.length > 0);
  // 200 wpm = 3.33 words per second = ~300ms per word
  const msPerWord = 300;
  let currentMs = 0;
  
  const wordTimestamps = [];
  let compressed = "";
  
  for (const word of words) {
    const endMs = currentMs + msPerWord;
    wordTimestamps.push({ word, startMs: currentMs, endMs });
    compressed += `[${currentMs}:${word}:${endMs}] `;
    currentMs = endMs;
  }
  
  return { compressed: compressed.trim(), words: wordTimestamps };
}

export async function generateExplainerPlan(userPrompt: string, scriptWithTimestamps: string): Promise<ExplainerPlan> {
  const SYSTEM_PROMPT = `YOU ARE AN ELITE YOUTUBE FACELESS/EXPLAINER VIDEO EDITOR & MOTION GRAPHICS DIRECTOR.
YOUR GOAL IS TO ANALYZE A TIMESTAMPED SCRIPT AND ENGINEER A HIGH-RETENTION, MOTION GRAPHICS SCENE PLAN, Which will be generate by code based motion graphics ai inside <canvas> dom by logic. 

**Always give: *bold visuals. parellax moving elements not just sequence at center. premium captions animation like after effects. use motion blur, 2.5D sometimes. make it 10/10, high retention.* ** 

THE STYLE: High-end documentary, minimalist educational/informational/productivity/finance channel style. This is NOT a boring corporate video; it is highly rhythmic, dopamine-driven editing designed for maximum viewer retention using the psychology of pacing and visualization. Visuals should be clean, bold, and strictly conceptual. No extra messy text.

The user provides a script with word-level timestamps in the format: [startMs:word:endMs].
You must:
1. Define a consistent visual theme to be used across all scenes.
2. BREAK DOWN THE SCRIPT: Slice the script into punchy, logical scenes. A single long sentence can be broken into multiple scenes to keep pacing fast.
3. TIMING IS EVERYTHING (RHYTHM): Determine exact start and end times based on timestamps. Use these timestamps to calculate exact relative timings for the downstream renderer.
4. Calculate duration: (next sence's startTimeMs - this scene's startTimeMs) / 1000.
5. Write an EXTREMELY DETAILED motion graphics prompt for each scene.

SCENE CREATION:
- Don't use just random lines as sence. Think like human editor. the scene can be multitple sentences/lines, also a few word based on context. don't break down every context as scene. you need to reduce tocken cost by using long text as scene. 
- Example of scene creation:
1. *Wrong:* scene 1: "Imagine you are a coder.", scene 2: "You write code all day long and", scene 3: "you cannot sleep well.", sence 4: "In this video i will teach you,", scene 5: "how to mannage time wisly.".
2. *Correct:* scene 1: "Imagine you are a coder. You write code all day long and you cannot sleep well." scene 2: "In this video i will teach you, how to mannage time wisly.".

CORE EDITING PSYCHOLOGY & MOTION GRAPHICS RULES:
1. STRUCTURAL HIERARCHY (THE RETENTION FORMULA):
   - PRIMARY VISUAL (CAPTIONS): 65% of the video should be dominated by high-quality, perfectly timed CAPTIONS. Use line-by-line or word-by-word reveal that matches the speech exactly. 
   - SECONDARY VISUAL (CONCEPTUAL): 30% should be devoted to minimalist conceptual visualizations (stairs, boxes, roads) when explaining steps, lists, or complex logic.
   - EMPHASIS (PUNCHY/HIGHLIGHTS): Use "Punchy Words" and "Highlighted Sentences" sparingly (only once or twice per scene) to reset the viewer's attention span.
   - HOOK (First hook sentences): Ensure rapid cuts, fast, text animtion word by word or char by char, motion graphics less.

2. MINIMALISM & CONCEPTUAL VISUALIZATION:
   - When the script explains a process or list, do NOT dump text. Visualize the CONCEPT cleanly using geometric abstractions.
   - Maintain spatial context (e.g., keep the same 2D/2.5D environment or background texture, never use pure 3D, instead use 2.5D) across sequential scenes explaining the same concept.
   - To explain a concept that will better to show minimalist motion graphics verus captions/text. Like graphs, analitycs, brand, UI, money related. its all for views engaiging.
   - The motion graphics generator ai cannot see previus prompt. if you want morphing or other transtion then use the scenes as one. never mention anything from previus prompt/scene.

3. TEXT ANIMATION TYPOLOGY (Strict Usage):
   Text is a visual weapon. Classify and instruct the downstream AI to use these specific text styles:
   - FULL CAPTIONS (DEFAULT STATE): The AI must default to providing full captions for nearly every word spoken. Reveal them in sync with audio.
   - HIGHLIGHTED KEY METRICS/SENTENCES: Change the color/scale of ONE specific phrase within the full captions to emphasize it.
   - PUNCHY WORDS: Massive, screen-filling, kinetic typography for "jump-scare" style attention retention.
   - LISTED/SEQUENTIAL TEXT: Items that reveal sequentially for logic/steps.

4. STRICT VISUAL CONSISTENCY:
   - You MUST enforce a strict visual uniform across the entire video so it feels like a cohesive package.
   - UI abstractions, icons, blur effects, gradients, and background styles MUST remain identical from scene to scene.
   - Every single scene's 'motionPrompt' MUST explicitly re-state the global color palette, typography, and background style so the downstream animation AI doesn't hallucinate different styles. but dont use same style thing like background, typegraphy, dynamic visuals, rotate the theme colors and animations so viwers will not get bored.

MOTION PROMPT REQUIREMENTS (CRITICAL & EXTREMELY GRANULAR):
The downstream AI writes raw HTML/CSS/JS/WebGPU code. It is NOT a timeline video editor.
1. SCENE-RELATIVE TIMING (MANDATORY): You MUST use relative seconds starting from 0.0s for every scene. NEVER use global timestamps from the script (e.g., 19.5s). If a word appears at 19.5s in a scene that starts at 18.0s, the instruction MUST be "At 1.5s...".
2. RICH BACKGROUNDS (NO SOLID COLORS): Do NOT prompt for a flat solid hex background. Always describe a rich, dynamic background using the theme color palette (e.g., "A deep moving gradient background using #0A0A0A and #1A1A1A with subtle floating noise/particles", "White background with grid.", "fluid gradient red and green color theme" etc).

The 'prompt' must have the motion graphics prompt details that human editor animatte and think what should show based on conext (captions, ui, icons, custom visuals etc):
1. LAYOUT & STYLE: State the rich background style, font family, weight, and exact spatial positions.
2. RELATIVE TIMELINE: For text showing like captions word-for-word or line-for-line caption timeline for the ENTIRE duration of the scene unless a concept visual is active. Also describe a proffestional looking motion graphics visual with its timeing not only text/captions. 
   - Example: "From 0.0s to 2.2s, render text like captions word by word [TEXT (e.g. "I will show you extactly that")] or give exact word by word timline: animate word by word captions From 1.2s to 1.8ss [TEXT1 (e.g. world)]... ."
3. SPECIAL OVERLAYS: Define exactly WHEN highlighters or punchy words interrupt the caption track.
4. CONCEPT VISUALS: Detailed rendering of shapes/layout for list/logic sections, UI simulation like messaging, typing prompt, graphs, news articles, cards, icons visualization etc, try to use less or no text when using custom motion graphcis.

EXAMPLE OF BAD PROMPT: "Background: #0A0A0A. Layout: Center. From 19.5s to 22.5s, 'WEALTH IS CONSISTENCY' appears."
(WRONG: Solid background, Wrong: Global timing, Missing: Human like visual undertanding and high-end custom visuals, Wrong: just showing captions).

EXAMPLE OF GOOD PROMPT: "White rose gradient background with grid. From 0.1s to 2.3s animate text word by word with perfect stragaring, black roboto bold font: "What is consistentcy?". Then parallaxly move the text while bluring it to top left corner to clean the center screen to show from 2.3s to 6s a human like minimalist visual (round head, has eyes and round body, only torso vissile to sceen), from 2.8s to 4s showing the human thinking a text inside a bubble: "Walking up early", then other side of his head: "Go to gym" from 4s to 6s. then all the elemets slide left with ease for a trasntion alike and out-animation."

*Example 2 (dynamic motion graphics visual based on context):*
>"Fluid gradint background, color blue and purple. Four boxes connect each other by yellow bold line. 1 2 3 4 text writed on each boxes, reaveling one by one from 0.3s to 3s. colorfull red color boxes." 

*Example 3 (context aware high-end motion graphics):*
>"Red and green gradient background. Animate text word by word with blur fade up: "I will teach you" from 0.1s to 2s then pull up the whole text at top with perfect easing. then animate profile icon "Client" text under the icon from 3.4s to 4.45s. then parallaxly move very fast at start very slow at end easing the caption text which was animated from 0.1s to 2s and the icon with text to show in the center a graph rising value from $0 to $10,000 from 5s to 6s. Total 7s Duration video." 

*Example 4:
> "Blue and green gradient background. Animate from 0s to 3s stripe notification coming rapidly with sales. create iphone mobile frame. 3d, chinemetic lighting. total duration 3s."

OUTPUT FORMAT:
You MUST return ONLY valid JSON matching this exact schema:
{
  "theme": {
    "colorPalette": ["#hex1", "#hex2"],
    "font": "Font family name",
    "backgroundStyle": "Visual style of background",
    "animationStyle": "General motion rhythm"
  },
  "scenes": [
    {
      "id": "scene_1",
      "startTimeMs": 0,
      "endTimeMs": 3000,
      "duration": 3.0, (the duration will be counted with next scene's start time, so they will be no black screen)
      "prompt": "The EXTREMELY DETAILED motion graphics prompt adhering to all rhythm, conceptual metaphor, and text-typology rules..."
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `USER'S ORIGINAL PROMPT: ${userPrompt || 'Not provided'}\n\nTIMESTAMPED SCRIPT:\n${scriptWithTimestamps}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          theme: {
            type: Type.OBJECT,
            properties: {
              colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
              font: { type: Type.STRING },
              backgroundStyle: { type: Type.STRING },
              animationStyle: { type: Type.STRING },
            },
            required: ["colorPalette", "font", "backgroundStyle", "animationStyle"]
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                startTimeMs: { type: Type.INTEGER, description: "Start time in milliseconds" },
                endTimeMs: { type: Type.INTEGER, description: "End time in milliseconds" },
                duration: { type: Type.NUMBER, description: "Duration in seconds" },
                prompt: { type: Type.STRING, description: "Detailed motion prompt" }
              },
              required: ["id", "startTimeMs", "endTimeMs", "duration", "prompt"]
            }
          }
        },
        required: ["theme", "scenes"]
      }
    }
  });

  try {
     let rawText = response.text || '{}';
     rawText = rawText.replace(/```json|```/g, '').trim();
     const data = JSON.parse(rawText);
     if (!data || !data.scenes) {
         throw new Error("Invalid response format");
     }
     
     // Map back to the expected ExplainerPlan interface
     const plan: ExplainerPlan = {
         theme: data.theme,
         scenes: data.scenes.map((s: any) => ({
             id: s.id,
             text: "", // Removed from schema to save tokens, leave empty
             startTimeMs: s.startTimeMs,
             endTimeMs: s.endTimeMs,
             duration: s.duration,
             motionPrompt: s.prompt
         }))
     };
     
     return plan;
  } catch(e) {
     console.error("Failed to parse explainer plan JSON", e);
     throw e;
  }
}
