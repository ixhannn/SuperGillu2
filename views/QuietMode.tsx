
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, Volume2, VolumeX, Wind, Heart, Cloud } from 'lucide-react';
import { ViewState, Memory } from '../types';
import { StorageService } from '../services/storage';

interface QuietModeProps {
  setView: (view: ViewState) => void;
}

type SoundType = 'none' | 'love' | 'wind';

// --- GENERATIVE AUDIO ENGINE ---
// This runs outside React render cycle for performance and gapless playback
class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private nodes: AudioNode[] = [];
  private masterGain: GainNode | null = null;

  init() {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.5; // Default volume
  }

  playLove() {
    this.stop();
    if (!this.ctx || !this.masterGain) this.init();
    if (!this.ctx) return;

    // Soft Loving Chord: C Major 9 (Open voicing for warmth)
    // C3, G3, B3, D4, E4 - A chord that feels like a warm hug
    const freqs = [130.81, 196.00, 246.94, 293.66, 329.63]; 
    
    freqs.forEach((f, i) => {
        // Create two oscillators per note for natural chorus/beating
        for (let j = 0; j < 2; j++) {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            const panner = this.ctx!.createStereoPanner();
            
            // Sine is softest, Triangle adds a tiny bit of texture
            osc.type = j === 0 ? 'sine' : 'triangle';
            osc.frequency.value = f;
            
            // Detune slightly for lushness (-4 to +4 cents)
            const detune = (Math.random() * 8) - 4;
            osc.detune.value = detune;

            // Pan slowly across the stereo field
            panner.pan.value = (Math.random() * 1.5) - 0.75;

            // Volume Envelope
            gain.gain.value = 0;
            
            // Signal Chain
            osc.connect(panner);
            panner.connect(gain);
            gain.connect(this.masterGain!);
            
            osc.start();
            
            // Very slow, gentle fade in
            const targetVol = (0.04 + (Math.random() * 0.02)); // Random volume per note
            gain.gain.linearRampToValueAtTime(targetVol, this.ctx!.currentTime + 4 + Math.random() * 3);

            // Add LFO for gentle "breathing" effect (Volume Swell)
            const lfo = this.ctx!.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.05 + (Math.random() * 0.05); // Very slow cycle (10-20s)
            const lfoGain = this.ctx!.createGain();
            lfoGain.gain.value = 0.01; // Subtle depth
            lfo.connect(lfoGain);
            lfoGain.connect(gain.gain);
            lfo.start();

            this.nodes.push(osc, gain, panner, lfo, lfoGain);
        }
    });
  }

  playWind() {
    this.stop();
    if (!this.ctx || !this.masterGain) this.init();
    if (!this.ctx) return;

    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Brown Noise generation
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        data[i] = lastOut * 3.5; 
        data[i] *= 0.1; 
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Heavy Lowpass for "Muffled/Cozy" sound
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;

    noise.connect(filter);
    filter.connect(this.masterGain!);
    noise.start();

    this.nodes.push(noise, filter);
  }

  stop() {
    this.nodes.forEach(n => {
        try { (n as any).stop(); } catch(e) {}
        n.disconnect();
    });
    this.nodes = [];
  }

  setVolume(val: number) {
    if (this.masterGain && this.ctx) {
        // Smooth transition
        this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.5);
    }
  }

  close() {
    this.stop();
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}

const audioEngine = new SoundscapeEngine();

