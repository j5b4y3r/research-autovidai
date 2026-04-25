import React from 'react';
import { Loader2 } from 'lucide-react';

interface HeaderProps {
  prompt: string;
  setPrompt: (p: string) => void;
  duration: number;
  setDuration: (d: number) => void;
  fps: number;
  setFps: (f: number) => void;
  isGenerating: boolean;
  onGenerate: () => void;
}

export function Header({ prompt, setPrompt, duration, setDuration, fps, setFps, isGenerating, onGenerate }: HeaderProps) {
  return (
    <div className="shrink-0 p-4 flex flex-wrap gap-4 justify-between items-center bg-[#0f0f0f]/85 backdrop-blur-md border-b border-white/5 z-50">
      <div className="flex items-center gap-4">
        <h1 className="text-xs font-black tracking-[0.4em] uppercase text-zinc-500 hidden sm:block">Motion_Engine.v2</h1>
      </div>
      
      <div className="flex-1 max-w-[500px] min-w-[250px]">
        <div className="flex gap-2 p-1 bg-black/50 rounded-full border border-white/10 focus-within:border-white/20 transition-colors">
          <input 
            type="text" 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
            placeholder="Describe the scene..." 
            className="bg-transparent flex-1 px-4 text-sm outline-none text-white placeholder:text-zinc-600 min-w-0"
          />
          <button 
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed px-5 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all flex items-center gap-2 shrink-0"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            RENDER
          </button>
        </div>
      </div>

      <div className="text-[10px] font-mono text-zinc-500 uppercase hidden md:block w-24 text-right">
        Status: <span className={isGenerating ? "text-yellow-500" : "text-green-500"}>
          {isGenerating ? "Rendering" : "Ready"}
        </span>
      </div>
    </div>
  );
}
