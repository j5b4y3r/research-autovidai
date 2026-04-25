import React, { useState, useRef, useEffect } from 'react';
import { Download, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { GeneratedScene } from '../types';
import * as Mp4Muxer from 'mp4-muxer';
import * as WebMMuxer from 'webm-muxer';
import { toCanvas } from 'html-to-image';
import { sfxEngine } from '../services/sfxEngine';

interface ExportDialogProps {
  scenes: GeneratedScene[];
  voiceoverAudioUrl?: string | null;
  onClose: () => void;
}

export function ExportDialog({ scenes, voiceoverAudioUrl, onClose }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [resolution, setResolution] = useState<'1080p' | '4K'>('1080p');

  const captureRef = useRef<HTMLDivElement>(null);
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);

  const totalDuration = scenes.length > 0 ? scenes[scenes.length - 1].endTime : 0;
  const fps = 30;
  const totalFrames = Math.ceil(totalDuration * fps);

  const width = resolution === '4K' ? 3840 : 1920;
  const height = resolution === '4K' ? 2160 : 1080;

  // Make sure we preload cues inside ExportDialog properly
  useEffect(() => {
    const allNames = scenes.flatMap(s => s.sfxCues ? s.sfxCues.map(c => c.name) : []);
    if (allNames.length > 0) {
      sfxEngine.preload(allNames);
    }
  }, [scenes]);

  const startExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setError(null);
    setStatus('Initializing encoder...');

    try {
      if (!captureRef.current) throw new Error("Capture container not found");
      if (typeof window.VideoEncoder !== 'function') {
        throw new Error("WebCodecs (VideoEncoder) is not supported in this browser.");
      }

      let muxerTarget: any;
      let muxer: any;
      let videoEncoder: VideoEncoder;
      let audioEncoder: AudioEncoder | null = null;
      let audioSampleRate = 48000;

      // Audio setup (only if cues exist)
      let renderedAudio: AudioBuffer | null = null;
      let hasAudioCues = scenes.some(s => s.sfxCues && s.sfxCues.length > 0) || !!voiceoverAudioUrl;
      let offlineCtx: OfflineAudioContext | null = null;

      if (hasAudioCues) {
        const allNames = scenes.flatMap(s => s.sfxCues ? s.sfxCues.map(c => c.name) : []);
        await sfxEngine.preload(allNames);

        offlineCtx = new OfflineAudioContext(2, Math.max(1, Math.ceil(totalDuration * audioSampleRate)), audioSampleRate);
        
        if (voiceoverAudioUrl) {
           try {
             const res = await fetch(voiceoverAudioUrl);
             const arrBuf = await res.arrayBuffer();
             const voiceoverBuffer = await offlineCtx.decodeAudioData(arrBuf);
             
             const source = offlineCtx.createBufferSource();
             source.buffer = voiceoverBuffer;
             source.connect(offlineCtx.destination);
             source.start(0);
           } catch (e) {
             console.error("Failed to decode voiceover audio for export", e);
           }
        }
        
        for (const scene of scenes) {
          const cues = scene.sfxCues || [];
          for (const cue of cues) {
            const buffer = sfxEngine.getBuffer(cue.name);
            if (!buffer) continue;
            
            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            
            const gain = offlineCtx.createGain();
            gain.gain.value = Math.max(0, Math.min(1, cue.volume || 1)) * 0.5;
            
            source.connect(gain);
            gain.connect(offlineCtx.destination);
            
            const startGlob = scene.startTime + (cue.startTimeMs / 1000);
            if (cue.endTimeMs) {
              source.loop = true;
              source.start(startGlob);
              source.stop(scene.startTime + (cue.endTimeMs / 1000));
            } else {
              source.start(startGlob);
            }
          }
        }
        renderedAudio = await offlineCtx.startRendering();
      }

      let hasAudio = false;

      if (format === 'mp4') {
        const videoCodec = resolution === '4K' ? 'avc1.42E033' : 'avc1.42E02A'; // Constrained Baseline Profile (no B-frames) to enforce strictly monotonic DTS
        
        const videoConfig: VideoEncoderConfig = {
          codec: videoCodec, 
          width, 
          height, 
          bitrate: resolution === '4K' ? 12_000_000 : 8_000_000,
          avc: { format: 'avc' }, 
        };

        // @ts-ignore
        const audioConfig: AudioEncoderConfig = { 
          codec: 'mp4a.40.2', 
          sampleRate: audioSampleRate, 
          numberOfChannels: 2, 
          bitrate: 128_000,
          aac: { format: 'aac' }
        } as any;

        const vSupport = await VideoEncoder.isConfigSupported(videoConfig);
        if (!vSupport.supported) {
           throw new Error(`Video configuration not supported: ${videoCodec} at ${width}x${height}`);
        }

        const aSupport = await AudioEncoder.isConfigSupported(audioConfig);
        hasAudio = aSupport.supported && renderedAudio !== null;

        muxerTarget = new Mp4Muxer.ArrayBufferTarget();
        const muxerOptions: any = {
          target: muxerTarget,
          video: { codec: 'avc', width, height, frameRate: fps },
          fastStart: 'in-memory',
          firstTimestampBehavior: 'offset',
        };
        if (hasAudio) {
           muxerOptions.audio = { codec: 'aac', sampleRate: audioSampleRate, numberOfChannels: 2 };
        }
        muxer = new Mp4Muxer.Muxer(muxerOptions);

        videoEncoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => { throw e; },
        });
        videoEncoder.configure(videoConfig);

        if (hasAudio) {
          audioEncoder = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: (e) => { console.warn("Audio encoding error ignored", e); }
          });
          try {
            audioEncoder.configure(audioConfig);
          } catch (e) {
            console.warn("Audio configure failed, disabling audio");
            hasAudio = false;
            audioEncoder = null;
          }
        }

      } else {
        let opusSampleRate = 48000;
        const videoCodec = 'vp8'; 

        const videoConfig: VideoEncoderConfig = {
          codec: videoCodec, 
          width, 
          height, 
          bitrate: resolution === '4K' ? 12_000_000 : 8_000_000, 
        };

        const audioConfig: AudioEncoderConfig = { 
          codec: 'opus', 
          sampleRate: opusSampleRate, 
          numberOfChannels: 2, 
          bitrate: 128_000 
        };

        const vSupport = await VideoEncoder.isConfigSupported(videoConfig);
        if (!vSupport.supported) {
           throw new Error(`Video configuration not supported: ${videoCodec} at ${width}x${height}`);
        }

        const aSupport = await AudioEncoder.isConfigSupported(audioConfig);
        hasAudio = aSupport.supported && renderedAudio !== null;

        muxerTarget = new WebMMuxer.ArrayBufferTarget();
        const muxerOptions: any = {
          target: muxerTarget,
          video: { codec: 'V_VP8', width, height, frameRate: fps },
          firstTimestampBehavior: 'offset',
        };
        if (hasAudio) {
           muxerOptions.audio = { codec: 'A_OPUS', sampleRate: opusSampleRate, numberOfChannels: 2 };
        }
        muxer = new WebMMuxer.Muxer(muxerOptions);

        videoEncoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => { throw e; },
        });
        videoEncoder.configure(videoConfig);

        if (hasAudio) {
          audioEncoder = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: (e) => { console.warn("Audio encoding error ignored", e); }
          });
          try {
            audioEncoder.configure(audioConfig);
            audioSampleRate = opusSampleRate;
          } catch (e) {
            console.warn("Audio configure failed, disabling audio");
            hasAudio = false;
            audioEncoder = null;
          }
        }
      }

      setStatus('Processing visual assets...');
      // Inline all images in all iframes to Data URIs to completely bypass html-to-image's internal caching 
      // bug which mixes up cross-origin assets across identical HTML tags or multiple toCanvas calls.
      for (const iframe of iframeRefs.current) {
         if (!iframe || !iframe.contentDocument) continue;
         const imgs = Array.from(iframe.contentDocument.querySelectorAll('img')) as HTMLImageElement[];
         for (const img of imgs) {
            if (img.src && !img.src.startsWith('data:')) {
               try {
                  const res = await fetch(img.src);
                  const blob = await res.blob();
                  const reader = new FileReader();
                  const base64 = await new Promise((resolve, reject) => {
                     reader.onloadend = () => resolve(reader.result);
                     reader.onerror = reject;
                     reader.readAsDataURL(blob);
                  });
                  img.src = base64 as string;
               } catch (e) {
                  console.warn("Failed to inline image for export:", img.src, e);
               }
            }
         }
      }

      setStatus('Capturing video & audio frames...');
      const frameDuration = 1000000 / fps; // in microseconds

      // Pre-create a master canvas for compositing
      const masterCanvas = document.createElement('canvas');
      masterCanvas.width = width;
      masterCanvas.height = height;
      const masterCtx = masterCanvas.getContext('2d');
      if (!masterCtx) throw new Error("Could not create 2D context for compositing");

      let audioOffset = 0;
      const audioSampleRateForEncode = renderedAudio ? renderedAudio.sampleRate : 48000;

      for (let i = 0; i < totalFrames; i++) {
        const currentTime = i / fps;
        
        // Clear master canvas
        masterCtx.fillStyle = '#000000';
        masterCtx.fillRect(0, 0, width, height);

      // Identify active scenes and capture them individually
        const activeScenes = scenes
          .map((scene, index) => ({ scene, index }))
          .filter(({ scene }) => currentTime >= scene.startTime && currentTime <= scene.endTime);

        for (const { scene, index } of activeScenes) {
          const iframe = iframeRefs.current[index];
          if (!iframe?.contentWindow || !iframe.contentDocument?.body) continue;

          // 1. Seek the specific iframe
          const localTime = currentTime - scene.startTime;
          const progress = Math.max(0, Math.min(1, localTime / scene.duration));
          
          // Get the actual frames reported by the AI if available, or fallback to fixed conversion
          // @ts-ignore
          const actualFrames = iframe.contentWindow.TOTAL_FRAMES || Math.round(scene.duration * 30);
          const frameIndex = Math.floor(progress * (actualFrames - 1));

          try {
            // @ts-ignore
            if (typeof iframe.contentWindow.seekTo === 'function') {
              // @ts-ignore
              iframe.contentWindow.seekTo(frameIndex);
            }
          } catch (e) {}

          // 2. WAIT FOR RENDERING
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          
          // 3. CAPTURE (Optimized: Direct Canvas Draw if possible)
          try {
            const innerCanvas = iframe.contentDocument.querySelector('canvas');
            if (innerCanvas) {
              // Direct canvas draw is 10x faster and perfect quality
               masterCtx.drawImage(innerCanvas, 0, 0, width, height);
            } else {
              // Fallback to slower toCanvas for DOM elements
              const layerCanvas = await toCanvas(iframe.contentDocument.body, {
                width: 1920,
                height: 1080,
                pixelRatio: width / 1920,
                skipAutoScale: true,
                backgroundColor: 'transparent',
              });
              masterCtx.drawImage(layerCanvas, 0, 0, width, height);
            }
          } catch (err) {
            console.error(`Layer capture failed for scene ${index} at frame ${i}`, err);
          }
        }

        try {
          const bitmap = await createImageBitmap(masterCanvas);
          const timestamp = Math.round(i * frameDuration);
          const duration = Math.round(frameDuration);

          videoEncoder.encode(new VideoFrame(bitmap, { timestamp, duration }), { 
            keyFrame: i % 30 === 0 
          });
          
          bitmap.close();
          setProgress(Math.round(((i + 1) / totalFrames) * 100));
        } catch (captureErr: any) {
          console.error("Frame export failed", i, captureErr);
        }
        
        // Encode corresponding Audio Frame(s)
        if (hasAudio && audioEncoder && renderedAudio) {
            const nextVideoTime = (i + 1) / fps;
            const targetAudioOffset = Math.min(renderedAudio.length, Math.ceil(nextVideoTime * audioSampleRateForEncode));
            
            while (audioOffset < targetAudioOffset) {
                const length = Math.min(4096, targetAudioOffset - audioOffset); // Chunk limit to avoid encoder stalls
                const data = new Float32Array(length * 2);
    
                if (renderedAudio.numberOfChannels > 0) {
                   data.set(renderedAudio.getChannelData(0).subarray(audioOffset, audioOffset + length), 0);
                   if (renderedAudio.numberOfChannels > 1) {
                      data.set(renderedAudio.getChannelData(1).subarray(audioOffset, audioOffset + length), length);
                   } else {
                      data.set(renderedAudio.getChannelData(0).subarray(audioOffset, audioOffset + length), length); // duplicate mono
                   }
                }
                
                try {
                  const audioData = new AudioData({
                      format: 'f32-planar',
                      sampleRate: audioSampleRateForEncode,
                      numberOfFrames: length,
                      numberOfChannels: 2,
                      timestamp: Math.round((audioOffset / audioSampleRateForEncode) * 1_000_000),
                      data: data
                  });
                  
                  audioEncoder.encode(audioData);
                  audioData.close();
                } catch (encodeErr) {
                   console.warn("Audio frame encode failed, skipping", encodeErr);
                }
                audioOffset += length;
            }
        }
        
        // Release loop to UI occasionally
        if (i % 5 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      setStatus('Finalizing video file...');
      
      const flushPromises: Promise<void>[] = [videoEncoder.flush()];
      if (hasAudio && audioEncoder) {
          flushPromises.push(audioEncoder.flush());
      }
      
      try {
          await Promise.all(flushPromises);
      } catch (e) {
          console.warn("Encoder flush warning:", e);
      }
      
      videoEncoder.close();
      if (audioEncoder) audioEncoder.close();

      muxer.finalize();
      
      const blob = new Blob([muxerTarget.buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `explainer-video-${resolution}-${fps}fps.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      
      setIsExporting(false);
      setStatus('Done!');
    } catch (err: any) {
      console.error("Detailed Export Failure:", err);
      let msg = "Unknown error during export";
      if (err instanceof Error) msg = err.message;
      else if (typeof err === 'string') msg = err;
      else if (err?.message) msg = err.message;
      else if (err?.isTrusted) msg = "Browser security policy blocked capture";
      
      setError(msg);
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl w-full max-w-md p-6 flex flex-col gap-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-blue-500/10 blur-[60px] pointer-events-none" />

        <div className="flex justify-between items-center relative">
          <h3 className="text-xl font-semibold text-white">Export Video</h3>
          <button 
            onClick={onClose} 
            disabled={isExporting}
            className="text-zinc-500 hover:text-white transition-colors disabled:opacity-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {!isExporting && status !== 'Done!' && (
          <div className="space-y-4 relative">
            <div className="bg-[#161616] p-4 rounded-xl space-y-4 border border-white/5">
              
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Format</label>
                <div className="flex gap-2">
                  <button onClick={() => setFormat('mp4')} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${format === 'mp4' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#0f0f0f] border-[#222] text-zinc-400 hover:text-white'}`}>MP4</button>
                  <button onClick={() => setFormat('webm')} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${format === 'webm' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#0f0f0f] border-[#222] text-zinc-400 hover:text-white'}`}>WebM</button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Resolution</label>
                <div className="flex gap-2">
                  <button onClick={() => setResolution('1080p')} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${resolution === '1080p' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#0f0f0f] border-[#222] text-zinc-400 hover:text-white'}`}>1080p (FHD)</button>
                  <button onClick={() => setResolution('4K')} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${resolution === '4K' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#0f0f0f] border-[#222] text-zinc-400 hover:text-white'}`}>4K (UHD)</button>
                </div>
              </div>
              
            </div>
            <button 
              onClick={startExport}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/10 active:scale-95"
            >
              <Download className="w-5 h-5" />
              Start Export
            </button>
          </div>
        )}

        {isExporting && (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-5">
              <div className="relative">
                 <Loader2 className="w-14 h-14 text-blue-500 animate-spin" />
                 <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-blue-400">{progress}%</span>
                 </div>
              </div>
              <div className="text-center">
                <p className="text-white font-medium text-lg leading-tight">{status}</p>
                <p className="text-zinc-500 text-xs mt-2 italic">Do not close this tab</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-1.5 w-full bg-[#1a1a1a] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {!isExporting && status === 'Done!' && (
          <div className="flex flex-col items-center gap-6 py-6 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center shadow-inner shadow-green-500/20">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <div className="space-y-1">
              <p className="text-white font-semibold text-xl">Export Complete!</p>
              <p className="text-zinc-500 text-sm">Your cinematic video is ready.</p>
            </div>
            <button 
              onClick={onClose}
              className="w-full bg-[#1a1a1a] hover:bg-[#252525] text-white font-medium py-3 rounded-xl transition-all border border-white/5"
            >
              Back to Editor
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3 mt-4 animate-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        <div style={{ position: 'fixed', left: '-10000px', top: '0', pointerEvents: 'none' }}>
          <div 
            ref={captureRef} 
            style={{ 
              width: `${width}px`, 
              height: `${height}px`, 
              position: 'relative', 
              background: '#000000',
              overflow: 'hidden' 
            }}
          >
            {scenes.map((scene, index) => (
              <iframe 
                key={scene.id}
                ref={el => iframeRefs.current[index] = el}
                src={scene.htmlUrl} 
                style={{
                  width: `${width}px`,
                  height: `${height}px`,
                  border: 'none',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  opacity: 0, // initially hidden
                  zIndex: index
                }}
                sandbox="allow-scripts allow-same-origin"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
