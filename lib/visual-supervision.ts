/**
 * 视觉监督模块 - Visual Supervision Module
 * 
 * 基于 MediaPipe FaceMesh 实现的实时视觉监督系统，用于监测用户的学习专注状态。
 * 核心功能包括：
 * - 人脸检测与追踪
 * - 视线方向估计
 * - 屏幕注视判断（基于头部姿态）
 * - 眨眼检测（EAR算法）
 * - 疲劳状态评估
 * - 视线校准功能
 * 
 * 所有视频处理均在本地完成，保护用户隐私。
 */

import { generateId } from './graph-utils';

/**
 * 视觉监督事件类型枚举
 * 定义系统可能产生的所有事件类型，用于事件驱动的状态通知
 */
export type VisualSupervisionEventType =
  | 'started'              // 系统启动
  | 'stopped'              // 系统停止
  | 'paused'               // 系统暂停
  | 'resumed'              // 系统恢复
  | 'face_detected'        // 检测到人脸
  | 'face_lost'            // 人脸丢失
  | 'looking_at_screen'    // 开始注视屏幕
  | 'looking_away'         // 视线离开屏幕
  | 'blink'                // 检测到眨眼
  | 'fatigue_warning'      // 疲劳警告
  | 'calibration_started'  // 校准开始
  | 'calibration_point'    // 记录校准点
  | 'calibration_finished' // 校准完成
  | 'error';               // 错误事件

/**
 * 视觉监督事件接口
 * @property id - 事件唯一标识
 * @property type - 事件类型
 * @property timestamp - 事件发生时间戳
 * @property metadata - 附加数据（可选）
 */
