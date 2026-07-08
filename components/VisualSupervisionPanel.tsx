'use client';

import { useEffect, useRef, useState } from 'react';
import { useVisualSupervisor } from '@/hooks/useVisualSupervisor';

const CALIBRATION_POINTS = 9;

export function VisualSupervisionPanel() {
  const [mode, setMode] = useState<'hidden' | 'minimized' | 'panel'>('hidden');
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibIndex, setCalibIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
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
  } = useVisualSupervisor();

  const enabled = state?.isRunning ?? false;
  const paused = state?.isPaused ?? false;
  const isCalibrating = state?.isCalibrating ?? false;

  // Draw face mesh overlay when visible
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || mode === 'hidden') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw gaze point
      if (state.gazeX !== null && state.gazeY !== null) {
        const gx = state.gazeX * canvas.width;
        const gy = state.gazeY * canvas.height;
        ctx.beginPath();
        ctx.arc(gx, gy, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 38, 38, 0.8)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, 14, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.4)';
        ctx.stroke();
      }

      // Draw status indicator
      ctx.beginPath();
      ctx.arc(20, 20, 8, 0, Math.PI * 2);
      ctx.fillStyle = state.lookingAtScreen ? 'rgba(16, 185, 129, 0.9)' : 'rgba(220, 38, 38, 0.9)';
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mode, state.gazeX, state.gazeY, state.lookingAtScreen]);

  useEffect(() => {
    if (isCalibrating && !showCalibration) {
      setShowCalibration(true);
      setCalibIndex(0);
    }
    if (!isCalibrating && showCalibration) {
      setShowCalibration(false);
    }
  }, [isCalibrating, showCalibration]);

  const toggle = async () => {
    if (enabled) {
      await stop();
    } else {
      if (!videoRef.current) return;
      await start(videoRef.current);
      setMode('panel');
    }
  };

  const onCalibClick = (e: React.MouseEvent) => {
    if (!isCalibrating) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    recordCalibrationPoint(x, y);
    setCalibIndex((i) => i + 1);
  };

  const formatMs = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const scoreColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-400';
    if (score >= 0.5) return 'text-amber-400';
    return 'text-crimson-400';
  };

  return (
    <>
      {/* Calibration overlay */}
      {showCalibration && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
          onClick={onCalibClick}
        >
          <div className="text-center text-cosmic-100">
            <div className="mb-4 text-lg font-bold">视线校准</div>
            <div className="mb-2 text-sm text-cosmic-300">
              请将视线跟随红色圆点，用鼠标点击圆点位置，共 {CALIBRATION_POINTS} 个点。
            </div>
            <div className="text-xs text-cosmic-500">
              进度：{Math.min(calibIndex, CALIBRATION_POINTS)} / {CALIBRATION_POINTS}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                cancelCalibration();
              }}
              className="mt-6 rounded-sm border border-cosmic-600 px-4 py-2 text-xs text-cosmic-300 hover:bg-cosmic-800"
            >
              取消校准
            </button>
          </div>
          {isCalibrating && (
            <CalibrationDot index={calibIndex} total={CALIBRATION_POINTS} />
          )}
        </div>
      )}

      {/* Minimized indicator */}
      {mode === 'minimized' && enabled && (
        <button
          onClick={() => setMode('panel')}
          className="fixed right-4 top-64 z-50 flex h-10 w-10 items-center justify-center rounded-none border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-lg backdrop-blur-xl"
          style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
          title="视觉监督中"
        >
          <span className={state.lookingAtScreen ? 'text-emerald-400' : 'text-crimson-400'}>●</span>
        </button>
      )}

      {/* Main panel */}
      <div className={mode === 'panel' ? 'fixed right-16 top-64 z-50 w-[360px] rounded-none border border-cosmic-700 bg-cosmic-900/95 p-4 shadow-2xl shadow-crimson-900/20 backdrop-blur-xl' : 'hidden'}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-crimson-400">VISION</span>
              <span className="font-bold tracking-wider text-cosmic-100">视觉监督</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMode('minimized')}
                className="flex h-6 w-6 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
                title="最小化"
              >
                ─
              </button>
              <button
                onClick={() => setMode('hidden')}
                className="flex h-6 w-6 items-center justify-center rounded-full text-cosmic-400 transition-colors hover:bg-cosmic-800 hover:text-cosmic-100"
                title="隐藏面板"
              >
                ×
              </button>
            </div>
          </div>

          <div className="mb-3 text-xs leading-relaxed text-cosmic-400">
            所有视频处理均在本地完成。开启后摄像头指示灯会亮起。
          </div>

          <div className="relative mb-3 aspect-video overflow-hidden rounded-sm border border-cosmic-800 bg-black">
            <video ref={videoRef} className="h-full w-full -scale-x-100 object-cover" playsInline muted />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
            />
            {!enabled && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-cosmic-500">
                摄像头未开启
              </div>
            )}
          </div>

          {error && <div className="mb-3 rounded-sm bg-crimson-900/30 px-3 py-2 text-xs text-crimson-300">{error}</div>}

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={toggle}
              className={`rounded-sm py-2 text-xs font-bold transition-colors ${
                enabled
                  ? 'border border-crimson-700 bg-crimson-900/40 text-crimson-300 hover:bg-crimson-900/60'
                  : 'bg-crimson-700 text-white hover:bg-crimson-600'
              }`}
            >
              {enabled ? '关闭摄像头' : '开启摄像头'}
            </button>
            {enabled && (
              <button
                onClick={paused ? resume : pause}
                className="rounded-sm border border-cosmic-700 bg-cosmic-800/60 py-2 text-xs text-cosmic-200 transition-colors hover:bg-cosmic-700"
              >
                {paused ? '继续监督' : '暂停监督'}
              </button>
            )}
          </div>

          {enabled && (
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => startCalibration()}
                className="flex-1 rounded-sm border border-cosmic-700 bg-cosmic-800/40 py-1.5 text-[10px] text-cosmic-200 transition-colors hover:bg-cosmic-700"
              >
                校准视线
              </button>
              <button
                onClick={() => correctTime(10_000)}
                className="flex-1 rounded-sm border border-cosmic-700 bg-cosmic-800/40 py-1.5 text-[10px] text-cosmic-200 transition-colors hover:bg-cosmic-700"
              >
                +10秒有效时间
              </button>
              <button
                onClick={() => correctTime(-10_000)}
                className="flex-1 rounded-sm border border-cosmic-700 bg-cosmic-800/40 py-1.5 text-[10px] text-cosmic-200 transition-colors hover:bg-cosmic-700"
              >
                -10秒有效时间
              </button>
            </div>
          )}

          {state && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-cosmic-400">视觉专注分</span>
                <span className={`font-bold ${scoreColor(state.visualFocusScore)}`}>
                  {Math.round(state.visualFocusScore * 100)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-cosmic-400">有效学习时间</span>
                <span className="text-cosmic-200">{formatMs(state.correctedEffectiveMs)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-cosmic-400">人脸丢失</span>
                <span className="text-cosmic-200">{formatMs(state.faceLostMs)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-cosmic-400">视线偏离</span>
                <span className="text-cosmic-200">{formatMs(state.lookingAwayMs)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-cosmic-400">疲劳指数</span>
                <span className={state.fatigueScore > 0.7 ? 'text-crimson-400' : 'text-cosmic-200'}>
                  {Math.round(state.fatigueScore * 100)}
                </span>
              </div>
            </div>
          )}
        </div>

      {/* Hidden mode toggle button */}
      {mode === 'hidden' && (
        <button
          onClick={() => setMode('panel')}
          className="fixed right-4 top-64 z-50 flex h-10 w-10 items-center justify-center rounded-none border border-cosmic-700 bg-cosmic-900/90 text-cosmic-200 shadow-lg backdrop-blur-xl transition-transform hover:scale-110 active:scale-95"
          title="视觉监督"
        >
          <span className="text-lg">📷</span>
        </button>
      )}
    </>
  );
}

function CalibrationDot({ index, total }: { index: number; total: number }) {
  // 3x3 grid positions
  const positions = [
    { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 },
    { x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 },
    { x: 0.1, y: 0.9 }, { x: 0.5, y: 0.9 }, { x: 0.9, y: 0.9 },
  ];
  const pos = positions[index % positions.length];
  return (
    <div
      className="pointer-events-none fixed z-[70] h-4 w-4 rounded-full border-2 border-white bg-crimson-500 shadow-crimson-glow"
      style={{ left: `calc(${pos.x * 100}% - 8px)`, top: `calc(${pos.y * 100}% - 8px)` }}
    />
  );
}
