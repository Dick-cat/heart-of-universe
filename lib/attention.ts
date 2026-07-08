import { generateId } from './graph-utils';

/**
 * 注意力事件类型枚举
 * 用于追踪用户在内容上的各种交互行为
 */
export type AttentionEventType =
  | 'click'              // 点击事件
  | 'scroll'             // 滚动事件
  | 'focus'              // 焦点进入事件
  | 'blur'               // 焦点离开事件
  | 'idle_start'         // 进入空闲状态
  | 'idle_end'           // 离开空闲状态
  | 'selection'          // 文本选择事件
  | 'keydown'            // 键盘按键事件
  | 'visibility_hidden'  // 页面隐藏（切换标签页）
  | 'visibility_visible'; // 页面可见

/**
 * 注意力警告标志枚举
 * 用于标识用户注意力状态中的问题
 */
export type AttentionFlag =
  | 'insufficient_reading_time'  // 阅读时间不足
  | 'low_scroll_coverage'        // 滚动覆盖不够
  | 'high_idle_ratio'            // 空闲时间过长
  | 'tab_switched'               // 切换过标签页
  | 'low_interaction'            // 交互过少
  | 'copy_paste_detected'        // 检测到粘贴行为
  | 'no_selection'               // 未选中文本
  | 'high_distraction';          // 分心迹象明显

/**
 * 注意力事件接口
 * 记录单个交互事件的详细信息
 */
export interface AttentionEvent {
  id: string;                    // 事件唯一标识
  sessionId: string;             // 所属会话ID
  type: AttentionEventType;      // 事件类型
  timestamp: number;             // 事件时间戳
  x?: number;                    // 鼠标X坐标（点击事件）
  y?: number;                    // 鼠标Y坐标（点击事件）
  target?: string;               // 目标元素标签名
  metadata?: Record<string, unknown>; // 附加元数据
}

/**
 * 注意力会话接口
 * 表示一次完整的注意力追踪会话
 */
export interface AttentionSession {
  id: string;                           // 会话唯一标识
  startTime: number;                    // 会话开始时间
  endTime?: number;                     // 会话结束时间
  contentId: string;                    // 关联的内容ID
  contentType: 'ai_output' | 'node_content' | 'pdf' | 'other'; // 内容类型
  contentLength?: number;               // 内容长度（字符数）
  events: AttentionEvent[];             // 事件列表
  // computed - 计算属性
  scrollCoverage: number;               // 滚动覆盖率 (0-1)
  totalIdleMs: number;                  // 总空闲时间（毫秒）
  focusMs: number;                      // 总聚焦时间（毫秒）
  totalMs: number;                      // 会话总时长（毫秒）
  interactionCount: number;             // 交互事件总数
  score: number;                        // 注意力分数 (0-1)
  flags: AttentionFlag[];               // 警告标志列表
}

/**
 * 注意力追踪器配置选项
 */
export interface AttentionTrackerOptions {
  contentId: string;                           // 追踪的内容ID
  contentType: AttentionSession['contentType']; // 内容类型
  contentLength?: number;                      // 内容长度（用于计算期望阅读时间）
  idleThresholdMs?: number;                    // 空闲阈值（毫秒），默认30秒
  /** 可选的外部视觉焦点分数 (0-1)，来自摄像头监督模块 */
  getVisualFocusScore?: () => number;
  /** 会话更新回调 */
  onSessionUpdate?: (session: AttentionSession) => void;
  /** 事件记录回调 */
  onEvent?: (event: AttentionEvent) => void;
}

/** 默认空闲阈值：30秒 */
const DEFAULT_IDLE_THRESHOLD_MS = 30_000;
/** 滚动事件节流间隔：250毫秒 */
const SCROLL_THROTTLE_MS = 250;
/** 键盘事件节流间隔：250毫秒 */
const KEY_THROTTLE_MS = 250;

/**
 * 注意力追踪器类
 * 用于追踪用户在阅读内容时的注意力状态，通过多种交互信号评估专注程度
 */