export const QuietMode: React.FC<QuietModeProps> = ({ setView }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  
  // UI States
  const [showUI, setShowUI] = useState(false);
  const [soundMode, setSoundMode] = useState<SoundType>('love'); // Default to Love
  const [isMuted, setIsMuted] = useState(false);
  
  // Animation States
  const [opacity, setOpacity] = useState(0); 
  const [scale, setScale] = useState(1);

  // Use refs to avoid re-creating intervals on every state change
  const currentIndexRef = useRef(0);
  const memoriesRef = useRef<Memory[]>([]);
  const [currentMemory, setCurrentMemory] = useState<Memory | undefined>(undefined);

  useEffect(() => {
    const data = StorageService.getMemories();
    const shuffled = [...data].sort(() => 0.5 - Math.random());
    setMemories(shuffled);
    memoriesRef.current = shuffled;
    
    // Start Audio Engine
    audioEngine.playLove(); 

    return () => audioEngine.close();
  }, []);

  // Handle Sound Switching
  const changeSound = (mode: SoundType) => {
      setSoundMode(mode);
      setIsMuted(false);
      audioEngine.setVolume(0.5);
      
      if (mode === 'love') audioEngine.playLove();
      else if (mode === 'wind') audioEngine.playWind();
      else audioEngine.stop();
  };

  const toggleMute = () => {
      if (isMuted) {
          setIsMuted(false);
          audioEngine.setVolume(0.5);
      } else {
          setIsMuted(true);
          audioEngine.setVolume(0);
      }
  };

  // Slideshow Logic — single stable interval, uses refs to avoid stacking
  useEffect(() => {
    if (memoriesRef.current.length === 0 && memories.length === 0) return;
    memoriesRef.current = memories;

    const cycle = async () => {
        const mems = memoriesRef.current;
        if (mems.length === 0) return;

        // Fade Out & Zoom Reset
        setOpacity(0);
        
        await new Promise(r => setTimeout(r, 2000)); // Slow fade out

        // Change Content
        const nextIndex = (currentIndexRef.current + 1) % mems.length;
        currentIndexRef.current = nextIndex;
        
        const mem = mems[nextIndex];
        setCurrentMemory(mem);
        
        if (mem.image) setCurrentImage(mem.image);
        else if (mem.imageId || mem.storagePath) {
            const imgData = await StorageService.getImage(mem.imageId || '', undefined, mem.storagePath);
            setCurrentImage(imgData || null);
        } else {
            setCurrentImage(null);
        }

        // Reset Scale for Ken Burns effect
        setScale(1.0);
        
        // Short delay before fade in to allow image to load
        requestAnimationFrame(() => {
            setOpacity(1);
            setScale(1.1); // Start slowly zooming in
        });
    };

    // Initial load
    cycle();
    const timer = setInterval(cycle, 10000); // 10 seconds per memory
    
    return () => clearInterval(timer);
  }, [memories]);

  const handleInteraction = () => {
      setShowUI(true);
      if ((window as any).uiTimeout) clearTimeout((window as any).uiTimeout);
      (window as any).uiTimeout = setTimeout(() => setShowUI(false), 4000);
  };

  return ReactDOM.createPortal(
    <div 
        onClick={handleInteraction}
        className="fixed inset-0 bg-black z-[100] flex items-center justify-center overflow-hidden"
    >
        {/* Dynamic Background Layer (Ken Burns Effect) */}
        <div 
            className="absolute inset-0 bg-cover bg-center opacity-40 transition-all ease-linear"
            style={{ 
                backgroundImage: currentImage ? `url(${currentImage})` : 'none',
                filter: 'blur(15px)',
                transform: `scale(${scale})`,
                transitionDuration: '10000ms' // Matches cycle time
            }}
        ></div>
        
        {/* Overlay Gradient for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60"></div>
        
        {/* Content Layer */}
        <div 
            className="relative z-10 p-8 max-w-md text-center transition-opacity duration-[2000ms] flex flex-col items-center"
            style={{ opacity }}
        >
            {currentImage && (
                <div className="mb-10 shadow-2xl rounded-sm overflow-hidden border-8 border-white/10 max-h-[45vh] max-w-[85vw] transform rotate-1">
                    <img src={currentImage} alt="Memory" className="w-full h-full object-contain" />
                </div>
            )}
            
            {currentMemory && (
                <div className="space-y-4">
                    <p className="font-serif text-2xl md:text-3xl text-white/95 leading-relaxed drop-shadow-lg tracking-wide">
                        "{currentMemory.text}"
                    </p>
                    <div className="w-12 h-px bg-white/30 mx-auto"></div>
                    <p className="text-white/60 text-xs uppercase tracking-[0.2em] font-light">
                        {new Date(currentMemory.date).toDateString()}
                    </p>
                </div>
            )}

            {!currentMemory && (
                <div className="flex flex-col items-center gap-4 text-white/50">
                     <Cloud size={32} className="animate-pulse" />
                     <p className="text-sm font-light">Drifting into memories...</p>
                </div>
            )}
        </div>

        {/* Floating UI Overlay */}
        <div 
            className={`absolute inset-0 flex flex-col justify-between p-6 pointer-events-none transition-all duration-700 ${showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
            {/* Top Right: Standard Exit Button */}
            <div className="absolute top-6 right-6 pointer-events-auto z-50">
                <button 
                    onClick={() => {
                        audioEngine.close();
                        setView('home');
                    }}
                    className="p-3 bg-black/20 backdrop-blur-xl rounded-full text-white/80 transition-all shadow-lg active:scale-90"
                    aria-label="Exit Quiet Mode"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Top Bar: Sound Controls */}
            <div className="flex justify-center pointer-events-auto mt-2">
                <div className="bg-black/40 backdrop-blur-xl p-1.5 rounded-full border border-white/10 flex items-center gap-1 shadow-2xl">
                    <button 
                        onClick={() => changeSound('love')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${soundMode === 'love' && !isMuted ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/80'}`}
                    >
                        <Heart size={14} fill={soundMode === 'love' && !isMuted ? "currentColor" : "none"} />
                        <span className="text-xs font-medium">Love</span>
                    </button>
                    
                    <button 
                        onClick={() => changeSound('wind')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${soundMode === 'wind' && !isMuted ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/80'}`}
                    >
                        <Wind size={14} />
                        <span className="text-xs font-medium">Wind</span>
                    </button>

                    <div className="w-px h-4 bg-white/10 mx-1"></div>

                    <button 
                        onClick={toggleMute}
                        className={`p-2 rounded-full transition-all ${isMuted || soundMode === 'none' ? 'text-white/40' : 'text-white'}`}
                    >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                </div>
            </div>

            {/* Bottom Bar: Alternate Exit */}
            <div className="flex justify-center pointer-events-auto pb-8">
                <button 
                    onClick={() => {
                        audioEngine.close();
                        setView('home');
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-white transition-all active:scale-95 group"
                >
                    <X size={18} className="transition-transform" />
                    <span className="text-sm font-medium">Exit Quiet Mode</span>
                </button>
            </div>
        </div>
    </div>,
    document.body
  );
};
