// SFX URLs mappings to standard reliable public sound files for demonstration
// The user mentions later using local Base64 / Blobs, which operates identical to this fetch logic
const SFX_URLS: Record<string, string> = {
  'whoosh_fast': '/sfx/fast-whoosh.mp3',
  'whoosh_slow': '/sfx/transition-whoosh.mp3',
  'pop': '/sfx/pop_7e9Is8L.mp3',
  'mouse_click': '/sfx/mouse-click-sound.mp3',
  'counter_tick': 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_49ba65ffda.mp3?filename=tick-40822.mp3',
  'cha_ching': '/sfx/cha-ching-money.mp3',
  'impact_fast': '/sfx/impact1.mp3',
  'swoosh_sfx': '/sfx/swoosh-sound-effects.mp3',
  'typing': '/sfx/keyboard-click.mp3',
  'pop_fast': '/sfx/89534__cgeffex__very-fast-bubble-pop1.mp3',
  'riser_metallic': '/sfx/popular-riser-metallic-sound-effect.mp3',
  'camera_sutter': '/sfx/camera_zLdd1zp.mp3',
  'notification': '/sfx/notification_o14egLP.mp3',
  'ding': '/sfx/ding-sound-effect_2.mp3',
  'error_glitch': '/sfx/error-glitch.mp3',
  'impact_slow': '/sfx/cinematic-impact.mp3',
};

export class SFXEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private preloading = new Set<string>();
  private lastTick: Record<string, number> = {};
  private activeContinuous = new Map<string, { source: AudioBufferSourceNode, gain: GainNode }>();
  
  private masterGain: GainNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.streamDestination = this.ctx.createMediaStreamDestination();
      
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.connect(this.streamDestination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  getStream(): MediaStream | null {
    return this.streamDestination ? this.streamDestination.stream : null;
  }

  private scheduledNodes: AudioBufferSourceNode[] = [];

  schedule(name: string, delaySecs: number, durationSecs?: number, volume: number = 1.0) {
    this.init();
    if (!this.ctx) return;
    
    if (delaySecs < 0) {
       if (durationSecs) durationSecs += delaySecs;
       delaySecs = 0;
    }

    const buffer = this.buffers.get(name);
    if (!buffer) {
       return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.5;

    source.connect(gain);
    if (this.masterGain) {
      gain.connect(this.masterGain);
    } else {
      gain.connect(this.ctx.destination);
    }

    const startTime = this.ctx.currentTime + delaySecs;
    if (durationSecs) {
       source.loop = true;
       source.start(startTime);
       source.stop(startTime + durationSecs);
    } else {
       source.start(startTime);
    }
    
    this.scheduledNodes.push(source);
    
    source.onended = () => {
       const idx = this.scheduledNodes.indexOf(source);
       if (idx > -1) this.scheduledNodes.splice(idx, 1);
       source.disconnect();
       gain.disconnect();
    };
  }

  stopAll() {
    this.activeContinuous.forEach((val) => {
      try { val.source.stop(); } catch(e) {}
    });
    this.activeContinuous.clear();

    this.scheduledNodes.forEach(node => {
      try { node.stop(); } catch(e) {}
      try { node.disconnect(); } catch(e) {}
    });
    this.scheduledNodes = [];
  }

  getBuffer(name: string): AudioBuffer | undefined {
    return this.buffers.get(name);
  }

  // Preloads an array of sound effect names. Fetches as ArrayBuffer, decodes, and stores in memory.
  async preload(names: string[]) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    
    await Promise.all(names.map(async (name) => {
      // If already loaded, preloading currently, or unknown link -> skip
      if (!SFX_URLS[name]) {
         console.warn(`SFX Engine: '${name}' has no URL configured in SFX_URLS.`);
         return;
      }
      if (this.buffers.has(name) || this.preloading.has(name)) return;
      
      this.preloading.add(name);
      try {
        const res = await fetch(SFX_URLS[name]);
        if (!res.ok) {
            throw new Error(`HTTP status ${res.status}`);
        }
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(name, audioBuffer);
      } catch (e) {
        console.error(`error fetching sfx '${name}':`, e);
      }
      this.preloading.delete(name);
    }));
  }

  startContinuous(name: string, volume: number = 1.0) {
    if (this.activeContinuous.has(name)) return;
    this.init();
    if (!this.ctx) return;

    const buffer = this.buffers.get(name);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.4;

    source.connect(gain);
    if (this.masterGain) {
      gain.connect(this.masterGain);
    } else {
      gain.connect(this.ctx.destination);
    }
    source.start(0);

    this.activeContinuous.set(name, { source, gain });
  }

  stopContinuous(name: string) {
    const active = this.activeContinuous.get(name);
    if (active) {
      try { active.source.stop(); } catch(e) {}
      this.activeContinuous.delete(name);
    }
  }

  tick(name: string, volume: number = 1.0) {
    // Throttled triggering (legacy or for specific stutter effects)
    this.init();
    const now = performance.now();
    const rateLimit = name === 'typing' ? 60 : name === 'counter_tick' ? 40 : 100;
    
    if (!this.lastTick[name] || now - this.lastTick[name] > rateLimit) {
      this.play(name, volume * 0.6);
      this.lastTick[name] = now;
    }
  }

  play(name: string, volume: number = 1.0) {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    
    const buffer = this.buffers.get(name);
    if (!buffer) return; // Silent fallback if not loaded or failed

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume)) * 0.5; // Overall master volume headroom
    
    source.connect(master);
    if (this.masterGain) {
      master.connect(this.masterGain);
    } else {
      master.connect(ctx.destination);
    }
    source.start(0);
  }
}

export const sfxEngine = new SFXEngine();