export class AttentionTracker {
  private session: AttentionSession;           // 当前追踪会话
  private options: AttentionTrackerOptions;     // 配置选项
  private element: HTMLElement | Window | null = null; // 绑定的DOM元素
  private lastScrollTime = 0;                  // 上次滚动时间
  private lastKeyTime = 0;                     // 上次按键时间
  private idleTimer: ReturnType<typeof setTimeout> | null = null; // 空闲计时器
  private isIdle = false;                      // 是否处于空闲状态
  private focusStartTime: number | null = null; // 聚焦开始时间
  private lastScrollTop = 0;                   // 上次滚动位置
  private maxScrollBottom = 0;                 // 滚动到的最大底部位置
  private visibilityHiddenAt: number | null = null; // 页面隐藏时间
  /** 绑定的事件处理器（用于后续解绑） */
  private boundHandlers: {
    click?: (e: Event) => void;
    scroll?: (e: Event) => void;
    keydown?: (e: Event) => void;
    selectionchange?: (e: Event) => void;
    focus?: (e: Event) => void;
    blur?: (e: Event) => void;
    visibilitychange?: (e: Event) => void;
  } = {};

  /**
   * 构造函数
   * @param options 配置选项
   */
  constructor(options: AttentionTrackerOptions) {
    this.options = {
      idleThresholdMs: DEFAULT_IDLE_THRESHOLD_MS,
      ...options,
    };
    // 初始化会话状态
    this.session = {
      id: generateId('att-session'),
      startTime: Date.now(),
      contentId: options.contentId,
      contentType: options.contentType,
      contentLength: options.contentLength,
      events: [],
      scrollCoverage: 0,
      totalIdleMs: 0,
      focusMs: 0,
      totalMs: 0,
      interactionCount: 0,
      score: 0,
      flags: [],
    };
    this.recordEvent('focus');
    this.startIdleTimer();
  }

