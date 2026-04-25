import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import { GeneratedScene } from '../types';
import { sfxEngine } from '../services/sfxEngine';
import { ExportDialog } from './ExportDialog';

interface MultiScenePlayerProps {
  scenes: GeneratedScene[];
  fps: number;
  voiceoverAudioUrl?: string | null;
}

interface SceneMetadata {
  totalFrames: number;
  fps: number;
  status: 'CONNECTING' | 'READY' | 'ERROR';
}

export function MultiScenePlayer({ scenes, fps, voiceoverAudioUrl }: MultiScenePlayerProps) {
  const [globalTime, setGlobalTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const requestRef = useRef<number>();
  const playbackStartTimeRef = useRef<number | null>(null);
  const startGlobalTimeRef = useRef<number>(0);
  
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const [sceneMetadata, setSceneMetadata] = useState<Record<string, SceneMetadata>>({});

  const totalDuration = scenes.length > 0 ? scenes[scenes.length - 1].endTime : 0;

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const targetRatio = 16 / 9;
      const containerRatio = clientWidth / clientHeight;

      let fitWidth = clientWidth;
      let fitHeight = clientHeight;

      if (containerRatio > targetRatio) {
        fitWidth = clientHeight * targetRatio;
      } else {
        fitHeight = clientWidth / targetRatio;
      }

      setDimensions({ width: fitWidth, height: fitHeight });
      setScale(fitWidth / 1920);
    };

    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    updateSize();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object' && event.data.type === 'SYNC_DURATION') {
        const { frames, fps } = event.data;
        // Try to identify which scene this came from. 
        // This is tricky if multiple iframes fire at once.
        // We'll use the event source to match.
        scenes.forEach((scene, index) => {
          const iframe = iframeRefs.current[index];
          if (iframe && iframe.contentWindow === event.source) {
            setSceneMetadata(prev => ({
              ...prev,
              [scene.id]: {
                totalFrames: frames,
                fps: fps || 60,
                status: 'READY'
              }
            }));
          }
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [scenes]);

  const sceneMetadataRef = useRef(sceneMetadata);
  useEffect(() => {
     sceneMetadataRef.current = sceneMetadata;
  }, [sceneMetadata]);

  const updateIframes = useCallback((time: number) => {
    scenesRef.current.forEach((scene, index) => {
      const iframe = iframeRefs.current[index];
      if (!iframe || !iframe.contentWindow) return;

      const meta = sceneMetadataRef.current[scene.id];
      const localTime = time - scene.startTime;
      
      // Calculate effective frames vs target duration
      // If AI didn't report duration yet, assume 60fps target
      const targetFrames = scene.duration * 60;
      const actualFrames = meta?.status === 'READY' ? meta.totalFrames : targetFrames;
      
      // Calculate normalized progress (0 to 1) for the scene's lifecycle
      let progress = 0;
      if (time >= scene.startTime && time <= scene.endTime) {
         progress = Math.max(0, Math.min(1, localTime / scene.duration));
      } else if (time < scene.startTime) {
         progress = 0;
      } else if (time > scene.endTime) {
         progress = 1;
      }

      // Convert to frame index with scaling if duration mismatch
      // This ensures 10s of AI animation squeezed into 5s of player time stays perfectly in sync
      const frameIndex = Math.floor(progress * (actualFrames - 1));
      
      try {
        // @ts-ignore
        if (typeof iframe.contentWindow.seekTo === 'function') {
          // @ts-ignore
          iframe.contentWindow.seekTo(frameIndex);
        }
      } catch (e) {
        // ignore
      }
    });
  }, []);

  // Fallback poller for iframes
  const handleIframeLoad = (id: string, index: number) => {
    if (sceneMetadata[id]?.status === 'READY') return;
    
    let attempts = 0;
    const maxAttempts = 15;
    const poll = () => {
      const iframe = iframeRefs.current[index];
      if (!iframe?.contentWindow) return;

      try {
        // @ts-ignore
        const hasSeekTo = typeof iframe.contentWindow.seekTo === 'function';
        // @ts-ignore
        const frames = iframe.contentWindow.TOTAL_FRAMES;
        // @ts-ignore
        const f = iframe.contentWindow.FPS || 60;

        if (hasSeekTo && frames !== undefined) {
           setSceneMetadata(prev => ({
             ...prev,
             [id]: { totalFrames: frames, fps: f, status: 'READY' }
           }));
           // Initial render
           // @ts-ignore
           iframe.contentWindow.seekTo(0);
           return;
        }
      } catch(e) {}

      attempts++;
      if (attempts < maxAttempts && (!sceneMetadata[id] || sceneMetadata[id].status !== 'READY')) {
        setTimeout(poll, 300);
      }
    };
    poll();
  };

  const globalTimeRef = useRef(0);

  const setGlobalTimeState = useCallback((time: number) => {
    globalTimeRef.current = time;
    setGlobalTime(time);
  }, []);

  const handleExportSeek = useCallback((time: number) => {
    setGlobalTimeState(time);
    updateIframes(time);
  }, [updateIframes, setGlobalTimeState]);

  const scenesRef = useRef(scenes);
  useEffect(() => {
     scenesRef.current = scenes;
  }, [scenes]);

  const scheduleSFXFromTime = useCallback((currentTime: number) => {
      sfxEngine.stopAll();
      scenesRef.current.forEach(scene => {
          if (!scene.sfxCues) return;
          scene.sfxCues.forEach(cue => {
              const startGlobal = scene.startTime + (cue.startTimeMs / 1000);
              const delay = startGlobal - currentTime;
              
              if (delay >= 0) { // If it starts in the future, schedule it
                  let dur: number | undefined = undefined;
                  if (cue.endTimeMs) {
                      dur = (cue.endTimeMs - cue.startTimeMs) / 1000;
                  }
                  sfxEngine.schedule(cue.name, delay, dur, cue.volume);
              } else if (cue.endTimeMs) { // If we're inside a continuous loop, start immediately remainder
                  const endGlobal = scene.startTime + (cue.endTimeMs / 1000);
                  if (currentTime < endGlobal) {
                      sfxEngine.schedule(cue.name, 0, endGlobal - currentTime, cue.volume);
                  }
              }
          });
      });
  }, []);

  const playLoop = useCallback((time: number) => {
    if (playbackStartTimeRef.current === null) {
      playbackStartTimeRef.current = time;
      startGlobalTimeRef.current = globalTimeRef.current;
    }
    
    const elapsedSeconds = (time - playbackStartTimeRef.current) / 1000;
    let nextTime = startGlobalTimeRef.current + elapsedSeconds;
    
    const looped = nextTime > totalDuration;
    if (looped) {
      nextTime = nextTime % totalDuration;
      playbackStartTimeRef.current = time;
      startGlobalTimeRef.current = nextTime;
    }

    setGlobalTimeState(nextTime);
    updateIframes(nextTime);

    // Let the audio track play freely based on natural browser time to prevent stutter.
    if (looped && audioRef.current) {
        audioRef.current.currentTime = nextTime;
        const playStr = audioRef.current.play();
        if (playStr !== undefined) {
           playStr.catch(() => {});
        }
    }
    
    if (looped) {
        scheduleSFXFromTime(nextTime);
    }
    
    requestRef.current = requestAnimationFrame(playLoop);
  }, [totalDuration, updateIframes, scheduleSFXFromTime]);

  useEffect(() => {
    // Preload SFX track
    const allNames = scenes.flatMap(s => s.sfxCues ? s.sfxCues.map(c => c.name) : []);
    if (allNames.length > 0) {
      sfxEngine.preload(allNames);
    }
  }, [scenes]);

  useEffect(() => {
    if (isPlaying) {
      playbackStartTimeRef.current = null;
      if (audioRef.current) {
        audioRef.current.currentTime = globalTimeRef.current;
        audioRef.current.play().catch(console.error);
      }
      
      scheduleSFXFromTime(globalTimeRef.current);

      requestRef.current = requestAnimationFrame(playLoop);
    } else {
      sfxEngine.stopAll();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      sfxEngine.stopAll();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, playLoop, scheduleSFXFromTime]);

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    const newTime = parseFloat(e.target.value);
    setGlobalTimeState(newTime);
    updateIframes(newTime);
    if (audioRef.current) {
       audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const centis = Math.floor((seconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(centis).padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#080808]">
      <div className="flex-1 flex min-h-0 w-full">
        <div className="flex-1 flex flex-col p-4 gap-4 w-full">
          <div ref={containerRef} className="flex-1 min-h-0 w-full flex items-center justify-center relative overflow-hidden">
            <div 
              ref={stageRef}
              style={{ width: dimensions.width, height: dimensions.height }}
              className="relative bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-[#1a1a1a] rounded-lg overflow-hidden shrink-0 gpu-layer"
            >
              {scenes.map((scene, index) => {
                const isActive = globalTime >= scene.startTime && globalTime <= scene.endTime;
                const meta = sceneMetadata[scene.id] || { status: 'CONNECTING' };
                return (
                  <div key={scene.id} className="absolute inset-0 pointer-events-none">
                    <iframe 
                      ref={el => iframeRefs.current[index] = el}
                      src={scene.htmlUrl} 
                      onLoad={() => handleIframeLoad(scene.id, index)}
                      style={{
                        width: '1920px',
                        height: '1080px',
                        transform: `translate(-50%, -50%) scale(${scale})`,
                        transformOrigin: 'center center',
                        border: 'none',
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        opacity: isActive ? 1 : 0,
                        pointerEvents: isActive ? 'auto' : 'none',
                        zIndex: index, // Newer scenes render on top during overlap
                        backfaceVisibility: 'hidden',
                        imageRendering: 'crisp-edges',
                        contain: 'strict'
                      }}
                      title={`Scene ${index + 1}`}
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline Control */}
          <div className="shrink-0 bg-[#0d0d0d] p-3 px-4 border border-[#222] rounded-xl flex flex-col gap-2 max-w-4xl mx-auto w-full">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    sfxEngine.init();
                    setIsPlaying(!isPlaying);
                  }}
                  className="hover:scale-110 transition-transform text-zinc-300 hover:text-white"
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                </button>
                <div className="font-mono text-sm flex items-baseline gap-2">
                  <span className="text-white text-lg w-24">{formatTime(globalTime)}</span>
                  <span className="text-zinc-600 text-xs">/</span>
                  <span className="text-zinc-500 text-xs">{formatTime(totalDuration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-white text-xs font-medium rounded-lg transition-colors border border-white/5 active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              </div>
            </div>

            <div className="relative mt-1">
              <input 
                type="range" 
                min="0" 
                max={totalDuration} 
                step="0.01"
                value={globalTime}
                onChange={handleScrub}
                className="custom-slider absolute z-10 top-1.5 w-full"
              />
              <div className="h-4 bg-zinc-900/30 rounded mt-1 border border-white/5 flex items-center px-1 gap-1 overflow-hidden opacity-40 relative">
                {scenes.map((scene, i) => (
                  <div 
                    key={i} 
                    className="absolute h-full border-l border-zinc-500 bg-blue-500/20"
                    style={{
                      left: `${(scene.startTime / totalDuration) * 100}%`,
                      width: `${(scene.duration / totalDuration) * 100}%`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {voiceoverAudioUrl && (
         <audio ref={audioRef} src={voiceoverAudioUrl} preload="auto" />
      )}

      {showExport && (
        <ExportDialog 
          scenes={scenes}
          voiceoverAudioUrl={voiceoverAudioUrl}
          onClose={() => setShowExport(false)} 
        />
      )}
    </div>
  );
}
