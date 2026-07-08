import { useEffect, useRef, useState, useCallback } from 'react';
import { VisualSupervisor, VisualSupervisionState, VisualSupervisionEvent } from '@/lib/visual-supervision';
import { useGraphStore } from '@/hooks/useGraphStore';
import { generateId } from '@/lib/graph-utils';

const globalSupervisor = new VisualSupervisor();

export function useVisualSupervisor() {
  const [state, setState] = useState<VisualSupervisionState>(globalSupervisor.getState());
  const [error, setError] = useState<string>('');
  const mountedRef = useRef(false);
  const sessionStartRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    globalSupervisor.setOnStateUpdate((s) => {
      if (mountedRef.current) setState(s);
    });
    globalSupervisor.setOnEvent((e) => {
      if (e.type === 'started') {
        sessionStartRef.current = e.timestamp;
      }
      if (e.type === 'stopped' && sessionStartRef.current) {
        const finalState = globalSupervisor.getState();
        useGraphStore.getState().addFocusSession({
          id: generateId('focus'),
          startedAt: sessionStartRef.current,
          endedAt: e.timestamp,
          effectiveMs: finalState.correctedEffectiveMs || finalState.effectiveMs,
          visualFocusScore: finalState.visualFocusScore,
          fatigueScore: finalState.fatigueScore,
          faceLostMs: finalState.faceLostMs,
          lookingAwayMs: finalState.lookingAwayMs,
        });
        sessionStartRef.current = null;
      }
      if (!mountedRef.current) return;
      if (e.type === 'error') {
        setError(String(e.metadata?.message || '摄像头错误'));
      }
    });
    // Sync initial state in case supervisor is already running
    setState(globalSupervisor.getState());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const start = useCallback(async (videoElement: HTMLVideoElement) => {
    setError('');
    await globalSupervisor.start(videoElement);
  }, []);

  const stop = useCallback(async () => {
    await globalSupervisor.stop();
  }, []);

  const pause = useCallback(() => {
    globalSupervisor.pause();
  }, []);

  const resume = useCallback(() => {
    globalSupervisor.resume();
  }, []);

  const correctTime = useCallback((deltaMs: number) => {
    globalSupervisor.correctEffectiveTime(deltaMs);
  }, []);

  const startCalibration = useCallback(() => {
    globalSupervisor.startCalibration();
  }, []);

  const cancelCalibration = useCallback(() => {
    globalSupervisor.cancelCalibration();
  }, []);

  const recordCalibrationPoint = useCallback((screenX: number, screenY: number) => {
    globalSupervisor.recordCalibrationPoint(screenX, screenY);
  }, []);

  const getVisualFocusScore = useCallback(() => {
    return globalSupervisor.getState().visualFocusScore;
  }, []);

  return {
    state,
    error,
    start,
    stop,
    pause,
    resume,
    correctTime,
    startCalibration,
    cancelCalibration,
    recordCalibrationPoint,
    getVisualFocusScore,
  };
}
