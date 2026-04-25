import React, { useState } from 'react';
import { Header } from './components/Header';
import { Player } from './components/Player';
import { MultiScenePlayer } from './components/MultiScenePlayer';
import { DeveloperInsights } from './components/DeveloperInsights';
import { generateMotionGraphics } from './services/ai';
import { generateCanvasMotion } from './services/canvasAi';
import { generateSaaSPlan, generateSaaSScript } from './services/planner';
import { generateExplainerScript, generateCompressedTimestamps, generateExplainerPlan, ExplainerPlan } from './services/explainer';
import { calculateSceneTimings } from './services/timing';
import { generateAllScenes } from './services/videoGenerator';
import { VIDEO_TEMPLATES } from './data/templates';
import { GeneratedScene, VideoPlan, VideoTemplate, TimedScene } from './types';

export default function App() {
  const [mode, setMode] = useState<'single' | 'agent' | 'explainer'>('single');
  const [showInsights, setShowInsights] = useState(true);

  // Single Scene State
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(10); // Keeping state so Header is happy
  const [fps, setFps] = useState(30); // Keeping state so Header is happy
  const [isGenerating, setIsGenerating] = useState(false);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [statusText, setStatusText] = useState('');

  // Agent State (SaaS)
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentScript, setAgentScript] = useState('');
  const [agentDuration, setAgentDuration] = useState(15);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('no_template');

  // Explainer State
  const [explainerPrompt, setExplainerPrompt] = useState('');
  const [explainerScript, setExplainerScript] = useState('');
  const [explainerAudioFile, setExplainerAudioFile] = useState<File | null>(null);
  const [explainerDuration, setExplainerDuration] = useState(30);
  const [explainerPlan, setExplainerPlan] = useState<ExplainerPlan | null>(null);

  // Shared Multi-scene State
  const [isPlanning, setIsPlanning] = useState(false);
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [videoPlan, setVideoPlan] = useState<VideoPlan | null>(null);
  const [generatedScenes, setGeneratedScenes] = useState<GeneratedScene[]>([]);
  const [voiceoverAudioUrl, setVoiceoverAudioUrl] = useState<string | null>(null);

  const handleGenerateSingle = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setStatusText("Baking animation frames...");
    
    try {
      // We pass 5s as a hint, but the AI is now instructions-empowered to adjust it.
      let rawCode = await generateCanvasMotion(prompt, 5);
      
      let cleanCode = rawCode;
      // Robust multi-pass extraction
      const match = rawCode.match(/```(?:html|javascript|js)?\n([\s\S]*?)```/i) || rawCode.match(/```([\s\S]*?)```/);
      if (match) {
        cleanCode = match[1];
      }
      cleanCode = cleanCode.replace(/```/g, '').trim();

      setGeneratedCode(cleanCode);

      // If AI didn't provide full document boilerplate, wrap it.
      const blobContent = cleanCode.toLowerCase().includes('<!doctype html') || cleanCode.toLowerCase().includes('<html') 
        ? cleanCode 
        : `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${cleanCode}</body></html>`;

      const blob = new Blob([blobContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      if (htmlUrl) URL.revokeObjectURL(htmlUrl);
      setHtmlUrl(url);
    } catch (error) {
      console.error("Generation failed:", error);
      alert("Generation failed. Check console for details.");
    } finally {
      setIsGenerating(false);
      setStatusText('');
    }
  };

  const handleGenerateAgent = async () => {
    if (!websiteUrl && !agentPrompt && !agentScript) return;
    setGeneratedScenes([]);
    setVideoPlan(null);
    setVoiceoverAudioUrl(null);
    setGenerationProgress({ current: 0, total: 0 });
    
    try {
      setIsPlanning(true);
      let script = agentScript;
      
      if (!script) {
        setAgentStatus('Analyzing brand & writing script...');
        script = await generateSaaSScript(websiteUrl, agentPrompt, agentDuration);
        setAgentScript(script);
      }

      setAgentStatus('Generating Voiceover & Transcription (Edge TTS + Bytez Whisper)...');
      let compressed = "";
      try {
        const response = await fetch('/api/voiceover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script })
        });
        const data = await response.json();
        compressed = data.compressed;
        setVoiceoverAudioUrl(data.audioUrl);
      } catch (err) {
        console.error("Voiceover failed using fallback:", err);
        const fallback = generateCompressedTimestamps(script);
        compressed = fallback.compressed;
      }
      
      setAgentStatus('Calculating timings & writing scenes...');
      const selectedTemplate = VIDEO_TEMPLATES.find(t => t.id === selectedTemplateId);
      const plan = await generateSaaSPlan(websiteUrl, agentPrompt, compressed, selectedTemplate);
      setVideoPlan(plan);
      setIsPlanning(false);

      setIsGeneratingScenes(true);
      
      const timedScenes: TimedScene[] = plan.scenes.map(s => ({
        id: s.id,
        sentence: s.sentence,
        motionPrompt: s.motionPrompt,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs,
        startTime: s.startTimeMs / 1000,
        endTime: s.endTimeMs / 1000,
        duration: s.duration || ((s.endTimeMs - s.startTimeMs) / 1000)
      }));

      setGenerationProgress({ current: 0, total: timedScenes.length });
      
      const scenes = await generateAllScenes(timedScenes, (current, total, status) => {
        setAgentStatus(status);
        setGenerationProgress({ current, total });
      });
      
      setGeneratedScenes(scenes);
    } catch (error) {
      console.error("Agent generation failed:", error);
      alert("Failed to generate video. Check console for details.");
    } finally {
      setIsPlanning(false);
      setIsGeneratingScenes(false);
      setAgentStatus('');
    }
  };

  const handleGenerateExplainer = async () => {
    if (!explainerPrompt && !explainerScript && !explainerAudioFile) return;
    setGeneratedScenes([]);
    setExplainerPlan(null);
    setVoiceoverAudioUrl(null);
    setGenerationProgress({ current: 0, total: 0 });

    try {
      setIsPlanning(true);
      let script = explainerScript;
      let compressed = "";
      
      if (explainerAudioFile) {
        setAgentStatus('Transcribing uploaded audio (AssemblyAI)...');
        const formData = new FormData();
        formData.append("audio", explainerAudioFile);
        
        try {
            const response = await fetch('/api/transcribe', {
               method: 'POST',
               body: formData
            });
            
            if (!response.ok) {
               const errText = await response.text();
               throw new Error(`Server returned ${response.status}: ${errText.substring(0, 100)}...`);
            }
            
            const textResponse = await response.text();
            let data;
            try {
               data = JSON.parse(textResponse);
            } catch (e) {
               throw new Error(`Invalid JSON response: ${textResponse.substring(0, 100)}...`);
            }

            if (data.error) throw new Error(data.error);
            compressed = data.compressed;
            script = data.script; // Use transcription as script
            
            setVoiceoverAudioUrl(URL.createObjectURL(explainerAudioFile));
        } catch (err: any) {
            console.error("Transcription failed:", err);
            alert(`Failed to transcribe audio. ${err.message}`);
            setIsPlanning(false);
            return;
        }
      } else {
          if (!script) {
            setAgentStatus('Writing explainer script...');
            script = await generateExplainerScript(explainerPrompt, explainerDuration);
            setExplainerScript(script);
          }

          setAgentStatus('Generating Voiceover (Edge TTS)...');
          try {
            const response = await fetch('/api/voiceover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ script })
            });
            const data = await response.json();
            compressed = data.compressed;
            setVoiceoverAudioUrl(data.audioUrl);
          } catch (err) {
            console.error("Voiceover failed using fallback:", err);
            const fallback = generateCompressedTimestamps(script);
            compressed = fallback.compressed;
          }
      }
      
      setAgentStatus('Calculating timings & writing scenes...');
      const plan = await generateExplainerPlan(explainerPrompt, compressed);
      
      if (!plan || !Array.isArray(plan.scenes)) {
        throw new Error("Failed to generate a valid scene plan from AI.");
      }

      setExplainerPlan(plan);
      setIsPlanning(false);

      setIsGeneratingScenes(true);
      setGenerationProgress({ current: 0, total: plan.scenes.length });

      // Convert ExplainerScenePlan to TimedScene
      const timedScenes: TimedScene[] = plan.scenes.map(s => ({
        id: s.id,
        sentence: s.text,
        motionPrompt: s.motionPrompt,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs,
        startTime: s.startTimeMs / 1000,
        endTime: s.endTimeMs / 1000,
        duration: s.duration || ((s.endTimeMs - s.startTimeMs) / 1000)
      }));

      const scenes = await generateAllScenes(timedScenes, (current, total, status) => {
        setAgentStatus(status);
        setGenerationProgress({ current, total });
      });

      setGeneratedScenes(scenes);
    } catch (error) {
      console.error("Explainer generation failed:", error);
      alert("Failed to generate explainer. Check console for details.");
    } finally {
      setIsPlanning(false);
      setIsGeneratingScenes(false);
      setAgentStatus('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-[#eee] font-sans overflow-hidden">
      <div className="flex border-b border-white/5 bg-[#0a0a0a] px-4 pt-2 gap-4 shrink-0 justify-between items-center">
        <div className="flex gap-4">
          <button 
            className={`pb-2 px-2 text-[10px] font-bold tracking-widest uppercase border-b-2 transition-colors ${mode === 'agent' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setMode('agent')}
          >
            SaaS Video Agent
          </button>
          <button 
            className={`pb-2 px-2 text-[10px] font-bold tracking-widest uppercase border-b-2 transition-colors ${mode === 'explainer' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setMode('explainer')}
          >
            Explainer Video
          </button>
          <button 
            className={`pb-2 px-2 text-[10px] font-bold tracking-widest uppercase border-b-2 transition-colors ${mode === 'single' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setMode('single')}
          >
            Motion Engine (Pro)
          </button>
        </div>

        {mode === 'agent' && (videoPlan || generatedScenes.length > 0) && (
          <button 
            onClick={() => setShowInsights(!showInsights)}
            className={`mb-2 text-[9px] font-bold uppercase tracking-wider px-3 py-1 rounded transition-colors ${showInsights ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-zinc-500 border border-white/10 hover:border-white/20'}`}
          >
            {showInsights ? 'Hide Insights' : 'Developer Insights'}
          </button>
        )}
      </div>

      {mode === 'single' ? (
        <>
          <Header 
            prompt={prompt} 
            setPrompt={setPrompt} 
            duration={duration} 
            setDuration={setDuration} 
            fps={fps}
            setFps={setFps}
            isGenerating={isGenerating} 
            onGenerate={handleGenerateSingle} 
          />
          <Player 
            htmlUrl={htmlUrl} 
            generatedCode={generatedCode}
            duration={duration} 
            fps={fps}
            isGenerating={isGenerating} 
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 border-b border-white/5 bg-[#0a0a0a] p-4 flex flex-col gap-3">
            {mode === 'agent' ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <input 
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://your-saas-website.com"
                    className="w-1/3 bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-1/3 bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                  >
                    <option value="no_template">No Template (Custom AI Style)</option>
                    {VIDEO_TEMPLATES.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 align-top">
                  <textarea 
                    value={agentPrompt}
                    onChange={(e) => setAgentPrompt(e.target.value)}
                    placeholder="Describe the SaaS video (AI will write the voiceover script if none provided below)..."
                    className="flex-1 bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors resize-none h-20"
                  />
                  <textarea 
                    value={agentScript}
                    onChange={(e) => setAgentScript(e.target.value)}
                    placeholder="Or paste your exact voiceover script here..."
                    className="flex-1 bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors resize-none h-20"
                  />
                  <div className="flex flex-col gap-2 shrink-0">
                    <label className="text-zinc-500 text-xs font-mono">DURATION (SEC)</label>
                    <input 
                      type="number"
                      value={agentDuration}
                      onChange={(e) => setAgentDuration(Number(e.target.value))}
                      className="w-24 bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                      min={5}
                      max={120}
                    />
                    <button 
                      onClick={handleGenerateAgent}
                      disabled={isPlanning || isGeneratingScenes || !websiteUrl || (!agentPrompt && !agentScript)}
                      className="mt-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors"
                    >
                      {isPlanning || isGeneratingScenes ? 'Processing...' : 'Generate SaaS'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3 align-top">
                  <textarea 
                    value={explainerPrompt}
                    onChange={(e) => setExplainerPrompt(e.target.value)}
                    placeholder="Describe your Explainer Video (AI will write the script if none provided below)..."
                    className="flex-1 bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors resize-none h-20"
                  />
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea 
                      value={explainerScript}
                      onChange={(e) => setExplainerScript(e.target.value)}
                      placeholder="Or paste your exact custom script here..."
                      className="bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors resize-none h-[2.8rem]"
                    />
                    <div className="relative">
                      <input 
                        type="file"
                        accept="audio/mp3, audio/wav, audio/mpeg, audio/ogg"
                        onChange={(e) => setExplainerAudioFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="bg-[#111] border border-white/10 hover:border-blue-500/50 rounded-lg px-4 py-1.5 text-sm transition-colors text-center truncate cursor-pointer h-[2.2rem] flex items-center justify-center">
                        <span className={explainerAudioFile ? "text-blue-400" : "text-zinc-600 font-mono text-xs"}>
                          {explainerAudioFile ? `🎵 ${explainerAudioFile.name}` : 'Upload Custom Voiceover File +'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <label className="text-zinc-500 text-xs font-mono">DURATION (SEC)</label>
                    <input 
                      type="number"
                      value={explainerDuration}
                      onChange={(e) => setExplainerDuration(Number(e.target.value))}
                      className="w-24 bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors h-[2.2rem]"
                      min={5}
                      max={120}
                    />
                    <button 
                      onClick={handleGenerateExplainer}
                      disabled={isPlanning || isGeneratingScenes || (!explainerPrompt && !explainerScript && !explainerAudioFile)}
                      className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors h-[2.2rem]"
                    >
                      {isPlanning || isGeneratingScenes ? 'Processing...' : 'Generate Explainer'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {(isPlanning || isGeneratingScenes) && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <div className="text-[10px] text-blue-400 font-mono animate-pulse uppercase tracking-widest">
                    STATUS: {agentStatus}
                  </div>
                  {generationProgress.total > 0 && (
                    <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                      {generationProgress.current} / {generationProgress.total} SCENES
                    </div>
                  )}
                </div>
                <div className="h-1 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ 
                      width: isPlanning 
                        ? '15%' 
                        : `${(generationProgress.current / generationProgress.total) * 100}%` 
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 flex min-h-0">
            {generatedScenes.length > 0 ? (
              <MultiScenePlayer scenes={generatedScenes} fps={30} voiceoverAudioUrl={voiceoverAudioUrl} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-600 font-mono text-sm tracking-widest text-center px-8">
                {mode === 'agent' ? 'ENTER WEBSITE URL AND PROMPT TO GENERATE SAAS VIDEO' : 'ENTER PROMPT OR SCRIPT TO GENERATE EXPLAINER VIDEO'}
              </div>
            )}
            
            {(mode === 'agent' || mode === 'explainer') && showInsights && (videoPlan || explainerPlan || generatedScenes.length > 0) && (
              <DeveloperInsights plan={videoPlan || explainerPlan} generatedScenes={generatedScenes} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