  /**
   * 将追踪器绑定到指定DOM元素
   * @param element 目标元素（可以是Window或HTMLElement）
   */
  attach(element: HTMLElement | Window) {
    this.detach();
    this.element = element;
    const target = element instanceof Window ? document : element;

    // 点击事件处理器
    this.boundHandlers.click = (e: Event) => {
      const mouse = e as MouseEvent;
      this.recordEvent('click', { x: mouse.clientX, y: mouse.clientY, target: (mouse.target as HTMLElement)?.tagName });
      this.resetIdleTimer();
    };

    // 滚动事件处理器（带节流）
    this.boundHandlers.scroll = () => {
      const now = Date.now();
      if (now - this.lastScrollTime < SCROLL_THROTTLE_MS) return;
      this.lastScrollTime = now;
      this.updateScrollCoverage();
      this.recordEvent('scroll', { metadata: { scrollTop: this.getScrollTop(), scrollHeight: this.getScrollHeight(), clientHeight: this.getClientHeight() } });
      this.resetIdleTimer();
    };

    // 键盘事件处理器（带节流，检测粘贴）
    this.boundHandlers.keydown = (e: Event) => {
      const key = e as KeyboardEvent;
      const now = Date.now();
      if (now - this.lastKeyTime < KEY_THROTTLE_MS) return;
      this.lastKeyTime = now;
      const meta: Record<string, unknown> = { key: key.key, ctrl: key.ctrlKey, cmd: key.metaKey };
      // 检测粘贴操作
      if ((key.ctrlKey || key.metaKey) && key.key.toLowerCase() === 'v') {
        meta.paste = true;
      }
      this.recordEvent('keydown', { metadata: meta });
      this.resetIdleTimer();
    };

    // 文本选择事件处理器
    this.boundHandlers.selectionchange = () => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.length > 5) {
        this.recordEvent('selection', { metadata: { length: selection.length } });
        this.resetIdleTimer();
      }
    };

    // 焦点进入事件处理器
    this.boundHandlers.focus = () => {
      this.recordEvent('focus');
      this.focusStartTime = Date.now();
      this.resetIdleTimer();
    };

    // 焦点离开事件处理器
    this.boundHandlers.blur = () => {
      this.recordEvent('blur');
      if (this.focusStartTime) {
        this.session.focusMs += Date.now() - this.focusStartTime;
        this.focusStartTime = null;
      }
    };

    // 页面可见性变化事件处理器
    this.boundHandlers.visibilitychange = () => {
      if (document.hidden) {
        this.visibilityHiddenAt = Date.now();
        this.recordEvent('visibility_hidden');
        if (this.focusStartTime) {
          this.session.focusMs += Date.now() - this.focusStartTime;
          this.focusStartTime = null;
        }
      } else {
        if (this.visibilityHiddenAt) {
          this.session.totalIdleMs += Date.now() - this.visibilityHiddenAt;
          this.visibilityHiddenAt = null;
        }
        this.recordEvent('visibility_visible');
        this.focusStartTime = Date.now();
        this.resetIdleTimer();
      }
    };

    // 注册所有事件监听器
    target.addEventListener('click', this.boundHandlers.click, { passive: true });
    target.addEventListener('scroll', this.boundHandlers.scroll, { passive: true });
    target.addEventListener('keydown', this.boundHandlers.keydown);
    document.addEventListener('selectionchange', this.boundHandlers.selectionchange);
    window.addEventListener('focus', this.boundHandlers.focus);
    window.addEventListener('blur', this.boundHandlers.blur);
    document.addEventListener('visibilitychange', this.boundHandlers.visibilitychange);
  }

  /**
   * 解绑追踪器，移除所有事件监听器
   */
  detach() {
    if (!this.element) return;
    const target = this.element instanceof Window ? document : this.element;
    if (this.boundHandlers.click) target.removeEventListener('click', this.boundHandlers.click);
    if (this.boundHandlers.scroll) target.removeEventListener('scroll', this.boundHandlers.scroll);
    if (this.boundHandlers.keydown) target.removeEventListener('keydown', this.boundHandlers.keydown);
    if (this.boundHandlers.selectionchange) document.removeEventListener('selectionchange', this.boundHandlers.selectionchange);
    if (this.boundHandlers.focus) window.removeEventListener('focus', this.boundHandlers.focus);
    if (this.boundHandlers.blur) window.removeEventListener('blur', this.boundHandlers.blur);
    if (this.boundHandlers.visibilitychange) document.removeEventListener('visibilitychange', this.boundHandlers.visibilitychange);
    this.element = null;
  }

  /** 获取滚动条位置 */
  private getScrollTop(): number {
    if (this.element instanceof Window) return window.scrollY;
    return (this.element as HTMLElement).scrollTop;
  }

  /** 获取滚动内容总高度 */
  private getScrollHeight(): number {
    if (this.element instanceof Window) return document.documentElement.scrollHeight;
    return (this.element as HTMLElement).scrollHeight;
  }

  /** 获取可视区域高度 */
  private getClientHeight(): number {
    if (this.element instanceof Window) return window.innerHeight;
    return (this.element as HTMLElement).clientHeight;
  }

  /**
   * 更新滚动覆盖率
   * 滚动覆盖率 = 用户滚动到的最大位置 / 内容总高度
   */
  private updateScrollCoverage() {
    const scrollTop = this.getScrollTop();
    const clientHeight = this.getClientHeight();
    const scrollHeight = this.getScrollHeight();
    const currentBottom = scrollTop + clientHeight;
    this.maxScrollBottom = Math.max(this.maxScrollBottom, currentBottom);
    if (scrollHeight <= clientHeight) {
      this.session.scrollCoverage = 1; // 内容一屏可见
    } else {
      this.session.scrollCoverage = Math.min(1, this.maxScrollBottom / scrollHeight);
    }
  }

  /** 启动空闲计时器 */
  private startIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.isIdle = true;
      this.recordEvent('idle_start');
    }, this.options.idleThresholdMs);
  }

  /** 重置空闲计时器（用户有交互时调用） */
  private resetIdleTimer() {
    if (this.isIdle) {
      this.isIdle = false;
      this.recordEvent('idle_end');
    }
    this.startIdleTimer();
  }

  /**
   * 记录事件
   * @param type 事件类型
   * @param extras 额外信息
   */
  private recordEvent(type: AttentionEventType, extras?: Partial<AttentionEvent>) {
    const event: AttentionEvent = {
      id: generateId('att-event'),
      sessionId: this.session.id,
      type,
      timestamp: Date.now(),
      ...extras,
    };
    this.session.events.push(event);
    // 更新交互计数（只统计主动交互事件）
    this.session.interactionCount = this.session.events.filter((e) =>
      ['click', 'scroll', 'selection', 'keydown'].includes(e.type)
    ).length;
    this.options.onEvent?.(event);
    this.updateComputed();
    this.options.onSessionUpdate?.(this.session);
  }

  /** 更新计算属性（分数、标志等） */
  private updateComputed() {
    const now = Date.now();
    this.session.totalMs = now - this.session.startTime;
    if (this.focusStartTime) {
      this.session.focusMs = (this.session.focusMs || 0) + (now - this.focusStartTime);
      this.focusStartTime = now;
    }
    // 获取视觉焦点分数（如果有摄像头监督模块）
    const visualFocus = this.options.getVisualFocusScore?.() ?? 1;
    const result = computeAttentionScore(this.session, this.options.contentLength || 0, undefined, visualFocus);
    this.session.score = result.score;
    this.session.flags = result.flags;
  }

  /**
   * 获取当前会话状态（只读副本）
   * @returns 会话状态
   */
  getSession(): AttentionSession {
    return { ...this.session };
  }

  /**
   * 结束追踪会话
   * @returns 最终会话状态
   */
  end(): AttentionSession {
    this.detach();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.session.endTime = Date.now();
    this.updateComputed();
    return { ...this.session };
  }
}

