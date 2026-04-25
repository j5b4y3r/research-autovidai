import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Download, Code2, Copy, Loader2 } from 'lucide-react';
import { generateCanvasMotion } from '../services/canvasAi';
import { sfxEngine } from '../services/sfxEngine';
import { SFXCue } from '../types';

function parseSFXTrack(code: string): SFXCue[] {
  const match = code.match(/<script\s+id="sfx-track"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (match && match[1]) {
    let jsonStr = match[1].trim();
    try {
      return JSON.parse(jsonStr);
    } catch(e) {
      try {
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(jsonStr);
      } catch (e2) {
        try {
          if (!jsonStr.endsWith(']')) jsonStr += ']';
          return JSON.parse(jsonStr);
        } catch (e3) {
          console.error("Failed to parse SFX track", e3);
        }
      }
    }
  }
  return [];
}

export function ProMotionEngine() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('DISCONNECTED');
  const [codeContent, setCodeContent] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [sfxCues, setSfxCues] = useState<SFXCue[]>([]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [currentFPS, setCurrentFPS] = useState(60);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameRequestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SYNC_DURATION') {
        setTotalFrames(event.data.frames);
        setCurrentFPS(event.data.fps || 60);
        setStatus(`READY (${(event.data.frames / (event.data.fps || 60)).toFixed(1)}s)`);
        updateFrame(0);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const formatTime = (frame: number, fps: number) => {
    const totalSeconds = frame / fps;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(ms).padStart(2, '0')}`;
  };

  const frameRef = useRef(0);
  const sfxCuesRef = useRef<SFXCue[]>([]);

  useEffect(() => {
     sfxCuesRef.current = sfxCues;
  }, [sfxCues]);

  const startGlobalTimeRef = useRef(0);
  const playbackStartTimeRef = useRef<number | null>(null);

  const updateFrame = useCallback((f: number) => {
    setCurrentFrame(f);
    frameRef.current = f;
    if (iframeRef.current && iframeRef.current.contentWindow) {
        try {
            // @ts-ignore
            if (typeof iframeRef.current.contentWindow.seekTo === 'function') {
                 // @ts-ignore
                 iframeRef.current.contentWindow.seekTo(f);
            }
        } catch(e) {}
    }
  }, []);

  const scheduleSFXFromTime = useCallback((currentMs: number) => {
      sfxEngine.stopAll();
      sfxCuesRef.current.forEach(cue => {
          const delay = (cue.startTimeMs - currentMs) / 1000;
          if (delay >= 0) {
              let dur: number | undefined = undefined;
              if (cue.endTimeMs) dur = (cue.endTimeMs - cue.startTimeMs) / 1000;
              sfxEngine.schedule(cue.name, delay, dur, cue.volume);
          } else if (cue.endTimeMs && currentMs < cue.endTimeMs) {
              sfxEngine.schedule(cue.name, 0, (cue.endTimeMs - currentMs) / 1000, cue.volume);
          }
      });
  }, []);

  const playLoop = useCallback((time: number) => {
    if (playbackStartTimeRef.current === null) {
      playbackStartTimeRef.current = time;
      startGlobalTimeRef.current = frameRef.current / currentFPS;
    }
    
    const elapsedSeconds = (time - playbackStartTimeRef.current) / 1000;
    const totalDurationSeconds = totalFrames / currentFPS;
    let nextTimeSeconds = startGlobalTimeRef.current + elapsedSeconds;

    const looped = nextTimeSeconds > totalDurationSeconds;
    if (looped) {
      nextTimeSeconds = nextTimeSeconds % totalDurationSeconds;
      playbackStartTimeRef.current = time;
      startGlobalTimeRef.current = nextTimeSeconds;
      scheduleSFXFromTime(nextTimeSeconds * 1000);
    }
    
    // Normalize to frame
    const nextFrame = Math.min(totalFrames, Math.max(0, Math.floor(nextTimeSeconds * currentFPS)));
    
    if (nextFrame !== frameRef.current) {
        updateFrame(nextFrame);
    }
    
    frameRequestRef.current = requestAnimationFrame(playLoop);
  }, [currentFPS, totalFrames, updateFrame, scheduleSFXFromTime]);

  const handlePlayPause = () => {
    if (totalFrames === 0) return;
    sfxEngine.init();
    if (!isPlaying) { // Starting play
       playbackStartTimeRef.current = null;
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      scheduleSFXFromTime((frameRef.current / currentFPS) * 1000);
      frameRequestRef.current = requestAnimationFrame(playLoop);
    } else {
      sfxEngine.stopAll();
      if (frameRequestRef.current) cancelAnimationFrame(frameRequestRef.current);
    }
    return () => {
      sfxEngine.stopAll();
      if (frameRequestRef.current) cancelAnimationFrame(frameRequestRef.current);
    };
  }, [isPlaying, playLoop, scheduleSFXFromTime, currentFPS]);

  const handleGenerate = async () => {
    const finalPrompt = prompt || "Abstract particle wave";
    setIsLoading(true);
    setStatus("BAKING ANIMATION FRAMES...");
    setIsPlaying(false);
    
    try {
      let rawCode = await generateCanvasMotion(finalPrompt);
      let cleanCode = rawCode.replace(/```html|```/g, '').trim();
      setCodeContent(cleanCode);

      // Parse SFX tracks
      const cues = parseSFXTrack(cleanCode);
      setSfxCues(cues);
      
      const sfxNames = cues.map(c => c.name);
      if (sfxNames.length > 0) {
        sfxEngine.preload([...new Set(sfxNames)]);
      }

      const blobContent = `
          <!DOCTYPE html>
          <html>
          <head>
              <style>
                  body { margin: 0; overflow: hidden; background: #000; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
                  canvas { width: 100%; height: 100%; object-fit: contain; background: #000; }
              </style>
          </head>
          <body>
              ${cleanCode}
          </body>
          </html>
      `;

      const blob = new Blob([blobContent], { type: 'text/html' });
      if (iframeRef.current) {
          iframeRef.current.src = URL.createObjectURL(blob);
      }
    } catch (error) {
      console.error(error);
      setStatus("GENERATE ERROR");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (totalFrames === 0 || !iframeRef.current?.contentWindow) return;
    
    setIsPlaying(false);
    setIsLoading(true);
    setStatus("RECORDING VIDEO (REAL-TIME)...");
    
    const canvas = iframeRef.current.contentWindow.document.querySelector('canvas');
    if (!canvas) {
        setIsLoading(false);
        setStatus("NO CANVAS FOUND");
        return;
    }

    updateFrame(0);
    // Give browser a moment to render frame 0 natively
    await new Promise(r => setTimeout(r, 500));

    // @ts-ignore
    const videoStream = canvas.captureStream(currentFPS); 
    
    sfxEngine.init();
    const audioStream = sfxEngine.getStream();
    
    let combinedStream: MediaStream;
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks()
      ]);
    } else {
      combinedStream = videoStream;
    }

    const mimeTypes = ['video/webm; codecs=vp9,opus', 'video/webm; codecs=vp8,opus', 'video/webm', 'video/mp4'];
    let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    
    if (!selectedMimeType) {
        setIsLoading(false);
        setStatus("EXPORT NOT SUPPORTED");
        return;
    }

    const recorder = new MediaRecorder(combinedStream, { mimeType: selectedMimeType, videoBitsPerSecond: 8000000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if(e.data.size > 0) chunks.push(e.data); }
    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `render-${Date.now()}.${selectedMimeType?.includes('mp4') ? 'mp4' : 'webm'}`;
        a.click();
        setIsLoading(false);
        setStatus("EXPORT READY");
        sfxEngine.stopAll();
    };

    recorder.start();
    scheduleSFXFromTime(0);

    let lastRecTime = performance.now();
    let currentRecFrame = 0;

    const recStep = (timestamp: number) => {
        const elapsedSeconds = (timestamp - lastRecTime) / 1000;
        const targetFrame = Math.min(totalFrames, Math.floor(elapsedSeconds * currentFPS));
        
        if (targetFrame > currentRecFrame) {
            currentRecFrame = targetFrame;
            updateFrame(currentRecFrame);
            
            if (currentRecFrame >= totalFrames) {
                setTimeout(() => recorder.stop(), 300);
                return;
            }
        }
        requestAnimationFrame(recStep);
    }
    requestAnimationFrame(recStep);
  };

  const handleCopyCode = () => {
      navigator.clipboard.writeText(codeContent);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] text-[#eee] relative overflow-hidden font-sans">
        <header className="px-6 py-4 flex justify-between items-center border-b border-white/5 bg-zinc-900/90 backdrop-blur z-50">
            <h1 className="text-xs font-black tracking-[0.3em] uppercase text-blue-500">AutoSync_Engine_v4.2</h1>
            
            <div className="flex-1 max-w-2xl px-8">
                <div className="flex gap-2 p-1 bg-white/5 rounded-md border border-white/10">
                    <input 
                        type="text" 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe canvas motion (e.g. '8s complex noise flow')" 
                        className="bg-transparent flex-1 px-4 text-xs outline-none text-white placeholder-zinc-600"
                        onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleGenerate()}
                    />
                    <button 
                        onClick={handleGenerate} 
                        disabled={isLoading}
                        className="bg-blue-600 hover:bg-blue-500 px-6 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all text-white disabled:opacity-50"
                    >
                        {isLoading && status.includes('BAKING') ? 'BAKING...' : 'GENERATE'}
                    </button>
                </div>
            </div>

            <div className="flex gap-4">
                <button 
                    onClick={handleExport}
                    disabled={totalFrames === 0 || isLoading}
                    className="text-[10px] font-bold text-blue-400 border border-blue-400/30 px-3 py-1 rounded hover:bg-blue-400/10 uppercase tracking-widest disabled:opacity-30 flex items-center gap-2"
                >
                    <Download size={12} />
                    Export Video
                </button>
                <button 
                    onClick={() => setShowCode(!showCode)}
                    className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest flex items-center gap-2"
                >
                    <Code2 size={12} />
                    Inspector
                </button>
            </div>
        </header>

        <main className="flex-1 relative flex">
            <div className="flex-1 display flex items-center justify-center p-4 bg-[#080808] relative min-h-[60vh]">
                <div className="relative w-full max-w-[1000px] aspect-[16/9] bg-black rounded-lg border border-[#222] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden flex items-center justify-center">
                    <iframe 
                        ref={iframeRef}
                        id="motion-iframe" 
                        sandbox="allow-scripts allow-same-origin"
                        className="w-full h-full border-none bg-black block"
                    />
                    
                    {isLoading && status.includes('RECORDING') && (
                         <div className="absolute inset-0 bg-black/50 z-50 flex flex-col justify-end p-8">
                              <div className="flex items-center gap-4 bg-red-500/20 text-red-400 p-4 rounded border border-red-500/50 backdrop-blur-md">
                                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                  <span className="text-xs font-mono uppercase tracking-widest">{status}</span>
                                  <span className="ml-auto font-mono">{currentFrame} / {totalFrames}</span>
                              </div>
                         </div>
                    )}
                </div>
            </div>

            <div className={`absolute right-0 top-0 bottom-0 w-[400px] bg-[#0d0d0d] border-l border-[#222] z-[120] flex flex-col transition-transform duration-300 ${showCode ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Generated Code</span>
                    <button onClick={handleCopyCode} className="text-[9px] bg-white/5 hover:bg-white/10 transition-colors px-2 py-1 rounded flex items-center gap-1">
                        <Copy size={10} />
                        Copy
                    </button>
                </div>
                <pre className="flex-1 overflow-auto p-4 text-[10px] text-green-400/80 font-mono">
                    <code>{codeContent}</code>
                </pre>
            </div>
        </main>

        <footer className="border-t border-white/5 px-8 py-6 flex flex-col gap-4 bg-zinc-900/90 z-50 backdrop-blur">
            <div className="flex items-center gap-6">
                <button 
                    onClick={handlePlayPause}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-all"
                >
                    {isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} className="ml-1" />}
                </button>
                <div className="flex flex-col">
                    <div className="font-mono flex items-baseline">
                        <span className="text-white text-2xl font-bold tracking-tighter">{formatTime(currentFrame, currentFPS)}</span>
                        <span className="text-zinc-600 mx-2 text-sm">/</span>
                        <span className="text-zinc-500 text-sm">{formatTime(totalFrames, currentFPS)}</span>
                    </div>
                    <div className="text-[9px] text-zinc-600 uppercase font-black tracking-widest">
                        SYNC STATUS: <span className={status.includes('ERROR') ? 'text-red-400' : 'text-blue-400'}>{status}</span>
                    </div>
                </div>
            </div>
            
            <input 
                type="range" 
                min="0" 
                max={totalFrames || 0} 
                value={currentFrame}
                onChange={(e) => {
                    setIsPlaying(false);
                    updateFrame(parseInt(e.target.value));
                }}
                className="w-full h-1.5 bg-[#222] rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-[0_0_10px_theme(colors.blue.500)]"
            />
        </footer>
    </div>
  );
}
