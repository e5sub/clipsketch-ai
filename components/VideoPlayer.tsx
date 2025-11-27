import React, { useRef, useState, useEffect, useCallback } from 'react';
import { VideoState } from '../types';
import { formatTime } from '../utils';
import { 
  Play, Pause, Volume2, VolumeX, 
  Maximize, Minimize, Flag, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Button } from './Button';

interface VideoPlayerProps {
  src: string;
  onTag: (timestamp: number) => void;
  overrideDuration?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, onTag, overrideDuration }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSeekTimeRef = useRef<number>(0);
  // Use a ref for synchronous access inside event handlers to prevent race conditions
  const isDraggingRef = useRef(false);
  
  const [state, setState] = useState<VideoState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0, // Default to 0 (Muted)
    playbackRate: 1,
    isMuted: true, // Default to Muted
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Use overrideDuration if provided, otherwise fallback to state duration
  const effectiveDuration = (overrideDuration && overrideDuration > 0) ? overrideDuration : state.duration;

  // Initial setup when src changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      // Enforce default mute state
      videoRef.current.volume = 0;
      videoRef.current.muted = true;
      
      setState(prev => ({ 
        ...prev, 
        isPlaying: false, 
        currentTime: 0, 
        duration: 0,
        volume: 0,
        isMuted: true
      }));
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  }, [src]);

  // Handle Play/Pause
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (state.isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    }
  }, [state.isPlaying]);

  // Unified Seek Logic (Smart Step)
  const performSmartSeek = useCallback((direction: 'forward' | 'backward') => {
    const video = videoRef.current;
    if (!video) return;

    const duration = effectiveDuration || video.duration || 0;
    // Calculate dynamic step: 1/40th of duration, capped at 5s
    // If duration is infinite or 0 (stream loading), default to 5s
    const calculatedStep = (Number.isFinite(duration) && duration > 0) ? duration / 40 : 5;
    const step = Math.min(calculatedStep, 5);

    if (direction === 'forward') {
      video.currentTime = Math.min(duration || 100000, video.currentTime + step);
    } else {
      video.currentTime = Math.max(0, video.currentTime - step);
    }
  }, [effectiveDuration]);

  // Helper to safely update duration
  const updateDuration = () => {
    if (videoRef.current) {
      const d = videoRef.current.duration;
      // Only update if d is a finite number and positive
      if (Number.isFinite(d) && d > 0) {
        setState(prev => {
          // Avoid unnecessary re-renders
          if (Math.abs(prev.duration - d) > 0.1) {
            return { ...prev, duration: d };
          }
          return prev;
        });
      }
    }
  };

  // Handle Time Update
  const handleTimeUpdate = () => {
    // Crucial fix: Check the REF (synchronous) not the state (async)
    // to ensure we block updates immediately when dragging starts.
    if (videoRef.current && !isDraggingRef.current) {
      const timeSinceSeek = Date.now() - lastSeekTimeRef.current;
      if (timeSinceSeek < 200) return;

      setState(prev => ({
        ...prev,
        currentTime: videoRef.current!.currentTime,
      }));
      
      // Continuously check duration in case it updates during playback (common in streams)
      updateDuration();
    }
  };

  // Handle Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    
    // 1. Update UI state immediately so the slider moves with the mouse
    setState(prev => ({ ...prev, currentTime: time }));
    
    // Record timestamp of this seek action
    lastSeekTimeRef.current = Date.now();

    // 2. Request video seek
    if (videoRef.current) {
      // Use effective duration to clamp just in case
      const maxTime = effectiveDuration || 100000;
      videoRef.current.currentTime = Math.min(time, maxTime);
    }
  };

  const handleSeekStart = () => {
    isDraggingRef.current = true;
    setIsDragging(true);
  };
  
  const handleSeekEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  // Handle Volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = volume === 0;
      setState(prev => ({ 
        ...prev, 
        volume, 
        isMuted: volume === 0 
      }));
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !state.isMuted;
      videoRef.current.muted = newMuted;
      // Restore volume if unmuting from 0
      if (!newMuted && state.volume === 0) {
        videoRef.current.volume = 0.5;
        setState(prev => ({ ...prev, isMuted: false, volume: 0.5 }));
      } else {
        setState(prev => ({ ...prev, isMuted: newMuted }));
      }
    }
  };

  // Handle Speed
  const handleSpeedChange = () => {
    const speeds = [0.5, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(state.playbackRate);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
      setState(prev => ({ ...prev, playbackRate: nextSpeed }));
    }
  };

  // Handle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT') return;

      const video = videoRef.current;
      if (!video) return;

      const duration = effectiveDuration || video.duration || 0;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        // Shift: 10s, Alt: 1 frame (approx), Default: Smart Step
        if (e.shiftKey) {
           video.currentTime = Math.min(duration || 100000, video.currentTime + 10);
        } else if (e.altKey) {
           video.currentTime = Math.min(duration || 100000, video.currentTime + 0.04);
        } else {
           performSmartSeek('forward');
        }
      } else if (e.code === 'ArrowLeft') {
        if (e.shiftKey) {
           video.currentTime = Math.max(0, video.currentTime - 10);
        } else if (e.altKey) {
           video.currentTime = Math.max(0, video.currentTime - 0.04);
        } else {
           performSmartSeek('backward');
        }
      } else if (e.key === '.' || e.key === '>') {
         // Frame forward (approx 30ms for 30fps)
         video.pause();
         setState(prev => ({ ...prev, isPlaying: false }));
         video.currentTime += 0.033;
      } else if (e.key === ',' || e.key === '<') {
         // Frame backward
         video.pause();
         setState(prev => ({ ...prev, isPlaying: false }));
         video.currentTime -= 0.033;
      } else if (e.code === 'KeyT') {
        onTag(video.currentTime || 0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, onTag, effectiveDuration, performSmartSeek]);

  // Listen for jump events
  useEffect(() => {
    const handleJump = (e: CustomEvent<number>) => {
      if (videoRef.current) {
        // Force Pause when jumping to a tag
        videoRef.current.pause();
        videoRef.current.currentTime = e.detail;
        
        setState(prev => ({ 
          ...prev, 
          currentTime: e.detail, 
          isPlaying: false 
        }));
        
        lastSeekTimeRef.current = Date.now();
      }
    };
    window.addEventListener('jump-to-timestamp' as any, handleJump as any);
    return () => window.removeEventListener('jump-to-timestamp' as any, handleJump as any);
  }, []);


  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-slate-950 flex flex-col overflow-hidden"
    >
      {/* Video Container - Takes remaining space */}
      <div className="flex-1 relative min-h-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-black to-black flex items-center justify-center group">
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-contain"
          onClick={togglePlay}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={updateDuration}
          onDurationChange={updateDuration}
          onEnded={() => setState(prev => ({ ...prev, isPlaying: false }))}
          muted={true} // Default prop
          {...({ referrerPolicy: "no-referrer" } as any)}
        />
      </div>

      {/* Control Bar - Compact Footer */}
      <div className="shrink-0 bg-slate-900 border-t border-slate-800 px-2 sm:px-3 py-2 select-none z-10">
        {/* Progress Bar Container - Compact */}
        <div className="group/slider relative w-full h-3 mb-1 flex items-center cursor-pointer">
           {/* Background Track */}
           <div className="absolute w-full h-1 bg-slate-700/50 rounded-full group-hover/slider:h-1.5 transition-all"></div>
           
           {/* Visual progress */}
           <div 
             className="absolute h-1 group-hover/slider:h-1.5 bg-indigo-500 rounded-full transition-all duration-75 pointer-events-none"
             style={{ 
               width: `${effectiveDuration > 0 ? (state.currentTime / effectiveDuration) * 100 : 0}%` 
             }}
           />
           
           {/* Seek slider input */}
           <input
            type="range"
            min="0"
            max={effectiveDuration > 0 ? effectiveDuration : 100}
            step="any"
            value={state.currentTime}
            onChange={handleSeek}
            onMouseDown={handleSeekStart}
            onMouseUp={handleSeekEnd}
            onTouchStart={handleSeekStart}
            onTouchEnd={handleSeekEnd}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={!effectiveDuration}
          />
        </div>

        {/* Buttons Row - Responsive Layout */}
        <div className="flex items-center justify-between relative gap-1 sm:gap-2">
          
          {/* Left Controls Group */}
          <div className="flex items-center gap-1 sm:gap-2 z-10 shrink-0">
            {/* Backward Button */}
            <button 
              onClick={() => performSmartSeek('backward')}
              className="text-slate-400 hover:text-white transition-colors focus:outline-none p-1 hover:bg-slate-800 rounded shrink-0"
              title="后退 (Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Play/Pause */}
            <button 
              onClick={togglePlay}
              className="text-white hover:text-indigo-400 transition-colors focus:outline-none mx-0.5 sm:mx-1 shrink-0"
              title={state.isPlaying ? "暂停 (Space)" : "播放 (Space)"}
            >
              {state.isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />}
            </button>

            {/* Forward Button */}
            <button 
              onClick={() => performSmartSeek('forward')}
              className="text-slate-400 hover:text-white transition-colors focus:outline-none p-1 hover:bg-slate-800 rounded shrink-0"
              title="前进 (Right Arrow)"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            
            {/* Volume Group */}
            <div className="flex items-center gap-1 sm:gap-2 group/volume ml-1 sm:ml-2 border-l border-slate-800 pl-2 sm:pl-3 shrink-0">
              <button onClick={toggleMute} className="text-slate-400 hover:text-white focus:outline-none shrink-0">
                {state.isMuted || state.volume === 0 ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              {/* Volume Slider - Hidden on mobile to save space */}
              <div className="w-16 sm:w-20 hidden sm:block">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.isMuted ? 0 : state.volume}
                  onChange={handleVolumeChange}
                  className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none block"
                />
              </div>
            </div>

            {/* Time Display - Smaller on mobile */}
            <span className="text-[10px] sm:text-xs font-mono text-slate-400 select-none min-w-[60px] sm:min-w-[80px] ml-1 sm:ml-2 hidden xs:inline-block">
              {formatTime(state.currentTime)} / {formatTime(effectiveDuration)}
            </span>
          </div>

          {/* Centered Instruction Text (Hidden on small screens) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden xl:block">
             <span className="text-[10px] text-slate-500/70 font-medium tracking-wide">
               按左右键调节进度，空格控制播放暂停，不要用鼠标点击进度条
             </span>
          </div>

          {/* Right Controls Group */}
          <div className="flex items-center gap-1 sm:gap-2 z-10 shrink-0">
            <Button 
              onClick={() => onTag(state.currentTime)}
              variant="primary"
              size="sm"
              className="flex items-center gap-1 h-6 sm:h-7 text-[10px] sm:text-xs px-1.5 sm:px-2 shadow-sm shadow-indigo-500/20 shrink-0"
              title="添加标记 (T)"
            >
              <Flag className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Tag</span>
            </Button>

            <button 
              onClick={handleSpeedChange}
              className="px-1 sm:px-1.5 py-0.5 bg-slate-800 rounded hover:bg-slate-700 text-[10px] font-bold text-slate-300 min-w-[2rem] sm:min-w-[2.5rem] transition-colors focus:outline-none border border-slate-700 h-6 sm:h-7 shrink-0"
              title="播放倍速"
            >
              {state.playbackRate}x
            </button>

            <button onClick={toggleFullscreen} className="text-slate-400 hover:text-white focus:outline-none ml-0.5 sm:ml-1 shrink-0">
              {isFullscreen ? <Minimize className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};