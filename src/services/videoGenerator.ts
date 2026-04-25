import { generateCanvasMotion } from './canvasAi';
import { TimedScene, GeneratedScene, SFXCue } from '../types';

function parseSFXTrack(code: string): SFXCue[] {
  const match = code.match(/<script\s+id="sfx-track"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (match && match[1]) {
    let jsonStr = match[1].trim();
    try {
      return JSON.parse(jsonStr);
    } catch(e) {
      // Attempt 1: Fix trailing commas before closing brackets/braces
      try {
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(jsonStr);
      } catch (e2) {
        // Attempt 2: Force close a truncated array
        try {
          if (!jsonStr.endsWith(']')) jsonStr += ']';
          return JSON.parse(jsonStr);
        } catch (e3) {
          console.error("Failed to parse SFX track, even with recovery attempts.", e3);
        }
      }
    }
  }
  return [];
}

export async function generateAllScenes(
  scenes: TimedScene[], 
  onProgress: (current: number, total: number, status: string) => void
): Promise<GeneratedScene[]> {
  const generated: GeneratedScene[] = [];
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    onProgress(i + 1, scenes.length, `Rendering Scene ${i + 1}: ${scene.sentence.substring(0, 30)}...`);
    
    try {
      const rawCode = await generateCanvasMotion(scene.motionPrompt, scene.duration);
      
      let cleanCode = rawCode;
      const mdMatch = rawCode.match(/```(?:html|javascript|js)?\n([\s\S]*?)```/i) || rawCode.match(/```([\s\S]*?)```/);
      if (mdMatch) {
        cleanCode = mdMatch[1];
      }
      cleanCode = cleanCode.replace(/```/g, '').trim();

      // Ensure boilerplate
      const blobContent = cleanCode.toLowerCase().includes('<!doctype html') || cleanCode.toLowerCase().includes('<html') 
        ? cleanCode 
        : `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${cleanCode}</body></html>`;

      const blob = new Blob([blobContent], { type: 'text/html;charset=utf-8' });
      const htmlUrl = URL.createObjectURL(blob);
      const sfxCues = parseSFXTrack(cleanCode);
      
      generated.push({
        ...scene,
        code: cleanCode,
        htmlUrl,
        sfxCues
      });
      
      onProgress(i + 1, scenes.length, `Rendered Scene ${i + 1} (${i + 1}/${scenes.length} complete)`);
    } catch (error) {
      console.error(`Failed to generate scene ${i + 1}`, error);
      throw error;
    }
  }
  
  return generated;
}