export interface VisualSupervisionEvent {
  id: string;
  type: VisualSupervisionEventType;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * 视线校准点接口
 * 用于存储视线校准时的参考点，建立虹膜位置与屏幕位置的映射关系
 * @property x - 屏幕相对X坐标 (0-1)
 * @property y - 屏幕相对Y坐标 (0-1)
 * @property leftIrisX - 左眼虹膜X坐标（归一化）
 * @property leftIrisY - 左眼虹膜Y坐标（归一化）
 * @property rightIrisX - 右眼虹膜X坐标（归一化）
 * @property rightIrisY - 右眼虹膜Y坐标（归一化）
 */
export interface CalibrationPoint {
  x: number;           // 0-1 screen relative
  y: number;           // 0-1 screen relative
  leftIrisX: number;
  leftIrisY: number;
  rightIrisX: number;
  rightIrisY: number;
}

/**
 * 视觉监督状态接口
 * 包含系统运行时的所有状态信息
 */
export interface VisualSupervisionState {
  isRunning: boolean;           // 是否正在运行
  isPaused: boolean;            // 是否暂停
  isCalibrating: boolean;       // 是否在校准
  faceDetected: boolean;        // 是否检测到人脸
  lookingAtScreen: boolean;     // 是否注视屏幕
  effectiveMs: number;          // 有效学习时间（毫秒）
  correctedEffectiveMs: number; // 用户修正后的有效时间（毫秒）
  faceLostMs: number;           // 人脸丢失累计时间（毫秒）
  lookingAwayMs: number;        // 视线偏离累计时间（毫秒）
  blinkCount: number;           // 眨眼次数
  lastFaceAt: number | null;    // 最后检测到人脸的时间戳
  lastLookAtScreenAt: number | null; // 最后注视屏幕的时间戳
  fatigueScore: number;         // 疲劳指数 (0-1)，越高越疲劳
  visualFocusScore: number;     // 视觉专注分数 (0-1)，越高越专注
  gazeX: number | null;         // 估计注视点X坐标 (0-1)
  gazeY: number | null;         // 估计注视点Y坐标 (0-1)
  calibrationProgress: number;  // 校准进度 (0-1)
  calibrationPoints: CalibrationPoint[]; // 已采集的校准点集合
}

/**
 * 视觉监督配置选项接口
 * @property onEvent - 事件回调函数
 * @property onStateUpdate - 状态更新回调函数
 * @property yawThresholdDegrees - 头部偏航阈值（度），超过此值判定为未注视屏幕
 * @property pitchThresholdDegrees - 头部俯仰阈值（度），超过此值判定为未注视屏幕
 * @property pitchOffsetDegrees - 俯仰偏移补偿（度），用于补偿摄像头位置差异
 * @property fatigueBlinkRate - 疲劳眨眼率阈值（次/分钟），超过此值触发疲劳警告
 */
export interface VisualSupervisorOptions {
  onEvent?: (event: VisualSupervisionEvent) => void;
  onStateUpdate?: (state: VisualSupervisionState) => void;
  /** Max head yaw in degrees to count as looking at screen */
  yawThresholdDegrees?: number;
  /** Max head pitch in degrees to count as looking at screen */
  pitchThresholdDegrees?: number;
  /** Pitch offset to account for camera position (positive = look more downward) */
  pitchOffsetDegrees?: number;
  /** Blink rate per minute above which fatigue warning fires */
  fatigueBlinkRate?: number;
}

/**
 * 懒加载 MediaPipe FaceMesh 库
 * 采用动态导入避免增加初始包体积，只有在实际使用时才加载
 * @returns FaceMesh 构造函数
 */
async function loadFaceMesh() {
  const { FaceMesh } = await import('@mediapipe/face_mesh');
  return FaceMesh;
}

/**
 * 计算两点之间的欧几里得距离
 * 用于眨眼检测算法（EAR）中计算眼睛关键点之间的距离
 * @param a - 点A坐标 {x, y}
 * @param b - 点B坐标 {x, y}
 * @returns 两点之间的距离
 */
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

/**
 * 视觉监督器核心类
 * 封装所有视觉监督功能，包括人脸检测、视线追踪、疲劳监测等
 */
export class VisualSupervisor {
  private options: VisualSupervisorOptions;        // 配置选项
  private state: VisualSupervisionState;           // 当前状态
  private videoElement: HTMLVideoElement | null = null;   // 视频元素引用
  private stream: MediaStream | null = null;              // 摄像头视频流
  private faceMesh: any = null;                           // FaceMesh 实例
  private animationFrame: number | null = null;           // 动画帧ID
  private lastFrameTime = 0;                       // 上一帧处理时间
  private fatigueFrameCount = 0;                   // 疲劳检测帧计数器
  private lastBlinkFrame = 0;                      // 上一次眨眼的帧计数
  private frameInterval = 1000 / 15;               // 帧间隔（15 FPS，降低CPU消耗）
  private correctionOffset = 0;                    // 手动时间修正偏移量（毫秒）
  private irisCalibMin = { x: 0.45, y: 0.45 };    // 虹膜校准范围最小值
  private irisCalibMax = { x: 0.55, y: 0.55 };    // 虹膜校准范围最大值
  private lastLandmarks: any[] | null = null;      // 最近一帧的人脸关键点数据
  private lastEffectiveUpdate = Date.now();        // 上一次有效时间更新时间

  /**
   * 构造函数
   * @param options - 配置选项，可选
   */
  constructor(options: VisualSupervisorOptions = {}) {
    // 合并默认配置与用户配置
    this.options = {
      yawThresholdDegrees: 20,   // 默认偏航阈值：20度
      pitchThresholdDegrees: 35, // 默认俯仰阈值：35度
      pitchOffsetDegrees: 10,    // 默认俯仰补偿：10度（向下）
      fatigueBlinkRate: 30,      // 默认疲劳眨眼率：30次/分钟
      ...options,
    };
    
    // 初始化状态
    this.state = {
      isRunning: false,
      isPaused: false,
      isCalibrating: false,
      faceDetected: false,
      lookingAtScreen: false,
      effectiveMs: 0,
      correctedEffectiveMs: 0,
      faceLostMs: 0,
      lookingAwayMs: 0,
      blinkCount: 0,
      lastFaceAt: null,
      lastLookAtScreenAt: null,
      fatigueScore: 0,
      visualFocusScore: 1,
      gazeX: null,
      gazeY: null,
      calibrationProgress: 0,
      calibrationPoints: [],
    };
  }