/**
 * 注意力分数计算结果接口
 */
export interface AttentionScoreResult {
  score: number;           // 注意力分数 (0-1)
  flags: AttentionFlag[];  // 警告标志列表
  explanation: string;     // 分数解释说明
}

/**
 * 计算注意力分数
 * 
 * 综合多个维度评估用户的注意力状态：
 * - 阅读时间充足度 (25%)
 * - 滚动覆盖率 (20%)
 * - 交互密度 (15%)
 * - 空闲比例惩罚 (10%)
 * - 警告标志惩罚 (10%)
 * - 视觉焦点分数 (20%)
 * 
 * @param session 注意力会话
 * @param contentLength 内容长度（字符数）
 * @param config 配置参数
 * @param visualFocusScore 视觉焦点分数 (0-1)，来自摄像头监督
 * @returns 注意力分数结果
 */
export function computeAttentionScore(
  session: AttentionSession,
  contentLength: number,
  config?: {
    minReadSeconds?: number;           // 最小阅读时间（秒），默认30秒
    readingSpeedCpm?: number;          // 阅读速度（字符/分钟），默认350
    minScrollCoverage?: number;        // 最小滚动覆盖率，默认0.5
    minInteractionPerMinute?: number;  // 每分钟最小交互次数，默认2
    maxIdleRatio?: number;             // 最大空闲比例，默认0.5
  },
  visualFocusScore = 1
): AttentionScoreResult {
  // 使用默认配置或用户配置
  const {
    minReadSeconds = 30,
    readingSpeedCpm = 350,
    minScrollCoverage = 0.5,
    minInteractionPerMinute = 2,
    maxIdleRatio = 0.5,
  } = config || {};

  const flags: AttentionFlag[] = [];
  const durationSec = session.totalMs / 1000;
  const focusSec = session.focusMs / 1000;
  // 期望阅读时间 = max(最小阅读时间, 内容长度/阅读速度)
  const expectedReadSeconds = Math.max(minReadSeconds, (contentLength / readingSpeedCpm) * 60);

  // 检测各种注意力问题
  if (focusSec < expectedReadSeconds) {
    flags.push('insufficient_reading_time');
  }
  if (session.scrollCoverage < minScrollCoverage) {
    flags.push('low_scroll_coverage');
  }

  const idleRatio = session.totalMs > 0 ? session.totalIdleMs / session.totalMs : 0;
  if (idleRatio > maxIdleRatio) {
    flags.push('high_idle_ratio');
  }

  const tabSwitches = session.events.filter((e) => e.type === 'visibility_hidden').length;
  if (tabSwitches > 0) {
    flags.push('tab_switched');
  }

  const durationMin = durationSec / 60;
  const interactionDensity = durationMin > 0 ? session.interactionCount / durationMin : 0;
  if (interactionDensity < minInteractionPerMinute) {
    flags.push('low_interaction');
  }

  // 检测粘贴行为
  const pasteEvents = session.events.filter(
    (e) => e.type === 'keydown' && (e.metadata?.paste === true)
  ).length;
  if (pasteEvents > 0) {
    flags.push('copy_paste_detected');
  }

  // 长内容需要选中文本
  const hasSelection = session.events.some((e) => e.type === 'selection');
  if (!hasSelection && contentLength > 200) {
    flags.push('no_selection');
  }

  // 综合分心检测
  if (tabSwitches > 1 || idleRatio > 0.3) {
    flags.push('high_distraction');
  }

  // 计算各维度分数
  const timeScore = Math.min(1, focusSec / expectedReadSeconds);       // 时间分数
  const coverageScore = session.scrollCoverage;                        // 覆盖分数
  const idlePenalty = Math.max(0, 1 - idleRatio * 2);                 // 空闲惩罚
  const interactionScore = Math.min(1, interactionDensity / 10);      // 交互分数
  const flagPenalty = 1 / (1 + flags.length * 0.15);                  // 标志惩罚（每个标志扣15%）

  // 综合评分（加权求和）
  const score = Math.min(
    1,
    timeScore * 0.25 +           // 阅读时间：25%
      coverageScore * 0.2 +       // 滚动覆盖：20%
      interactionScore * 0.15 +   // 交互密度：15%
      idlePenalty * 0.1 +        // 空闲惩罚：10%
      flagPenalty * 0.1 +        // 标志惩罚：10%
      visualFocusScore * 0.2      // 视觉焦点：20%
  );

  return {
    score: Math.round(score * 100) / 100,  // 保留两位小数
    flags,
    explanation: generateExplanation(score, flags),
  };
}

/**
 * 根据分数和标志生成人性化解释
 * @param score 注意力分数
 * @param flags 警告标志列表
 * @returns 解释文本
 */
function generateExplanation(score: number, flags: AttentionFlag[]): string {
  if (score >= 0.8) return '注意力集中，阅读与交互情况良好。';
  if (score >= 0.5) {
    const main = flags[0] ? flagToLabel(flags[0]) : '部分指标未达标';
    return `注意力一般，主要问题：${main}。`;
  }
  const issues = flags.slice(0, 2).map(flagToLabel).join('、') || '多项指标偏低';
  return `注意力较低，建议专注：${issues}。`;
}

/**
 * 将警告标志转换为中文标签
 * @param flag 警告标志
 * @returns 中文标签
 */
export function flagToLabel(flag: AttentionFlag): string {
  const map: Record<AttentionFlag, string> = {
    insufficient_reading_time: '阅读时间不足',
    low_scroll_coverage: '滚动覆盖不够',
    high_idle_ratio: '空闲时间过长',
    tab_switched: '切换过标签页',
    low_interaction: '交互过少',
    copy_paste_detected: '检测到粘贴',
    no_selection: '未选中文本',
    high_distraction: '分心迹象明显',
  };
  return map[flag] || flag;
}
