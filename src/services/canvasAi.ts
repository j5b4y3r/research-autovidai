import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: "AIzaSyAlGorGfUpFH4BMOEvQAvcWnrsEr85Dt-c" });

export async function generateCanvasMotion(prompt: string, duration: number = 5): Promise<string> {
  const SYSTEM_PROMPT = `
ROLE: Expert Motion Graphics Designer.
CORE TASK: Create a high-end 1920x1080 Canvas 2D motion scene.
DYNAMIC DURATION RULES:
1. DURATION: Determine 'window.TOTAL_FRAMES' based on the prompt. (e.g., fps x duration).
2. FPS: Always set 'window.FPS = 30'.
3. REQUIRED: Implement 'window.seekTo = (frame) => { ... }' globally to draw the exact frame.
4. NO LOOPS: Code must be static. No internal requestAnimationFrame.
5. SYNC: MUST call 'window.parent.postMessage({type: "SYNC_DURATION", frames: window.TOTAL_FRAMES, fps: window.FPS}, "*")' at the end.
6. OUTPUT: One full, clean HTML/JS file. No markdown text outside the code block.

AESTHETICS & PERFORMANCE:
- Use high-end rythmic easing not linear, like string, bounce, power.4, custom easing curve.
- Avoid linear motion unless naturally required.
- Ensure 30FPS performance by keeping render cycles efficient.
- Ensure body styling is 'margin: 0; padding: 0; overflow: hidden; background: #000;'.
- Never use linear or just easeInOut eaasing, use Elastic, bounce, string, power.4 custom easing.
- Premium captions animation like after effect. use motion blur, 2.5D sometimes. make it 10/10, high retention.

**When generating Canvas text drawing or elements need perfect positioning code, follow these strict layout rules:**
- Virtual Bounding Boxes: Before drawing, calculate a virtual bounding box for each element. Assume a standard character width of 0.6×fontSize for calculations.
- Vertical Rhythm: Use a 'Line Height' of 1.2×fontSize to prevent vertical overlapping.
- Padding & Margins: Maintain a minimum 'Safety Margin' of 40px between separate text blocks.
- Anchor Points: Always use ctx.textAlign = 'center' and ctx.textBaseline = 'middle' for centered elements to ensure coordinates represent the true center, not the top-left corner.
- Screen Safety: Never place text outside the 'Title Safe Area' (the inner 90% of the canvas).

SOUND EFFECTS (SFX):
You MUST output a valid JSON array at the very bottom of the HTML file inside this tag:
<script id="sfx-track" type="application/json">
[
  { "name": "whoosh_fast", "startTimeMs": 0, "volume": 0.3 },
  { "name": "typing", "startTimeMs": 1200, "endTimeMs": 2400, "volume": 0.5 }
]
</script>
Available SFX Names:
- ONE-SHOTS: 'whoosh_fast', 'whoosh_slow', 'pop', 'pop_fast', 'mouse_click', 'cha_ching', 'impact_fast', 'impact_slow', 'camera_sutter', 'notification', 'ding', 'error_glitch'. (ONLY use startTimeMs)
- CONTINUOUS: 'typing', 'counter_tick', 'swoosh_sfx', 'riser_metallic'. (Requires BOTH startTimeMs AND endTimeMs)
Map the 'startTimeMs' exactly to when energetic visual moments occur (e.g. text pops, quick pans).
`;

  try {
    const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preveiw',
    contents: `Generate a professional 1920x1080 Canvas 2D motion for: ${prompt}. Determine duration dynamically based on the rhythm.`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.8,
    }
  });

  return response.text || '';
  } catch {
    return `<!DOCTYPE html>
              <html lang="en">
              <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Coaching Clients Motion Graphics</title>
                  <style>
                      body {
                          margin: 0;
                          padding: 0;
                          overflow: hidden;
                          background-color: #fff;
                      }
                      canvas {
                          display: block;
                          width: 100vw;
                          height: 100vh;
                      }
                  </style>
              </head>
              <body>
                <canvas id="canvas"></canvas>

                <script>
              </body>
              </html>
`;
  }
  
}

/*
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          contents: [{ parts: [{ text: `1920x1080 Canvas 2D motion for: ${prompt}. Remember: NO WebGL/WebGPU.` }] }],
                          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
                  })
          });

  const result = await response.json();
  let code = result.candidates[0].content.parts[0].text.replace(/```html|```/g, '').trim();
  return code;
  
}                
*/