  /**
   * 设置状态更新回调函数
   * @param cb - 状态更新回调
   */
  setOnStateUpdate(cb?: (state: VisualSupervisionState) => void) {
    this.options.onStateUpdate = cb;
  }

  /**
   * 设置事件回调函数
   * @param cb - 事件回调
   */
  setOnEvent(cb?: (event: VisualSupervisionEvent) => void) {
    this.options.onEvent = cb;
  }

  /**
   * 获取当前状态（深拷贝，防止外部修改）
   * @returns 当前状态对象
   */
  getState(): VisualSupervisionState {
    return { ...this.state };
  }

  /**
   * 重置状态到初始值
   * 保留校准参数（irisCalibMin/Max），重置所有时间统计和检测状态
   */
  private resetState() {
    this.state = {
      ...this.state,
      isRunning: false,
      isPaused: false,
      isCalibrating: false,
      faceDetected: false,
      lookingAtScreen: false,
      effectiveMs: 0,
      correctedEffectiveMs: 0,
      faceLostMs: 0,
      lookingAwayMs: 0,
      blinkCount: 0,
      lastFaceAt: null,
      lastLookAtScreenAt: null,
      fatigueScore: 0,
      visualFocusScore: 1,
      gazeX: null,
      gazeY: null,
      calibrationProgress: 0,
      calibrationPoints: [],
    };
    this.correctionOffset = 0;
  }

