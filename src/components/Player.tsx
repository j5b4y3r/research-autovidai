import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Code, Monitor, Download, Loader2 } from 'lucide-react';
import { SFXCue, GeneratedScene } from '../types';
import * as WebMMuxer from 'webm-muxer';

interface PlayerProps {
  htmlUrl: string | null;
  generatedCode: string;
  duration: number; // For interface compatibility
  fps: number; // For interface compatibility
  isGenerating: boolean;
}

export function Player({ htmlUrl, generatedCode, isGenerating }: PlayerProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [totalFrames, setTotalFrames] = useState(0);
  const [currentFPS, setCurrentFPS] = useState(60);
  const [status, setStatus] = useState('DISCONNECTED');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object') {
        if (event.data.type === 'SYNC_DURATION') {
          const frames = event.data.frames || 0;
          const fps = event.data.fps || 60;
          setTotalFrames(frames);
          setCurrentFPS(fps);
          setStatus(`READY (${(frames / fps).toFixed(1)}s)`);
          updateFrame(0);
        } else if (event.data.type === 'DEBUG_LOG') {
          console.log(`[CANVAS AI]: ${event.data.message}`, event.data.payload || '');
        } else if (event.data.type === 'ERROR') {
          setStatus(`ERROR: ${event.data.message}`);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
      setScale(fitWidth / 1920); // Maintain 1920x1080 logical scale
    };

    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    updateSize();

    return () => observer.disconnect();
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const globalPlaybackStartTimeRef = useRef<number>(0);
  const startFrameRef = useRef<number>(0);

  useEffect(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
    setStatus(htmlUrl ? 'CONNECTING...' : 'DISCONNECTED');
    setTotalFrames(0);
  }, [htmlUrl]);

  // Robust iframe initialization checker with polling
  const handleIframeLoad = () => {
    if (!iframeRef.current?.contentWindow) return;
    
    let attempts = 0;
    const maxAttempts = 20; // 5 seconds total (250ms intervals)

    const checkReady = () => {
      if (!iframeRef.current?.contentWindow) return;

      try {
        // @ts-ignore
        const hasSeekTo = typeof iframeRef.current.contentWindow.seekTo === 'function';
        // @ts-ignore
        const frames = iframeRef.current.contentWindow.TOTAL_FRAMES || 300;
        // @ts-ignore
        const f = iframeRef.current.contentWindow.FPS || 60;
        
        if (hasSeekTo) {
           // Explicitly call seekTo(0) as a kickstarter
           // @ts-ignore
           iframeRef.current.contentWindow.seekTo(0);
           
           setTotalFrames(prev => {
               if (prev === 0) {
                   setCurrentFPS(f);
                   setStatus(`READY (${(frames / f).toFixed(1)}s) [RECOVERED]`);
                   return frames;
               }
               return prev;
           });
           return; // Stop polling
        }
      } catch (e) {
        console.warn("Waiting for iframe initialization...", e);
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkReady, 250);
      } else {
        setTotalFrames(prev => {
          if (prev === 0) setStatus('ERROR: seekTo NOT FOUND IN SCRIPT');
          return prev;
        });
      }
    };

    checkReady();
  };

  const updateFrame = (f: number) => {
    setCurrentFrame(f);
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        // @ts-ignore
        if (typeof iframeRef.current.contentWindow.seekTo === 'function') {
          // @ts-ignore
          iframeRef.current.contentWindow.seekTo(f);
        }
      } catch (e) {
        // ignore
      }
    }
  };

  const playLoop = (timestamp: number) => {
    const elapsed = timestamp - lastTimeRef.current;
    const frameDuration = 1000 / currentFPS;
    if (elapsed >= frameDuration) {
        setCurrentFrame(prev => {
           let nextFrame = prev + 1;
           if (nextFrame > totalFrames) nextFrame = 0;
           
           if (iframeRef.current && iframeRef.current.contentWindow) {
             try {
               // @ts-ignore
               if (typeof iframeRef.current.contentWindow.seekTo === 'function') {
                 // @ts-ignore
                 iframeRef.current.contentWindow.seekTo(nextFrame);
               }
             } catch(e) {}
           }
           
           return nextFrame;
        });
        lastTimeRef.current = timestamp;
    }
    requestRef.current = requestAnimationFrame(playLoop);
  };

  useEffect(() => {
    if (isPlaying && totalFrames > 0) {
      globalPlaybackStartTimeRef.current = 0;
      requestRef.current = requestAnimationFrame(playLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, totalFrames, currentFPS]);

  const togglePlay = () => {
    if (totalFrames === 0) return;
    setIsPlaying(!isPlaying);
  };

  const handleExport = async () => {
    if (totalFrames === 0 || !iframeRef.current?.contentWindow) return;
    
    setIsPlaying(false);
    setIsExporting(true);
    setStatus("INITIALIZING ENCODER...");
    
    const canvas = iframeRef.current.contentWindow.document.querySelector('canvas');
    if (!canvas) {
        setIsExporting(false);
        setStatus("NO CANVAS FOUND");
        return;
    }

    try {
      if (typeof window.VideoEncoder !== 'function') {
        throw new Error("WebCodecs not supported");
      }

      const muxerTarget = new WebMMuxer.ArrayBufferTarget();
      const muxer = new WebMMuxer.Muxer({
        target: muxerTarget,
        video: {
          codec: 'V_VP8',
          width: 1920,
          height: 1080,
          frameRate: currentFPS
        }
      });

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { throw e; }
      });

      videoEncoder.configure({
        codec: 'vp8',
        width: 1920,
        height: 1080,
        bitrate: 8_000_000
      });

      const frameDuration = 1000000 / currentFPS;
      
      for (let i = 0; i <= totalFrames; i++) {
        setStatus(`RENDERING FRAME ${i}/${totalFrames}`);
        updateFrame(i);
        
        // Wait for frame to update and render
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        
        const bitmap = await createImageBitmap(canvas);
        const timestamp = Math.round(i * frameDuration);
        
        videoEncoder.encode(new VideoFrame(bitmap, { timestamp, duration: Math.round(frameDuration) }), { 
          keyFrame: i % 30 === 0 
        });
        
        bitmap.close();
        setCurrentFrame(i);
        
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
      }

      setStatus("FINALIZING...");
      await videoEncoder.flush();
      videoEncoder.close();
      muxer.finalize();

      const blob = new Blob([muxerTarget.buffer], { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-render-${Date.now()}.webm`;
      a.click();
      
      setIsExporting(false);
      setStatus(`READY (${(totalFrames / currentFPS).toFixed(1)}s)`);
    } catch (err: any) {
      console.error("Export failed", err);
      setStatus(`ERROR: ${err.message}`);
      setIsExporting(false);
    }
  };

  const formatTime = (frame: number, fps: number) => {
    if (!fps) return '00:00:00';
    const totalSeconds = frame / fps;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(ms).padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="flex-1 flex min-h-0 w-full relative">
        <div className="flex-1 flex items-center justify-center p-8 bg-[#080808] relative" ref={containerRef}>
          {htmlUrl ? (
            <div 
              style={{ width: dimensions.width, height: dimensions.height }}
              className="relative bg-black rounded-lg shadow-2xl border border-white/5 overflow-hidden ring-1 ring-white/10"
            >
              <iframe 
                ref={iframeRef}
                src={htmlUrl} 
                style={{
                  width: '1920px',
                  height: '1080px',
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  transformOrigin: 'center center',
                  border: 'none',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  imageRendering: 'crisp-edges',
                  backfaceVisibility: 'hidden'
                }}
                sandbox="allow-scripts allow-same-origin"
                allow="webgpu; fullscreen"
                onLoad={handleIframeLoad}
              />
              {isGenerating && (
                <div className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                    <p className="text-[10px] tracking-[0.4em] text-blue-400 uppercase text-center">Baking animation frames...</p>
                </div>
              )}
              {isExporting && (
                 <div className="absolute inset-0 bg-black/50 z-50 flex flex-col justify-end p-8">
                      <div className="flex items-center gap-4 bg-red-500/20 text-red-400 p-4 rounded border border-red-500/50 backdrop-blur-md">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-xs font-mono uppercase tracking-widest">{status}</span>
                          <span className="ml-auto font-mono">{currentFrame} / {totalFrames}</span>
                      </div>
                 </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-2xl aspect-video bg-[#0a0a0a] rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center text-zinc-600">
              <Monitor size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-mono tracking-wider">AWAITING_PROMPT</p>
            </div>
          )}
        </div>

        {/* Code Panel */}
        {showCode && (
          <div className="h-full w-[400px] border-l border-white/10 bg-[#0d0d0d] flex flex-col shrink-0">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#111]">
              <div className="flex items-center gap-2 text-blue-400">
                <Code size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Canvas Output</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
              <pre className="text-[11px] font-mono leading-relaxed text-zinc-300">
                <code>{generatedCode || '// Code will appear here after generation'}</code>
              </pre>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/5 bg-[#0a0a0a] p-4">
        {/* Progress Bar */}
        <div className="mb-4 relative group">
          <div className="absolute inset-y-0 left-0 bg-blue-500/20 rounded-l-full pointer-events-none" style={{ width: `${totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0}%` }} />
          <input 
            type="range" 
            min="0" 
            max={totalFrames || 0} 
            value={currentFrame}
            onChange={(e) => {
              setIsPlaying(false);
              updateFrame(parseInt(e.target.value));
            }}
            className="w-full h-1.5 bg-[#222] rounded-full appearance-none outline-none cursor-pointer relative z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(59,130,246,0.8)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-150"
          />
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-6">
            <button 
              onClick={togglePlay}
              disabled={!htmlUrl || totalFrames === 0 || isExporting}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              {isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} className="ml-1" />}
            </button>
            <div className="flex flex-col">
              <div className="font-mono flex items-baseline">
                <span className="text-white text-2xl font-bold tracking-tighter">{formatTime(currentFrame, currentFPS || 60)}</span>
                <span className="text-zinc-600 mx-2 text-sm">/</span>
                <span className="text-zinc-500 text-sm">{formatTime(totalFrames, currentFPS || 60)}</span>
              </div>
              <div className="text-[9px] text-zinc-600 uppercase font-black tracking-widest">
                  SYNC STATUS: <span className={status.includes('ERROR') ? 'text-red-400' : 'text-blue-400'}>{status}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={handleExport}
              disabled={!htmlUrl || totalFrames === 0 || isExporting}
              className="text-[10px] font-bold text-green-400 border border-green-400/30 px-4 py-2 rounded hover:bg-green-400/10 uppercase tracking-widest disabled:opacity-30 transition-all flex items-center gap-2"
            >
              <Download size={14} />
              Export
            </button>
            <button 
              onClick={() => setShowCode(!showCode)}
              className={`text-[10px] font-bold border px-4 py-2 rounded uppercase tracking-widest transition-all flex items-center gap-2 ${showCode ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'text-zinc-500 border-transparent hover:text-white'}`}
            >
              <Code size={14} />
              Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
