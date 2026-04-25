export interface SFXCue {
  name: string;
  startTimeMs: number;
  endTimeMs?: number;
  volume?: number;
}

export interface ScenePlan {
  id: string;
  sentence: string;
  motionPrompt: string;
  startTimeMs: number;
  endTimeMs: number;
  duration?: number;
}

export interface VideoPlan {
  script: string;
  theme?: {
    colorPalette: string[];
    font: string;
    backgroundStyle: string;
    animationStyle: string;
  };
  scenes: ScenePlan[];
}

export interface TimedScene extends ScenePlan {
  duration: number;
  startTime: number;
  endTime: number;
}

export interface GeneratedScene extends TimedScene {
  htmlUrl: string;
  code: string;
  sfxCues: SFXCue[];
}

export interface ExplainerScenePlan {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  duration: number;
  motionPrompt: string;
}

export interface ExplainerPlan {
  theme: {
    colorPalette: string[];
    font: string;
    backgroundStyle: string;
    animationStyle: string;
  };
  scenes: ExplainerScenePlan[];
}

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  plannerPrompt: string; // The detailed instructions for the Planner AI on how to structure the video and animation styles
}