  /**
   * 启动视觉监督系统
   * 初始化 FaceMesh、获取摄像头权限、启动检测循环
   * @param videoElement - 用于显示摄像头画面的 video 元素
   * @throws 摄像头权限错误或初始化失败时抛出异常
   */
  async start(videoElement: HTMLVideoElement): Promise<void> {
    if (this.state.isRunning) return;

    // 清理上一次可能未关闭的 FaceMesh 实例
    if (this.faceMesh) {
      try {
        await this.faceMesh.close?.();
      } catch {
        // ignore
      }
      this.faceMesh = null;
    }

    this.videoElement = videoElement;
    this.resetState();

    try {
      // 懒加载 FaceMesh 库
      const FaceMesh = await loadFaceMesh();

      // 创建 FaceMesh 实例，配置从 CDN 加载模型文件
      this.faceMesh = new FaceMesh({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        },
      });

      // 配置 FaceMesh 选项
      this.faceMesh.setOptions({
        maxNumFaces: 1,              // 只检测一张人脸
        refineLandmarks: true,       // 启用精细地标检测（包含虹膜关键点）
        minDetectionConfidence: 0.5, // 检测置信度阈值：0.5
        minTrackingConfidence: 0.5,  // 追踪置信度阈值：0.5
      });

      // 获取摄像头权限，配置视频参数
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }, // 前置摄像头
        audio: false,                                            // 不需要音频
      });

      // 将视频流绑定到 video 元素并播放
      videoElement.srcObject = this.stream;
      videoElement.muted = true;
      videoElement.playsInline = true;
      if (videoElement.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            videoElement.removeEventListener('loadedmetadata', onLoaded);
            resolve();
          };
          videoElement.addEventListener('loadedmetadata', onLoaded);
          setTimeout(() => {
            videoElement.removeEventListener('loadedmetadata', onLoaded);
            resolve();
          }, 1000);
        });
      }
      await videoElement.play();

      // 更新状态并启动检测循环
      this.state.isRunning = true;
      this.lastEffectiveUpdate = Date.now();
      this.emitEvent('started');
      this.runLoop();
    } catch (err: any) {
      this.emitEvent('error', { message: err.message });
      throw err;
    }
  }

  /**
   * 停止视觉监督系统
   * 释放所有资源：关闭视频流、停止 FaceMesh、取消动画帧
   */
  async stop(): Promise<void> {
    if (!this.state.isRunning) return;

    // 标记停止状态
    this.state.isRunning = false;
    this.state.isPaused = false;

    // 取消动画帧
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // 停止并释放视频流
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // 清理 video 元素（保留 DOM 引用由调用方管理）
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      try {
        await this.videoElement.pause();
      } catch {
        // ignore
      }
      this.videoElement = null;
    }

    // 关闭 FaceMesh 实例，等待完成以避免下次启动黑屏
    if (this.faceMesh) {
      try {
        await this.faceMesh.close?.();
      } catch {
        // 忽略关闭错误
      }
      this.faceMesh = null;
    }

    // 发送停止事件并更新状态
    this.emitEvent('stopped');
    this.updateState();
  }

  /**
   * 暂停视觉监督
   * 暂停检测但保持摄像头连接
   */
  pause() {
    if (!this.state.isRunning || this.state.isPaused) return;
    this.state.isPaused = true;
    this.emitEvent('paused');
    this.updateState();
  }

  /**
   * 恢复视觉监督
   * 从暂停状态恢复检测
   */
  resume() {
    if (!this.state.isRunning || !this.state.isPaused) return;
    this.state.isPaused = false;
    this.emitEvent('resumed');
    this.updateState();
  }

  /**
   * 手动修正有效学习时间
   * 当用户认为自动检测有误时，可以手动增减有效时间
   * @param deltaMs - 时间修正量（毫秒），正数增加，负数减少
   */
  correctEffectiveTime(deltaMs: number) {
    this.correctionOffset += deltaMs;
    this.updateCorrectedTime();
    this.updateState();
  }

  /**
   * 开始视线校准
   * 校准过程中用户需要在屏幕9个位置注视并点击，建立虹膜位置与屏幕坐标的映射
   */
  startCalibration() {
    if (!this.state.isRunning) return;
    this.state.isCalibrating = true;
    this.state.calibrationPoints = [];
    this.state.calibrationProgress = 0;
    this.emitEvent('calibration_started');
    this.updateState();
  }

  /**
   * 取消视线校准
   * 放弃当前校准过程，保留原有校准参数
   */
  cancelCalibration() {
    this.state.isCalibrating = false;
    this.state.calibrationPoints = [];
    this.state.calibrationProgress = 0;
    this.updateState();
  }

  /**
   * 记录校准点
   * 在已知屏幕位置记录当前虹膜坐标，用于建立映射关系
   * @param screenX - 屏幕相对X坐标 (0-1)
   * @param screenY - 屏幕相对Y坐标 (0-1)
   */
  recordCalibrationPoint(screenX: number, screenY: number) {
    if (!this.state.isCalibrating || !this.lastLandmarks) return;
    
    // 获取虹膜关键点（FaceMesh 中左眼虹膜中心为468，右眼为473）
    const left = this.lastLandmarks[468];
    const right = this.lastLandmarks[473];
    
    // 添加校准点
    this.state.calibrationPoints.push({
      x: screenX,
      y: screenY,
      leftIrisX: left.x,
      leftIrisY: left.y,
      rightIrisX: right.x,
      rightIrisY: right.y,
    });

    // 更新校准进度（9个点完成校准）
    this.state.calibrationProgress = Math.min(1, this.state.calibrationPoints.length / 9);
    this.emitEvent('calibration_point', { index: this.state.calibrationPoints.length });

    // 采集满9个点自动完成校准
    if (this.state.calibrationPoints.length >= 9) {
      this.finishCalibration();
    }
    this.updateState();
  }

  /**
   * 完成校准
   * 根据采集的校准点计算虹膜坐标范围，用于后续视线估计
   */
  private finishCalibration() {
    const pts = this.state.calibrationPoints;
    
    // 计算所有校准点的平均虹膜坐标
    const xs = pts.map((p) => (p.leftIrisX + p.rightIrisX) / 2);
    const ys = pts.map((p) => (p.leftIrisY + p.rightIrisY) / 2);
    
    // 更新虹膜校准范围
    this.irisCalibMin = { x: Math.min(...xs), y: Math.min(...ys) };
    this.irisCalibMax = { x: Math.max(...xs), y: Math.max(...ys) };
    
    this.state.isCalibrating = false;
    this.emitEvent('calibration_finished');
  }

  /**
   * 运行主循环
   * 使用 requestAnimationFrame 实现平滑的检测循环，控制帧率为15 FPS
   */
  private runLoop() {
    const loop = async (time: number) => {
      // 检查是否仍在运行
      if (!this.state.isRunning) return;

      // 控制帧率：每 frameInterval 毫秒处理一帧
      if (time - this.lastFrameTime >= this.frameInterval) {
        // 检查视频元素和 FaceMesh 是否已就绪
        if (!this.state.isPaused && 
            this.videoElement && 
            this.faceMesh && 
            this.videoElement.readyState >= 2) {
          try {
            // 发送视频帧到 FaceMesh 进行检测
            await this.faceMesh.send({ image: this.videoElement });
          } catch {
            // 忽略单帧检测错误
          }
        }
        this.lastFrameTime = time;
      }

      // 继续下一帧
      this.animationFrame = requestAnimationFrame(loop);
    };

    // 设置 FaceMesh 结果回调
    this.faceMesh?.onResults?.((results: any) => this.onFaceMeshResults(results));
    
    // 启动循环
    this.animationFrame = requestAnimationFrame(loop);
  }

  /**
   * 处理 FaceMesh 检测结果
   * 解析人脸关键点，执行视线估计、眨眼检测、疲劳评估等
   * @param results - FaceMesh 返回的检测结果
   */
  private onFaceMeshResults(results: any) {
    const now = Date.now();
    // 判断是否检测到人脸
    const hasFace = results?.multiFaceLandmarks && results.multiFaceLandmarks.length > 0;

    if (hasFace) {
      // 获取第一张人脸的关键点数据
      const landmarks = results.multiFaceLandmarks[0];
      this.lastLandmarks = landmarks;

      // 执行三项核心检测
      const lookingAtScreen = this.isLookingAtScreen(landmarks);  // 注视判断
      const blinked = this.detectBlink(landmarks);               // 眨眼检测
      this.estimateGaze(landmarks);                              // 视线估计

      // 更新人脸检测状态
      if (!this.state.faceDetected) {
        this.state.faceDetected = true;
        this.state.lastFaceAt = now;
        this.emitEvent('face_detected');
      }

      // 更新注视状态
      if (lookingAtScreen) {
        if (!this.state.lookingAtScreen) {
          this.state.lookingAtScreen = true;
          this.state.lastLookAtScreenAt = now;
          this.emitEvent('looking_at_screen');
        }
      } else {
        if (this.state.lookingAtScreen) {
          this.state.lookingAtScreen = false;
          this.emitEvent('looking_away');
        }
      }

      // 更新眨眼计数
      if (blinked) {
        this.state.blinkCount++;
        this.emitEvent('blink');
      }

      // 更新疲劳分数
      this.updateFatigueScore(now);
    } else {
      // 未检测到人脸
      this.lastLandmarks = null;
      if (this.state.faceDetected) {
        this.state.faceDetected = false;
        this.state.lookingAtScreen = false;
        this.state.gazeX = null;
        this.state.gazeY = null;
        this.emitEvent('face_lost');
      }
    }

    // 更新时间统计和专注分数
    this.updateEffectiveTime();
    this.updateVisualFocusScore();
    this.updateState();
  }

  /**
   * 判断用户是否注视屏幕
   * 通过计算头部姿态角（偏航角和俯仰角）来判断
   * @param landmarks - 人脸关键点数组
   * @returns true 表示正在注视屏幕，false 表示未注视
   */
  private isLookingAtScreen(landmarks: any[]): boolean {
    // FaceMesh 关键点索引：
    // 1: 鼻尖, 33: 左眼外眼角, 263: 右眼外眼角, 152: 下巴

    // ========== 计算偏航角（左右转头）==========
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    
    // 计算双眼中心X坐标
    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    // 计算双眼间距（避免除零）
    const eyeDistance = Math.abs(rightEye.x - leftEye.x) || 0.001;
    // 计算鼻子相对于双眼中心的水平偏移比例
    const yawRatio = (nose.x - eyeCenterX) / eyeDistance;
    // 转换为角度（弧度转角度）
    const yawDeg = Math.atan(yawRatio) * (180 / Math.PI);

    // ========== 计算俯仰角（上下转头）==========
    // 计算双眼中心Y坐标
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const chin = landmarks[152];
    // 计算脸部高度（眼到下巴）
    const faceHeight = Math.abs(chin.y - eyeCenterY) || 0.001;
    // 计算鼻子相对于双眼中心的垂直偏移比例
    const pitchRatio = (nose.y - eyeCenterY) / faceHeight;
    // 转换为角度
    const pitchDeg = Math.atan(pitchRatio) * (180 / Math.PI);

    // ========== 判断是否注视屏幕 ==========
    const yawThreshold = this.options.yawThresholdDegrees ?? 20;
    const pitchThreshold = this.options.pitchThresholdDegrees ?? 35;
    const pitchOffset = this.options.pitchOffsetDegrees ?? 10;
    
    // 应用俯仰偏移补偿（考虑摄像头位置）
    const adjustedPitchDeg = pitchDeg + pitchOffset;
    
    // 偏航角和俯仰角都在阈值范围内才算注视屏幕
    return Math.abs(yawDeg) < yawThreshold && Math.abs(adjustedPitchDeg) < pitchThreshold;
  }

  /**
   * 估计视线方向
   * 根据虹膜位置和校准参数，计算用户注视的屏幕坐标
   * @param landmarks - 人脸关键点数组
   */
  private estimateGaze(landmarks: any[]) {
    // 获取虹膜关键点（FaceMesh 精细地标）
    // 468: 左眼虹膜中心, 473: 右眼虹膜中心
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    
    // 计算双眼虹膜中心坐标
    const irisX = (leftIris.x + rightIris.x) / 2;
    const irisY = (leftIris.y + rightIris.y) / 2;

    // 获取校准范围
    const minX = this.irisCalibMin.x;
    const maxX = this.irisCalibMax.x;
    const minY = this.irisCalibMin.y;
    const maxY = this.irisCalibMax.y;

    // 计算归一化范围（避免除零）
    const rangeX = maxX - minX || 0.1;
    const rangeY = maxY - minY || 0.1;

    // 将虹膜坐标映射到屏幕坐标（0-1）
    // 水平方向需要镜像翻转（因为摄像头画面是镜像的）
    const gazeX = 1 - ((irisX - minX) / rangeX);
    const gazeY = (irisY - minY) / rangeY;

    // 限制结果在 0-1 范围内
    this.state.gazeX = Math.max(0, Math.min(1, gazeX));
    this.state.gazeY = Math.max(0, Math.min(1, gazeY));
  }

  /**
   * 检测眨眼
   * 使用 EAR（Eye Aspect Ratio）算法检测眨眼动作
   * @param landmarks - 人脸关键点数组
   * @returns true 表示检测到眨眼，false 表示未眨眼
   */
  private detectBlink(landmarks: any[]): boolean {
    // EAR 算法使用眼睛周围的6个关键点：
    // 左眼关键点索引：33(左上角), 160(上中), 158(上内), 133(右下角), 153(下中), 144(下内)
    const p1 = landmarks[33];   // 左眼左上角
    const p2 = landmarks[160];  // 左眼上眼睑中
    const p3 = landmarks[158];  // 左眼上眼睑内
    const p4 = landmarks[133];  // 左眼右下角
    const p5 = landmarks[153];  // 左眼上眼睑中
    const p6 = landmarks[144];  // 左眼上眼睑内

    // EAR 计算公式：
    // EAR = (垂直距离之和) / (2 * 水平距离)
    // 眨眼时眼睛闭合，EAR 值会急剧下降
    const ear = (dist(p2, p6) + dist(p3, p5)) / (2 * dist(p1, p4));

    // EAR < 0.2 判定为眨眼
    if (ear < 0.2) {
      // 防止重复计数：两次眨眼之间需要间隔至少10帧
      if (this.fatigueFrameCount - this.lastBlinkFrame > 10) {
        this.lastBlinkFrame = this.fatigueFrameCount;
        return true;
      }
    }
    
    this.fatigueFrameCount++;
    return false;
  }

  /**
   * 更新疲劳分数
   * 根据眨眼频率计算疲劳指数
   * @param now - 当前时间戳
   */
  private updateFatigueScore(now: number) {
    // 计算会话时长（分钟）
    const sessionMinutes = (now - (this.state.lastFaceAt || now)) / 60000 || 1;
    
    // 计算眨眼率（次/分钟）
    const blinkRate = this.state.blinkCount / sessionMinutes;
    
    // 计算疲劳分数：当前眨眼率 / 疲劳阈值眨眼率
    const fatigueBlinkRate = this.options.fatigueBlinkRate ?? 30;
    this.state.fatigueScore = Math.min(1, blinkRate / fatigueBlinkRate);
    
    // 疲劳分数超过 0.8 触发疲劳警告
    if (this.state.fatigueScore > 0.8) {
      this.emitEvent('fatigue_warning', { blinkRate });
    }
  }

  /**
   * 更新有效时间统计
   * 根据当前状态（运行中、暂停、人脸检测、注视状态）更新各类时间统计
   */
  private updateEffectiveTime() {
    const now = Date.now();
    // 计算距上次更新的时间差
    const delta = now - this.lastEffectiveUpdate;
    this.lastEffectiveUpdate = now;

    // 如果不在运行或暂停状态，不更新时间
    if (!this.state.isRunning || this.state.isPaused) return;

    // 更新各类时间统计
    if (this.state.faceDetected && this.state.lookingAtScreen) {
      // 人脸检测到且注视屏幕：增加有效时间
      this.state.effectiveMs += delta;
    }
    if (!this.state.faceDetected) {
      // 人脸丢失：增加人脸丢失时间
      this.state.faceLostMs += delta;
    }
    if (this.state.faceDetected && !this.state.lookingAtScreen) {
      // 人脸检测到但未注视屏幕：增加视线偏离时间
      this.state.lookingAwayMs += delta;
    }

    // 更新修正后的有效时间
    this.updateCorrectedTime();
  }

  /**
   * 更新修正后的有效时间
   * 结合自动检测时间和用户手动修正
   */
  private updateCorrectedTime() {
    // 有效时间 = 自动检测时间 + 用户修正偏移量（最小为0）
    this.state.correctedEffectiveMs = Math.max(0, this.state.effectiveMs + this.correctionOffset);
  }

  /**
   * 更新视觉专注分数
   * 综合有效时间比例和疲劳状态计算最终专注分数
   */
  private updateVisualFocusScore() {
    // 计算总时间（有效时间 + 人脸丢失时间 + 视线偏离时间）
    const total = this.state.effectiveMs + this.state.faceLostMs + this.state.lookingAwayMs;
    
    // 如果总时间为0，返回满分
    if (total === 0) {
      this.state.visualFocusScore = 1;
      return;
    }

    // 计算有效时间比例
    const effectiveRatio = this.state.effectiveMs / total;
    
    // 计算疲劳惩罚因子：疲劳越严重，惩罚越大
    // 疲劳惩罚 = 1 - 疲劳指数 * 0.5（最大惩罚50%）
    const fatiguePenalty = 1 - this.state.fatigueScore * 0.5;
    
    // 最终专注分数 = 有效时间比例 * 疲劳惩罚因子
    this.state.visualFocusScore = Math.max(0, Math.min(1, effectiveRatio * fatiguePenalty));
  }

  /**
   * 更新状态（触发回调）
   * 将当前状态深拷贝后传递给注册的回调函数
   */
  private updateState() {
    this.options.onStateUpdate?.({ ...this.state });
  }

  /**
   * 发送事件
   * 创建事件对象并传递给注册的回调函数
   * @param type - 事件类型
   * @param metadata - 附加数据（可选）
   */
  private emitEvent(type: VisualSupervisionEventType, metadata?: Record<string, unknown>) {
    const event: VisualSupervisionEvent = {
      id: generateId('vis-event'),
      type,
      timestamp: Date.now(),
      metadata,
    };
    this.options.onEvent?.(event);
  }
}

/**
 * 创建视觉监督器实例的工厂函数
 * @param options - 配置选项，可选
 * @returns VisualSupervisor 实例
 */
export function createVisualSupervisor(options?: VisualSupervisorOptions): VisualSupervisor {
  return new VisualSupervisor(options);
}