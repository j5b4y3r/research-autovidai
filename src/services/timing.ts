import { ScenePlan, TimedScene } from '../types';

export function calculateSceneTimings(scenes: ScenePlan[]): TimedScene[] {
  const WORDS_PER_SECOND = 4.5; // ~150 words per minute
  const OVERLAP_SECONDS = 0.15; // ~4-5 frames at 30fps for smooth transition overlap
  
  let currentTime = 0;

  return scenes.map((scene, index) => {
    const wordCount = scene.sentence.split(/\s+/).length;
    // Base duration based on word count, minimum 2 seconds so it doesn't flash too fast
    const baseDuration = Math.max(wordCount / WORDS_PER_SECOND, 2.0);
    
    // Add overlap time so the scene extends slightly into the next
    const isLastScene = index === scenes.length - 1;
    const duration = isLastScene ? baseDuration : baseDuration + OVERLAP_SECONDS;
    
    const startTime = currentTime;
    const endTime = startTime + duration;
    
    // Next scene starts before this one ends (creating the overlap)
    currentTime = endTime - OVERLAP_SECONDS;

    return {
      ...scene,
      duration,
      startTime,
      endTime
    };
  });
}
