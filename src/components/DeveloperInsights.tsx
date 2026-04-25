import React, { useState } from 'react';
import { VideoPlan, ExplainerPlan, GeneratedScene } from '../types';
import { ChevronDown, ChevronRight, Code, FileText, Layout } from 'lucide-react';

interface DeveloperInsightsProps {
  plan: VideoPlan | ExplainerPlan | null;
  generatedScenes: GeneratedScene[];
}

export function DeveloperInsights({ plan, generatedScenes }: DeveloperInsightsProps) {
  const [activeTab, setActiveTab] = useState<'plan' | 'scenes'>('plan');
  const [expandedScene, setExpandedScene] = useState<string | null>(null);

  if (!plan && !generatedScenes.length) return null;

  const isExplainer = plan && 'theme' in plan;
  const scriptContent = isExplainer ? plan.scenes.map(s => s.text).join(' ') : (plan as VideoPlan)?.script;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a] border-l border-white/5 w-[400px]">
      <div className="flex border-b border-white/5 bg-black/40">
        <button
          onClick={() => setActiveTab('plan')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'plan' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <FileText className="w-3 h-3" />
          Planner Data
        </button>
        <button
          onClick={() => setActiveTab('scenes')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'scenes' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Layout className="w-3 h-3" />
          Motion Code
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        {activeTab === 'plan' && plan && (
          <div className="space-y-6">
            <section>
              <h3 className="text-[10px] uppercase tracking-tighter text-zinc-600 font-bold mb-2 flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                Voiceover Script
              </h3>
              <div className="bg-white/5 rounded-lg p-3 text-sm text-zinc-300 leading-relaxed font-serif italic border border-white/5">
                "{scriptContent}"
              </div>
            </section>

            <section>
              <h3 className="text-[10px] uppercase tracking-tighter text-zinc-600 font-bold mb-2 flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                Scene Breakdown ({plan.scenes.length})
              </h3>
              <div className="space-y-2">
                {plan.scenes.map((scene, i) => (
                  <div key={scene.id} className="bg-white/5 border border-white/5 rounded-lg overflow-hidden">
                    <div className="p-3 bg-white/[0.02] border-b border-white/5 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-blue-400">SCENE {i + 1}</span>
                    </div>
                    <div className="p-3 text-xs text-zinc-300">
                      {'text' in scene ? scene.text : scene.sentence}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'scenes' && (
          <div className="space-y-2">
            {!generatedScenes.length && (
              <div className="text-center py-12 text-zinc-600 text-xs italic">
                Waiting for scenes to finish rendering...
              </div>
            )}
            {generatedScenes.map((scene, i) => (
              <div key={scene.id} className="border border-white/5 rounded-lg overflow-hidden bg-white/[0.02]">
                <button
                  onClick={() => setExpandedScene(expandedScene === scene.id ? null : scene.id)}
                  className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-zinc-500">#{i + 1}</span>
                    <span className="text-xs text-zinc-300 font-medium truncate max-w-[200px]">{scene.sentence}</span>
                  </div>
                  {expandedScene === scene.id ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />}
                </button>
                
                {expandedScene === scene.id && (
                  <div className="p-4 bg-black/40 border-t border-white/5 space-y-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-blue-400/70 uppercase mb-2 flex items-center gap-2">
                        <Code className="w-3 h-3" />
                        AI Instruction Prompt
                      </h4>
                      <div className="text-[11px] text-zinc-500 bg-black/20 p-2 rounded border border-white/5 font-mono leading-relaxed">
                        {scene.motionPrompt}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-[10px] font-bold text-blue-400/70 uppercase mb-2">Generated HTML (Source)</h4>
                      <div className="relative group">
                        <pre className="text-[9px] text-zinc-600 bg-black/20 p-2 rounded border border-white/5 font-mono overflow-auto max-h-[150px] leading-tight">
                          {scene.code}
                        </pre>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(scene.code);
                          }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-blue-600 text-white text-[9px] px-2 py-1 rounded transition-opacity"
                        >
                          COPY
                        </button>
                      </div>
                    </div>

                    {scene.sfxCues && scene.sfxCues.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase mb-2 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></div>
                          SFX Logic Track ({scene.sfxCues.length})
                        </h4>
                        <div className="space-y-1">
                          {scene.sfxCues.map((cue, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white/[0.03] p-1.5 rounded border border-white/5 text-[10px]">
                              <span className="font-mono text-purple-300 uppercase">{cue.name}</span>
                              <div className="flex gap-3 text-zinc-500 font-mono">
                                <span>{cue.startTimeMs}ms</span>
                                {cue.endTimeMs && <span>→ {cue.endTimeMs}ms</span>}
                                {cue.volume && <span>v{Math.round(cue.volume * 100)}%</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
