import React, { useMemo, useEffect, useState, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export interface ThoughtData {
  subject: string;
  description: string;
}

interface ThoughtDisplayProps {
  thought?: ThoughtData;
  style?: 'default' | 'compact';
  running?: boolean;
}

// Background gradient constants
const GRADIENT_DARK = 'linear-gradient(135deg, rgba(70, 71, 103, 0.4) 0%, rgba(50, 50, 50, 0.4) 100%)';
const GRADIENT_LIGHT = 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)';

export const ThoughtDisplay: React.FC<ThoughtDisplayProps> = ({
  thought,
  style = 'default',
  running = false,
}) => {
  const { isDark } = useTheme();

  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!running && !thought?.subject) {
      setElapsedTime(0);
      return;
    }

    startTimeRef.current = Date.now();
    setElapsedTime(0);

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [running, thought?.subject]);

  const containerStyle = useMemo(() => {
    const background = isDark ? GRADIENT_DARK : GRADIENT_LIGHT;
    if (style === 'compact') {
      return { background, marginBottom: '8px', maxHeight: '100px', overflow: 'auto' };
    }
    return { background };
  }, [isDark, style]);

  if (!thought?.subject && !running) return null;

  if (running && !thought?.subject) {
    return (
      <div
        className='relative z-1 mb-[-20px] pb-[30px] px-[10px] py-[10px] rounded-t-[20px] text-[14px] leading-[20px] flex items-center gap-[8px]'
        style={containerStyle}
      >
        <Loader2 className="size-3.5 animate-spin text-zinc-500" />
        <span className='text-zinc-400'>
          Processing
          <span className='ml-2 opacity-60'>({formatElapsedTime(elapsedTime)})</span>
        </span>
      </div>
    );
  }

  const showDescription = thought?.description && thought.description !== thought.subject;

  return (
    <div
      className='relative z-1 mb-[-20px] pb-[30px] px-[10px] py-[10px] rounded-t-[20px] text-[14px] leading-[20px]'
      style={containerStyle}
    >
      <div className='flex items-center gap-[8px]'>
        {running && <Loader2 className="size-3.5 animate-spin text-zinc-500" />}
        <span className="bg-blue-500/10 text-blue-500 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wider">
          {thought?.subject}
        </span>
        {showDescription && <span className='flex-1 truncate text-zinc-300'>{thought?.description}</span>}
        {running && (
          <span className='text-zinc-500 text-[12px] whitespace-nowrap'>({formatElapsedTime(elapsedTime)})</span>
        )}
      </div>
    </div>
  );
};
