import { useEffect, useRef, useState, useCallback } from 'react';
import { AttentionTracker, AttentionSession, AttentionEvent } from '@/lib/attention';

interface UseAttentionTrackerOptions {
  contentId: string;
  contentType: AttentionSession['contentType'];
  contentLength?: number;
  enabled?: boolean;
  getVisualFocusScore?: () => number;
  onSessionUpdate?: (session: AttentionSession) => void;
}

export function useAttentionTracker(options: UseAttentionTrackerOptions) {
  const trackerRef = useRef<AttentionTracker | null>(null);
  const [session, setSession] = useState<AttentionSession | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const start = useCallback((element: HTMLElement | Window | null) => {
    if (!element || !optionsRef.current.enabled) return;
    trackerRef.current?.end();
    const tracker = new AttentionTracker({
      contentId: optionsRef.current.contentId,
      contentType: optionsRef.current.contentType,
      contentLength: optionsRef.current.contentLength,
      getVisualFocusScore: optionsRef.current.getVisualFocusScore,
      onSessionUpdate: (s) => {
        setSession(s);
        optionsRef.current.onSessionUpdate?.(s);
      },
    });
    tracker.attach(element);
    trackerRef.current = tracker;
    setSession(tracker.getSession());
  }, []);

  const stop = useCallback(() => {
    const final = trackerRef.current?.end();
    trackerRef.current = null;
    setSession(null);
    return final;
  }, []);

  useEffect(() => {
    return () => {
      trackerRef.current?.end();
      trackerRef.current = null;
    };
  }, []);

  return {
    ref: start,
    session,
    stop,
  };
}
