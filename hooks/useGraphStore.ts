import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  GraphNode,
  GraphLink,
  AIGraphPayload,
  AIReasoningPayload,
  Attachment,
  ContentItem,
  ChangeLogEntry,
  CognitiveTrainingConfig,
  TrainingSession,
  Project,
  ReasoningThread,
  ReasoningStep,
  InterventionCard,
  CounterfactualCard,
  EvidenceItem,
  ExecutionTask,
  ContentCluster,
  GlobalReviewResult,
  FocusSession,
} from '@/lib/types';
import { db, saveProject, loadProject, deleteBlob } from '@/lib/db';
import { generateId } from '@/lib/graph-utils';
import { mergeAIPayload } from '@/lib/llm';
import { sanitizeProject } from '@/lib/project-sanitize';

function cleanupNodeBlobs(nodes: GraphNode[]) {
  for (const node of nodes) {
    for (const att of node.attachments || []) {
      if (att.blobRef) deleteBlob(att.blobRef).catch(() => {});
    }
  }
}

interface GraphSnapshot {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface GraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNodeId: string | null;
  /** Multi-selected node ids */
  multiSelectedIds: Set<string>;
  /** Highlighted node ids from search */
  highlightedNodeIds: Set<string>;
  loading: boolean;
  hydrated: boolean;
  clusterMode: boolean;
  /** View mode: normal = current nested view; global = show all top-level nodes / clusters */
  viewMode: 'normal' | 'global';
  setViewMode: (mode: 'normal' | 'global') => void;

  /** Current nested view: null = root graph, otherwise id of the parent node whose children are shown */
  currentViewNodeId: string | null;
  /** Breadcrumb stack for nested navigation */
  viewStack: string[];
  /** Sticky notes: open node detail windows */
  stickyNotes: Array<{
    id: string;
    nodeId?: string;
    task?: ExecutionTask;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
  }>;
  openStickyNote: (nodeId: string, x?: number, y?: number) => void;
  openTaskStickyNote: (task: ExecutionTask, x?: number, y?: number) => void;
  closeStickyNote: (id: string) => void;
  updateStickyNote: (id: string, patch: Partial<{ x: number; y: number; width: number; height: number; minimized: boolean }>) => void;

  /** Legacy timeline events, migrated to executionTasks on load */
  timelineEvents: import('@/lib/types').TimelineEvent[];
  executionTasks: ExecutionTask[];
  addExecutionTask: (task: Omit<ExecutionTask, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateExecutionTask: (id: string, patch: Partial<ExecutionTask>) => void;
  deleteExecutionTask: (id: string) => void;

  reasoningThreads: ReasoningThread[];
  addReasoningThread: (thread: Omit<ReasoningThread, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => string;
  updateReasoningThread: (id: string, patch: Partial<ReasoningThread>) => void;
  deleteReasoningThread: (id: string) => void;
  reasoningPanelOpen: boolean;
  setReasoningPanelOpen: (v: boolean) => void;

  workspace: 'graph' | 'execution' | 'reasoning';
  setWorkspace: (w: 'graph' | 'execution' | 'reasoning') => void;

  pathFinderActive: boolean;
  pathSourceId: string | null;
  pathTargetId: string | null;
  pathHighlightNodeIds: Set<string>;
  pathHighlightLinkIds: Set<string>;
  setPathFinderActive: (v: boolean) => void;
  setPathSourceId: (id: string | null) => void;
  setPathTargetId: (id: string | null) => void;
  setPathHighlightNodeIds: (ids: Set<string>) => void;
  setPathHighlightLinkIds: (ids: Set<string>) => void;
  clearPathFinder: () => void;

  evidenceItems: EvidenceItem[];
  addEvidenceItem: (item: Omit<EvidenceItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateEvidenceItem: (id: string, patch: Partial<EvidenceItem>) => void;
  deleteEvidenceItem: (id: string) => void;

  setHydrated: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  setClusterMode: (v: boolean) => void;
  toggleClusterMode: () => void;

  // Multi-select
  toggleMultiSelect: (id: string) => void;
  clearMultiSelect: () => void;
  batchDeleteNodes: (ids: string[]) => void;
  batchAddTag: (ids: string[], tag: string) => void;
  batchLinkTo: (sourceIds: string[], targetId: string) => void;
  batchSetLinkColor: (sourceIds: string[], targetIds: string[], color: string) => void;
  batchSetLinkTheme: (sourceIds: string[], targetIds: string[], theme: string) => void;
  markCycleLinks: (sourceIds: string[], targetIds: string[]) => void;

  // Nested views
  enterNodeView: (id: string | null) => void;
  exitNodeView: () => void;
  goToRootView: () => void;
  moveNodeToParent: (nodeId: string, parentId: string | null) => void;
  moveNodesToParent: (nodeIds: string[], parentId: string) => void;
  moveContentItemToNode: (itemId: string, sourceNodeId: string, targetNodeId?: string | null) => string;

  // Project export by link color
  exportSubgraphByColor: (color: string) => Project;
  exportSubgraphByTheme: (theme: string) => Project;

  addNode: (node: Partial<GraphNode> & { id?: string }) => string;
  updateNode: (id: string, updater: Partial<GraphNode>) => void;
  deleteNode: (id: string) => void;
  addLink: (link: GraphLink) => void;
  deleteLink: (source: string, target: string) => void;
  updateLink: (source: string, target: string, updater: Partial<GraphLink>) => void;
  addAttachment: (nodeId: string, attachment: Omit<Attachment, 'id' | 'createdAt'> & { id?: string }) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
  addContentItem: (nodeId: string, item: Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateContentItem: (nodeId: string, itemId: string, updater: Partial<ContentItem>) => void;
  deleteContentItem: (nodeId: string, itemId: string) => void;
  applyAIPayload: (payload: AIGraphPayload, prompt?: string, aiGrade?: GraphNode['aiGrade']) => void;
  applyAIReasoningPayload: (payload: AIReasoningPayload, prompt?: string) => string;
  importProject: (project: Project) => void;
  importProjectById: (id: string) => Promise<void>;
  newProject: () => void;
  saveCurrentProject: (name: string) => Promise<string>;
  loadProjectById: (id: string) => Promise<void>;

  // Undo history
  history: GraphSnapshot[];
  pushHistory: () => void;
  undo: () => void;

  // Change log
  changeLog: ChangeLogEntry[];
  addChangeLogEntry: (entry: Omit<ChangeLogEntry, 'id' | 'timestamp'>) => void;
  clearChangeLog: () => void;

  overviewReport: string;
  setOverviewReport: (report: string) => void;

  globalReview: GlobalReviewResult | null;
  setGlobalReview: (review: GlobalReviewResult | null) => void;

  contentClusters: ContentCluster[];
  setContentClusters: (clusters: ContentCluster[] | ((prev: ContentCluster[]) => ContentCluster[])) => void;

  nebulaMode: boolean;
  setNebulaMode: (v: boolean) => void;

  // Cognitive training supervision
  cognitiveTraining: CognitiveTrainingConfig;
  trainingSession: TrainingSession;
  setCognitiveTraining: (config: Partial<CognitiveTrainingConfig>) => void;
  recordTrainingInteraction: () => void;
  recordTrainingSummary: () => void;
  recordTrainingManualNode: () => void;

  // Visual focus sessions
  focusSessions: FocusSession[];
  addFocusSession: (session: FocusSession) => void;

  // Customization
  customAgentPrompt: string | null;
  setCustomAgentPrompt: (prompt: string | null) => void;

  // Project identity (for per-project chat memory)
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  // LLM settings
  llmProvider: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  setLLMSettings: (settings: Partial<{ provider: string; apiKey: string; baseURL: string; model: string }>) => void;
}

function nowMeta() {
  return { createdAt: Date.now(), updatedAt: Date.now() };
}

const MAX_HISTORY = 20;

function cloneSnapshot(nodes: GraphNode[], links: GraphLink[]): GraphSnapshot {
  return JSON.parse(JSON.stringify({ nodes, links }));
}

function ensureNodeDefaults(partial: Partial<GraphNode>): GraphNode {
  const id = partial.id || generateId('node');
  return {
    ...(partial as any),
    id,
    type: partial.type || 'concept',
    attachments: partial.attachments || [],
    contentItems: partial.contentItems || [],
    metadata: { ...(partial.metadata || {}), ...nowMeta() },
  };
}

export const useGraphStore = create<GraphState>()(
  persist(
    (set, get) => ({
      nodes: [],
      links: [],
      selectedNodeId: null,
      multiSelectedIds: new Set(),
      highlightedNodeIds: new Set(),
      loading: false,
      hydrated: false,
      clusterMode: false,
      viewMode: 'normal',
      currentViewNodeId: null,
      viewStack: [],
      stickyNotes: [],
      timelineEvents: [],
      executionTasks: [],
      reasoningThreads: [],
      evidenceItems: [],
      reasoningPanelOpen: false,
      workspace: 'graph',
      pathFinderActive: false,
      pathSourceId: null,
      pathTargetId: null,
      pathHighlightNodeIds: new Set(),
      pathHighlightLinkIds: new Set(),
      changeLog: [],
      overviewReport: '',
      globalReview: null,
      contentClusters: [],
      nebulaMode: false,
      history: [],
      currentProjectId: null,
      setCurrentProjectId: (id) => set({ currentProjectId: id }),
      llmProvider: process.env.NEXT_PUBLIC_LLM_PROVIDER || 'deepseek',
      llmApiKey: '',
      llmBaseUrl: '',
      llmModel: '',
      setLLMSettings: (settings) =>
        set((state) => ({
          llmProvider: settings.provider ?? state.llmProvider,
          llmApiKey: settings.apiKey ?? state.llmApiKey,
          llmBaseUrl: settings.baseURL ?? state.llmBaseUrl,
          llmModel: settings.model ?? state.llmModel,
        })),
      pushHistory: () => {
        const { nodes, links, history } = get();
        const snapshot = cloneSnapshot(nodes, links);
        set({ history: [...history.slice(-MAX_HISTORY + 1), snapshot] });
      },
      cognitiveTraining: {
        enabled: false,
        minReadSeconds: 30,
        requireSelfSummary: true,
        requireManualNode: true,
      },
      trainingSession: {
        id: generateId('ts'),
        startedAt: Date.now(),
        totalAiInteractions: 0,
        selfSummaries: 0,
        manualNodes: 0,
        minutesRead: 0,
      },
      focusSessions: [],
      customAgentPrompt: null,

      setHydrated: (v) => set({ hydrated: v }),
      setLoading: (v) => set({ loading: v }),
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),

      openStickyNote: (nodeId, x, y) =>
        set((state) => {
          const existingIndex = state.stickyNotes.findIndex((n) => n.nodeId === nodeId);
          if (existingIndex >= 0) {
            // Re-activate existing note: bring to front, unminimize, optionally move near click
            const existing = state.stickyNotes[existingIndex];
            const baseX = (x ?? existing.x) + 24;
            const baseY = y ?? existing.y;
            const safeX = Math.max(8, Math.min(window.innerWidth - 400, baseX));
            const safeY = Math.max(8, Math.min(window.innerHeight - 560, baseY));
            const next = [...state.stickyNotes];
            next.splice(existingIndex, 1);
            next.push({ ...existing, x: safeX, y: safeY, minimized: false });
            return { stickyNotes: next };
          }
          const count = state.stickyNotes.length;
          const baseX = (x ?? 100 + count * 30) + 24;
          const baseY = y ?? 100 + count * 30;
          const safeX = Math.max(8, Math.min(window.innerWidth - 400, baseX));
          const safeY = Math.max(8, Math.min(window.innerHeight - 560, baseY));
          return {
            stickyNotes: [
              ...state.stickyNotes,
              {
                id: generateId('sticky'),
                nodeId,
                x: safeX,
                y: safeY,
                width: 380,
                height: 520,
                minimized: false,
              },
            ],
          };
        }),
      openTaskStickyNote: (task, x, y) =>
        set((state) => {
          const existingIndex = state.stickyNotes.findIndex((n) => n.task?.id === task.id);
          if (existingIndex >= 0) {
            const existing = state.stickyNotes[existingIndex];
            const baseX = (x ?? existing.x) + 24;
            const baseY = y ?? existing.y;
            const safeX = Math.max(8, Math.min(window.innerWidth - 400, baseX));
            const safeY = Math.max(8, Math.min(window.innerHeight - 560, baseY));
            const next = [...state.stickyNotes];
            next.splice(existingIndex, 1);
            next.push({ ...existing, task, x: safeX, y: safeY, minimized: false });
            return { stickyNotes: next };
          }
          const count = state.stickyNotes.length;
          const baseX = (x ?? 100 + count * 30) + 24;
          const baseY = y ?? 100 + count * 30;
          const safeX = Math.max(8, Math.min(window.innerWidth - 400, baseX));
          const safeY = Math.max(8, Math.min(window.innerHeight - 560, baseY));
          return {
            stickyNotes: [
              ...state.stickyNotes,
              {
                id: generateId('sticky'),
                task,
                x: safeX,
                y: safeY,
                width: 380,
                height: 520,
                minimized: false,
              },
            ],
          };
        }),
      closeStickyNote: (id) =>
        set((state) => ({
          stickyNotes: state.stickyNotes.filter((n) => n.id !== id),
        })),
      updateStickyNote: (id, patch) =>
        set((state) => ({
          stickyNotes: state.stickyNotes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),

      addExecutionTask: (task) => {
        const id = generateId('task');
        set((state) => ({
          executionTasks: [
            ...state.executionTasks,
            {
              ...task,
              id,
              status: task.status || 'todo',
              customMetrics: task.customMetrics || {},
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        }));
        return id;
      },
      updateExecutionTask: (id, patch) =>
        set((state) => ({
          executionTasks: state.executionTasks.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
          ),
        })),
      deleteExecutionTask: (id) =>
        set((state) => ({
          executionTasks: state.executionTasks.filter((t) => t.id !== id),
        })),

      addReasoningThread: (thread) => {
        const id = generateId('thread');
        set((state) => ({
          reasoningThreads: [
            ...state.reasoningThreads,
            {
              ...thread,
              id,
              status: 'draft',
              activeLayer: 'association',
              steps: thread.steps.map((s) => ({
                ...s,
                interventions: s.interventions || [],
                counterfactuals: s.counterfactuals || [],
              })),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        }));
        return id;
      },
      updateReasoningThread: (id, patch) =>
        set((state) => ({
          reasoningThreads: state.reasoningThreads.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t
          ),
        })),
      deleteReasoningThread: (id) =>
        set((state) => ({
          reasoningThreads: state.reasoningThreads.filter((t) => t.id !== id),
        })),
      setReasoningPanelOpen: (v) => set({ reasoningPanelOpen: v }),

      setWorkspace: (w) => set({ workspace: w }),

      setPathFinderActive: (v) => set({ pathFinderActive: v }),
      setPathSourceId: (id) => set({ pathSourceId: id }),
      setPathTargetId: (id) => set({ pathTargetId: id }),
      setPathHighlightNodeIds: (ids) => set({ pathHighlightNodeIds: ids }),
      setPathHighlightLinkIds: (ids) => set({ pathHighlightLinkIds: ids }),
      clearPathFinder: () =>
        set({
          pathFinderActive: false,
          pathSourceId: null,
          pathTargetId: null,
          pathHighlightNodeIds: new Set(),
          pathHighlightLinkIds: new Set(),
        }),

      addEvidenceItem: (item) => {
        const id = generateId('evidence');
        set((state) => ({
          evidenceItems: [
            ...state.evidenceItems,
            {
              ...item,
              id,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        }));
        return id;
      },
      updateEvidenceItem: (id, patch) =>
        set((state) => ({
          evidenceItems: state.evidenceItems.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e
          ),
        })),
      deleteEvidenceItem: (id) =>
        set((state) => ({
          evidenceItems: state.evidenceItems.filter((e) => e.id !== id),
        })),

      setHighlightedNodeIds: (ids) => set({ highlightedNodeIds: ids }),
      setClusterMode: (v) => set({ clusterMode: v }),
      toggleClusterMode: () => set((state) => ({ clusterMode: !state.clusterMode })),
      setViewMode: (mode) => set({ viewMode: mode }),

      toggleMultiSelect: (id) =>
        set((state) => {
          const next = new Set(state.multiSelectedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { multiSelectedIds: next };
        }),

      clearMultiSelect: () => set({ multiSelectedIds: new Set() }),

      batchDeleteNodes: (ids) => {
        get().pushHistory();
        set((state) => {
          const idSet = new Set(ids);
          // Cascade delete: any node whose parent is deleted is also removed
          const nodesToDelete = new Set<string>();
          const collect = (nodeIds: string[]) => {
            for (const id of nodeIds) {
              if (nodesToDelete.has(id)) continue;
              nodesToDelete.add(id);
              const children = state.nodes.filter((n) => n.parentId === id).map((n) => n.id);
              collect(children);
            }
          };
          collect(ids);
          const deletedNodes = state.nodes.filter((n) => nodesToDelete.has(n.id));
          cleanupNodeBlobs(deletedNodes);
          return {
            nodes: state.nodes.filter((n) => !nodesToDelete.has(n.id)),
            links: state.links.filter(
              (l) => !nodesToDelete.has(l.source as string) && !nodesToDelete.has(l.target as string)
            ),
            selectedNodeId: nodesToDelete.has(state.selectedNodeId || '') ? null : state.selectedNodeId,
            multiSelectedIds: new Set(Array.from(state.multiSelectedIds).filter((x) => !nodesToDelete.has(x))),
            highlightedNodeIds: new Set(Array.from(state.highlightedNodeIds).filter((x) => !nodesToDelete.has(x))),
            currentViewNodeId:
              state.currentViewNodeId && nodesToDelete.has(state.currentViewNodeId) ? null : state.currentViewNodeId,
            viewStack: state.viewStack.filter((id) => !nodesToDelete.has(id)),
          };
        });
      },

      batchAddTag: (ids, tag) => {
        get().pushHistory();
        set((state) => ({
          nodes: state.nodes.map((n) => {
            if (!ids.includes(n.id)) return n;
            const tags = Array.from(new Set([...(n.metadata.tags || []), tag]));
            return { ...n, metadata: { ...n.metadata, tags, updatedAt: Date.now() } };
          }),
        }));
      },

      batchLinkTo: (sourceIds, targetId) => {
        get().pushHistory();
        set((state) => {
          const newLinks = sourceIds
            .filter((sid) => sid !== targetId)
            .map((sid) => ({ source: sid, target: targetId }));
          const exists = new Set(state.links.map((l) => `${l.source}->${l.target}`));
          const filtered = newLinks.filter((l) => !exists.has(`${l.source}->${l.target}`));
          return { links: [...state.links, ...filtered] };
        });
      },

      batchSetLinkColor: (sourceIds, targetIds, color) => {
        get().pushHistory();
        set((state) => {
          const pairs = new Set<string>();
          for (const s of sourceIds) {
            for (const t of targetIds) {
              if (s !== t) pairs.add(`${s}->${t}`);
            }
          }
          return {
            links: state.links.map((l) => {
              const key = `${l.source}->${l.target}`;
              return pairs.has(key) ? { ...l, color } : l;
            }),
          };
        });
      },

      batchSetLinkTheme: (sourceIds, targetIds, theme) => {
        get().pushHistory();
        set((state) => {
          const pairs = new Set<string>();
          for (const s of sourceIds) {
            for (const t of targetIds) {
              if (s !== t) pairs.add(`${s}->${t}`);
            }
          }
          return {
            links: state.links.map((l) => {
              const key = `${l.source}->${l.target}`;
              return pairs.has(key) ? { ...l, theme } : l;
            }),
          };
        });
      },

      markCycleLinks: (sourceIds, targetIds) => {
        get().pushHistory();
        set((state) => {
          const pairs = new Set<string>();
          for (const s of sourceIds) {
            for (const t of targetIds) {
              if (s !== t) pairs.add(`${s}->${t}`);
              if (s !== t) pairs.add(`${t}->${s}`);
            }
          }
          return {
            links: state.links.map((l) => {
              const key = `${l.source}->${l.target}`;
              return pairs.has(key) ? { ...l, variant: 'cycle' as const } : l;
            }),
          };
        });
      },

      addNode: (partial) => {
        get().pushHistory();
        const node = ensureNodeDefaults(partial);
        set((state) => ({ nodes: [...state.nodes, node], selectedNodeId: node.id }));
        return node.id;
      },

      updateNode: (id, updater) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? { ...n, ...updater, metadata: { ...n.metadata, ...updater.metadata, updatedAt: Date.now() } } : n
          ),
        })),

      deleteNode: (id) => {
        get().pushHistory();
        set((state) => {
          const idsToDelete = new Set<string>();
          const collect = (nodeId: string) => {
            if (idsToDelete.has(nodeId)) return;
            idsToDelete.add(nodeId);
            state.nodes.filter((n) => n.parentId === nodeId).forEach((n) => collect(n.id));
          };
          collect(id);
          const deletedNodes = state.nodes.filter((n) => idsToDelete.has(n.id));
          cleanupNodeBlobs(deletedNodes);
          return {
            nodes: state.nodes.filter((n) => !idsToDelete.has(n.id)),
            links: state.links.filter(
              (l) => !idsToDelete.has(l.source as string) && !idsToDelete.has(l.target as string)
            ),
            selectedNodeId: idsToDelete.has(state.selectedNodeId || '') ? null : state.selectedNodeId,
            multiSelectedIds: new Set(Array.from(state.multiSelectedIds).filter((x) => !idsToDelete.has(x))),
            highlightedNodeIds: new Set(Array.from(state.highlightedNodeIds).filter((x) => !idsToDelete.has(x))),
            currentViewNodeId:
              state.currentViewNodeId && idsToDelete.has(state.currentViewNodeId) ? null : state.currentViewNodeId,
            viewStack: state.viewStack.filter((x) => !idsToDelete.has(x)),
          };
        });
      },

      addLink: (link) => {
        get().pushHistory();
        set((state) => {
          const exists = state.links.some(
            (l) =>
              l.source === link.source &&
              l.target === link.target &&
              l.color === link.color &&
              l.theme === link.theme &&
              l.variant === link.variant
          );
          if (exists) return state;
          return { links: [...state.links, link] };
        });
      },

      deleteLink: (source, target) => {
        get().pushHistory();
        set((state) => {
          let removed = false;
          return {
            links: state.links.filter((l) => {
              if (!removed && l.source === source && l.target === target) {
                removed = true;
                return false;
              }
              return true;
            }),
          };
        });
      },

      updateLink: (source, target, updater) => {
        get().pushHistory();
        set((state) => ({
          links: state.links.map((l) =>
            l.source === source && l.target === target ? { ...l, ...updater } : l
          ),
        }));
      },

      addAttachment: (nodeId, attachment) => {
        get().pushHistory();
        const id = (attachment as any).id || generateId('att');
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  attachments: [
                    ...n.attachments,
                    { ...attachment, id, createdAt: Date.now() },
                  ],
                  metadata: { ...n.metadata, updatedAt: Date.now() },
                }
              : n
          ),
        }));
      },

      removeAttachment: (nodeId, attachmentId) => {
        get().pushHistory();
        const attachment = get().nodes.find((n) => n.id === nodeId)?.attachments.find((a) => a.id === attachmentId);
        if (attachment?.blobRef) {
          deleteBlob(attachment.blobRef).catch(() => {});
        }
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  attachments: n.attachments.filter((a) => a.id !== attachmentId),
                  metadata: { ...n.metadata, updatedAt: Date.now() },
                }
              : n
          ),
        }));
      },

      addContentItem: (nodeId, item) => {
        get().pushHistory();
        const id = generateId('ci');
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  contentItems: [
                    ...n.contentItems,
                    { ...item, id, createdAt: Date.now(), updatedAt: Date.now() },
                  ],
                  metadata: { ...n.metadata, updatedAt: Date.now() },
                }
              : n
          ),
        }));
        return id;
      },

      updateContentItem: (nodeId, itemId, updater) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  contentItems: n.contentItems.map((item) =>
                    item.id === itemId ? { ...item, ...updater, updatedAt: Date.now() } : item
                  ),
                  metadata: { ...n.metadata, updatedAt: Date.now() },
                }
              : n
          ),
        })),

      deleteContentItem: (nodeId, itemId) => {
        get().pushHistory();
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  contentItems: n.contentItems.filter((item) => item.id !== itemId),
                  metadata: { ...n.metadata, updatedAt: Date.now() },
                }
              : n
          ),
        }));
      },

      applyAIPayload: (payload, prompt = '', aiGrade) => {
        get().pushHistory();
        const { nodes, links } = get();
        const beforeNodeIds = new Set(nodes.map((n) => n.id));
        const beforeLabels = new Map(nodes.map((n) => [n.id, n.label]));
        const beforeLinkCount = links.length;

        const merged = mergeAIPayload(nodes, payload, aiGrade);
        const newNodes = merged.nodes;
        const newLinks = [...links, ...merged.links];

        const added: string[] = [];
        const updated: string[] = [];
        newNodes.forEach((n) => {
          if (!beforeNodeIds.has(n.id)) added.push(n.label);
          else if (beforeLabels.get(n.id) !== n.label) updated.push(n.label);
        });

        // Detect removed nodes (AI may suggest consolidation by overwriting with empty payload)
        const afterNodeIds = new Set(newNodes.map((n) => n.id));
        const removed: string[] = nodes.filter((n) => !afterNodeIds.has(n.id)).map((n) => n.label);

        const linksAdded = newLinks.length - beforeLinkCount;

        const summaryParts: string[] = [];
        if (added.length) summaryParts.push(`新增 ${added.length} 个节点`);
        if (updated.length) summaryParts.push(`更新 ${updated.length} 个节点`);
        if (removed.length) summaryParts.push(`移除 ${removed.length} 个节点`);
        if (linksAdded > 0) summaryParts.push(`新增 ${linksAdded} 条关系`);
        const summary = summaryParts.length ? summaryParts.join('，') : '未改变图谱结构';

        set({
          nodes: newNodes,
          links: newLinks,
          changeLog: [
            {
              id: generateId('log'),
              timestamp: Date.now(),
              prompt,
              summary,
              nodesAdded: added,
              nodesUpdated: updated,
              nodesRemoved: removed,
              linksAdded,
            },
            ...get().changeLog,
          ].slice(0, 200),
        });
      },

      addChangeLogEntry: (entry) =>
        set((state) => ({
          changeLog: [
            { ...entry, id: generateId('log'), timestamp: Date.now() },
            ...state.changeLog,
          ].slice(0, 200),
        })),

      applyAIReasoningPayload: (payload, prompt = '') => {
        get().pushHistory();
        const id = generateId('thread');
        const now = Date.now();
        const steps = (payload.steps || []).map((s) => ({
          id: generateId('step'),
          claim: s.claim || '未命名论断',
          reasoning: s.reasoning || '',
          evidenceIds: [],
          confidence: (['high', 'medium', 'low'].includes(s.confidence as string) ? s.confidence : 'medium') as ReasoningStep['confidence'],
          suggestedEvidenceQuery: s.suggestedEvidenceQuery || '',
          status: 'pending' as ReasoningStep['status'],
          interventions: (s.interventions || []).map((iv) => ({
            id: generateId('iv'),
            variable: iv.variable || '',
            intervention: iv.intervention || '',
            predictedOutcome: iv.predictedOutcome || '',
            controlVariables: Array.isArray(iv.controlVariables) ? iv.controlVariables : [],
            status: (['draft', 'tested', 'confirmed', 'rejected'].includes(iv.status as string) ? iv.status : 'draft') as InterventionCard['status'],
          })),
          counterfactuals: (s.counterfactuals || []).map((cf) => ({
            id: generateId('cf'),
            scenario: cf.scenario || '',
            implication: cf.implication || '',
            boundaryCondition: cf.boundaryCondition || '',
            vulnerability: cf.vulnerability || '',
            status: 'draft' as CounterfactualCard['status'],
          })),
        }));

        set((state) => ({
          reasoningThreads: [
            ...state.reasoningThreads,
            {
              id,
              title: payload.title || 'AI 推理线程',
              question: payload.question || prompt || 'AI 生成的推理问题',
              summary: payload.summary || payload.explanation || '',
              ownReasoning: '',
              activeLayer: 'association',
              status: 'draft',
              steps,
              createdAt: now,
              updatedAt: now,
            },
          ],
          changeLog: [
            {
              id: generateId('log'),
              timestamp: now,
              prompt,
              summary: `AI 新增推理线程「${payload.title || 'AI 推理线程'}」，含 ${steps.length} 个步骤`,
              nodesAdded: [],
              nodesUpdated: [],
              nodesRemoved: [],
              linksAdded: 0,
            },
            ...state.changeLog,
          ].slice(0, 200),
        }));
        return id;
      },

      clearChangeLog: () => set({ changeLog: [] }),
      setOverviewReport: (report) => set({ overviewReport: report }),
      setGlobalReview: (review) => set({ globalReview: review }),
      setContentClusters: (clusters) =>
        set((state) => ({
          contentClusters: typeof clusters === 'function' ? clusters(state.contentClusters) : clusters,
        })),
      setNebulaMode: (v) => set({ nebulaMode: v }),

      setCognitiveTraining: (config) =>
        set((state) => ({
          cognitiveTraining: { ...state.cognitiveTraining, ...config },
        })),

      recordTrainingInteraction: () =>
        set((state) => ({
          trainingSession: {
            ...state.trainingSession,
            totalAiInteractions: state.trainingSession.totalAiInteractions + 1,
          },
        })),

      recordTrainingSummary: () =>
        set((state) => ({
          trainingSession: {
            ...state.trainingSession,
            selfSummaries: state.trainingSession.selfSummaries + 1,
          },
        })),

      recordTrainingManualNode: () =>
        set((state) => ({
          trainingSession: {
            ...state.trainingSession,
            manualNodes: state.trainingSession.manualNodes + 1,
          },
        })),

      addFocusSession: (session) =>
        set((state) => ({
          focusSessions: [session, ...state.focusSessions].slice(0, 200),
        })),

      setCustomAgentPrompt: (prompt) => set({ customAgentPrompt: prompt }),

      // --- Nested views ---
      enterNodeView: (id) =>
        set((state) => {
          if (id === null) {
            return { currentViewNodeId: null, viewStack: [] };
          }
          const stack = state.currentViewNodeId
            ? [...state.viewStack, state.currentViewNodeId]
            : state.viewStack;

          const parentNode = state.nodes.find((n) => n.id === id);
          if (parentNode && ((parentNode.contentItems?.length || 0) > 0 || (parentNode.attachments?.length || 0) > 0)) {
            const newNodes: GraphNode[] = [];
            const newLinks: GraphLink[] = [];

            for (const item of parentNode.contentItems || []) {
              const childId = generateId('node');
              newNodes.push({
                id: childId,
                label: item.title || '未命名内容',
                labelEn: item.titleEn,
                type: 'note',
                description: (item.content || '').slice(0, 120),
                descriptionEn: item.contentEn?.slice(0, 120),
                attachments: [],
                contentItems: [
                  {
                    ...item,
                    id: generateId('ci'),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  },
                ],
                parentId: id,
                metadata: {
                  tags: [...(item.tags || [])],
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              });
              newLinks.push({ source: id, target: childId, label: '包含' });
            }

            for (const att of parentNode.attachments || []) {
              const childId = generateId('node');
              newNodes.push({
                id: childId,
                label: att.name,
                type: 'paper',
                description: `[${att.type}] ${att.url || att.content?.slice(0, 80) || ''}`,
                attachments: [
                  {
                    ...att,
                    id: generateId('att'),
                    createdAt: Date.now(),
                  },
                ],
                contentItems: [],
                parentId: id,
                metadata: {
                  tags: [],
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              });
              newLinks.push({ source: id, target: childId, label: '包含' });
            }

            return {
              nodes: state.nodes.map((n) =>
                n.id === id
                  ? { ...n, contentItems: [], attachments: [], metadata: { ...n.metadata, updatedAt: Date.now() } }
                  : n
              ).concat(newNodes),
              links: [...state.links, ...newLinks],
              currentViewNodeId: id,
              viewStack: stack,
              selectedNodeId: null,
            };
          }

          return { currentViewNodeId: id, viewStack: stack, selectedNodeId: null };
        }),

      exitNodeView: () =>
        set((state) => {
          if (state.viewStack.length === 0) {
            return { currentViewNodeId: null, viewStack: [] };
          }
          const nextStack = [...state.viewStack];
          const parentId = nextStack.pop() || null;
          return { currentViewNodeId: parentId, viewStack: nextStack, selectedNodeId: null };
        }),

      goToRootView: () => set({ currentViewNodeId: null, viewStack: [], selectedNodeId: null }),

      moveNodeToParent: (nodeId, parentId) => {
        get().pushHistory();
        set((state) => {
          // Prevent cycles: a parent cannot be moved into its own descendant
          let cursor = parentId;
          while (cursor) {
            if (cursor === nodeId) return state;
            cursor = state.nodes.find((n) => n.id === cursor)?.parentId || null;
          }
          return {
            nodes: state.nodes.map((n) =>
              n.id === nodeId ? { ...n, parentId: parentId || undefined } : n
            ),
          };
        });
      },

      moveNodesToParent: (nodeIds, parentId) => {
        get().pushHistory();
        set((state) => {
          const parentNode = state.nodes.find((n) => n.id === parentId);
          if (!parentNode) return state;

          const idSet = new Set(nodeIds);
          idSet.delete(parentId);

          // Prevent cycles
          const wouldCycle = (nodeId: string) => {
            let cursor: string | null = parentId;
            while (cursor) {
              if (cursor === nodeId) return true;
              cursor = state.nodes.find((n) => n.id === cursor)?.parentId || null;
            }
            return false;
          };

          const validIds = Array.from(idSet).filter((id) => {
            const node = state.nodes.find((n) => n.id === id);
            return node && !wouldCycle(id);
          });

          const parentItems = parentNode.contentItems || [];
          const existingTitles = new Set(parentItems.map((ci) => ci.title));
          const newContentItems = [...parentItems];

          const updatedNodes = state.nodes.map((n) => {
            if (!validIds.includes(n.id)) return n;

            // Also mirror the child as a content item in the parent
            if (!existingTitles.has(n.label)) {
              const summary = (n.contentItems || [])
                .map((ci) => ci.content)
                .join('\n')
                .slice(0, 500);
              newContentItems.push({
                id: generateId('ci'),
                title: n.label,
                titleEn: n.labelEn,
                content: n.description || summary || '由子节点转入',
                contentEn: n.descriptionEn,
                type: 'summary',
                tags: [...(n.metadata.tags || [])],
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            }

            return { ...n, parentId };
          });

          return {
            nodes: updatedNodes.map((n) =>
              n.id === parentId ? { ...n, contentItems: newContentItems } : n
            ),
          };
        });
      },

      moveContentItemToNode: (itemId, sourceNodeId, targetNodeId) => {
        get().pushHistory();
        const newNodeId = generateId('node');
        set((state) => {
          const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
          const item = sourceNode?.contentItems.find((ci) => ci.id === itemId);
          if (!sourceNode || !item) return state;

          const newNode: GraphNode = {
            id: newNodeId,
            label: item.title || '新节点',
            labelEn: item.titleEn,
            type: 'concept',
            description: (item.content || '').slice(0, 120),
            descriptionEn: item.contentEn?.slice(0, 120),
            color: undefined,
            val: undefined,
            attachments: [],
            contentItems: [
              {
                ...item,
                id: generateId('ci'),
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ],
            parentId: targetNodeId || undefined,
            metadata: {
              tags: [...(item.tags || [])],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          };

          return {
            nodes: [...state.nodes, newNode],
            links: targetNodeId
              ? [
                  ...state.links,
                  {
                    source: targetNodeId,
                    target: newNodeId,
                    label: '包含',
                  },
                ]
              : state.links,
          };
        });
        return newNodeId;
      },

      exportSubgraphByColor: (color) => {
        const { nodes, links } = get();
        const matchedLinks = links.filter((l) => l.color === color);
        const matchedNodeIds = new Set<string>();
        matchedLinks.forEach((l) => {
          matchedNodeIds.add(l.source as string);
          matchedNodeIds.add(l.target as string);
        });
        const matchedNodes = nodes.filter((n) => matchedNodeIds.has(n.id));
        return {
          id: generateId('proj'),
          name: `按颜色拆分: ${color}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          nodes: matchedNodes,
          links: matchedLinks,
        };
      },

      exportSubgraphByTheme: (theme) => {
        const { nodes, links } = get();
        const matchedLinks = links.filter((l) => l.theme === theme);
        const matchedNodeIds = new Set<string>();
        matchedLinks.forEach((l) => {
          matchedNodeIds.add(l.source as string);
          matchedNodeIds.add(l.target as string);
        });
        const matchedNodes = nodes.filter((n) => matchedNodeIds.has(n.id));
        return {
          id: generateId('proj'),
          name: `按主题拆分: ${theme}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          nodes: matchedNodes,
          links: matchedLinks,
        };
      },

      importProject: (project) => {
        get().pushHistory();
        const clean = sanitizeProject(project);
        set({
          nodes: clean.nodes,
          links: clean.links,
          selectedNodeId: null,
          multiSelectedIds: new Set(),
          highlightedNodeIds: new Set(),
          currentViewNodeId: null,
          viewStack: [],
          stickyNotes: [],
          timelineEvents: [],
          executionTasks: clean.executionTasks,
          viewMode: 'normal',
          reasoningThreads: clean.reasoningThreads,
          evidenceItems: clean.evidenceItems,
          changeLog: clean.changeLog,
          overviewReport: clean.overviewReport,
          globalReview: clean.globalReview,
          contentClusters: clean.contentClusters,
          nebulaMode: clean.nebulaMode,
          focusSessions: clean.focusSessions || [],
          workspace: 'graph',
          pathFinderActive: false,
          pathSourceId: null,
          pathTargetId: null,
          pathHighlightNodeIds: new Set(),
          pathHighlightLinkIds: new Set(),
        });
      },

      importProjectById: async (id) => {
        get().pushHistory();
        const project = await loadProject(id);
        if (!project) return;

        const clean = sanitizeProject(project);
        const { nodes: existingNodes, links: existingLinks } = get();
        const existingIds = new Set(existingNodes.map((n) => n.id));

        // Remap imported node ids to avoid collisions
        const idMap = new Map<string, string>();
        const importedNodes = clean.nodes.map((n) => {
          const newId = existingIds.has(n.id) ? generateId('node') : n.id;
          idMap.set(n.id, newId);
          existingIds.add(newId);
          return { ...n, id: newId };
        });

        const importedLinks = clean.links
          .map((l) => ({
            ...l,
            source: idMap.get(l.source as string) || (l.source as string),
            target: idMap.get(l.target as string) || (l.target as string),
          }))
          .filter((l) => l.source && l.target && l.source !== l.target);

        const { executionTasks: existingTasks } = get();
        const existingTaskIds = new Set(existingTasks.map((t) => t.id));
        const taskIdMap = new Map<string, string>();
        const importedTasks = (clean.executionTasks || []).map((t) => {
          const newId = existingTaskIds.has(t.id) ? generateId('task') : t.id;
          taskIdMap.set(t.id, newId);
          existingTaskIds.add(newId);
          return {
            ...t,
            id: newId,
            nodeId: t.nodeId ? idMap.get(t.nodeId) || t.nodeId : undefined,
            dependsOn: (t.dependsOn || [])
              .map((depId) => taskIdMap.get(depId) || depId)
              .filter((depId) => existingTaskIds.has(depId)),
          };
        });

        set({
          nodes: [...existingNodes, ...importedNodes],
          links: [...existingLinks, ...importedLinks],
          selectedNodeId: null,
          multiSelectedIds: new Set(),
          highlightedNodeIds: new Set(),
          currentViewNodeId: null,
          viewStack: [],
          stickyNotes: [],
          timelineEvents: [],
          executionTasks: [...existingTasks, ...importedTasks],
          viewMode: 'normal',
          reasoningThreads: clean.reasoningThreads,
          evidenceItems: clean.evidenceItems,
          changeLog: clean.changeLog,
          overviewReport: clean.overviewReport,
          globalReview: clean.globalReview,
          contentClusters: clean.contentClusters,
          nebulaMode: clean.nebulaMode,
          focusSessions: clean.focusSessions || [],
          workspace: 'graph',
          pathFinderActive: false,
          pathSourceId: null,
          pathTargetId: null,
          pathHighlightNodeIds: new Set(),
          pathHighlightLinkIds: new Set(),
        });
      },

      saveCurrentProject: async (name) => {
        const { nodes, links, currentProjectId, reasoningThreads, evidenceItems, executionTasks, changeLog, overviewReport, globalReview, contentClusters, nebulaMode, focusSessions } = get();
        const id = await saveProject(
          name,
          nodes,
          links,
          { reasoningThreads, evidenceItems, executionTasks, changeLog, overviewReport, globalReview, contentClusters, nebulaMode, focusSessions },
          currentProjectId
        );
        set({ currentProjectId: id });
        return id;
      },

      loadProjectById: async (id) => {
        get().pushHistory();
        const project = await loadProject(id);
        if (project) {
          set({
            nodes: project.nodes,
            links: project.links,
            selectedNodeId: null,
            multiSelectedIds: new Set(),
            highlightedNodeIds: new Set(),
            currentProjectId: id,
            currentViewNodeId: null,
            viewStack: [],
            timelineEvents: [],
            executionTasks: project.executionTasks || [],
            viewMode: 'normal',
            reasoningThreads: project.reasoningThreads || [],
            evidenceItems: project.evidenceItems || [],
            changeLog: project.changeLog || [],
            overviewReport: project.overviewReport || '',
            globalReview: project.globalReview || null,
            contentClusters: project.contentClusters || [],
            nebulaMode: project.nebulaMode || false,
            focusSessions: project.focusSessions || [],
            stickyNotes: [],
            workspace: 'graph',
            pathFinderActive: false,
            pathSourceId: null,
            pathTargetId: null,
            pathHighlightNodeIds: new Set(),
            pathHighlightLinkIds: new Set(),
          });
        }
      },

      newProject: () => {
        get().pushHistory();
        set({
          nodes: [],
          links: [],
          selectedNodeId: null,
          multiSelectedIds: new Set(),
          highlightedNodeIds: new Set(),
          changeLog: [],
          overviewReport: '',
          globalReview: null,
          contentClusters: [],
          nebulaMode: false,
          currentProjectId: null,
          currentViewNodeId: null,
          viewStack: [],
          stickyNotes: [],
          timelineEvents: [],
          executionTasks: [],
          viewMode: 'normal',
          reasoningThreads: [],
          evidenceItems: [],
          focusSessions: [],
          workspace: 'graph',
          pathFinderActive: false,
          pathSourceId: null,
          pathTargetId: null,
          pathHighlightNodeIds: new Set(),
          pathHighlightLinkIds: new Set(),
          trainingSession: {
            id: generateId('ts'),
            startedAt: Date.now(),
            totalAiInteractions: 0,
            selfSummaries: 0,
            manualNodes: 0,
            minutesRead: 0,
          },
        });
      },

      undo: () => {
        set((state) => {
          if (state.history.length === 0) return state;
          const previous = state.history[state.history.length - 1];
          return {
            nodes: previous.nodes,
            links: previous.links,
            selectedNodeId: null,
            multiSelectedIds: new Set(),
            highlightedNodeIds: new Set(),
            currentViewNodeId: null,
            viewStack: [],
            history: state.history.slice(0, -1),
          };
        });
      },
    }),
    {
      name: 'ai-knowledge-graph-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        nodes: state.nodes,
        links: state.links,
        selectedNodeId: state.selectedNodeId,
        changeLog: state.changeLog,
        cognitiveTraining: state.cognitiveTraining,
        trainingSession: state.trainingSession,
        customAgentPrompt: state.customAgentPrompt,
        currentProjectId: state.currentProjectId,
        currentViewNodeId: state.currentViewNodeId,
        viewStack: state.viewStack,
        timelineEvents: state.timelineEvents,
        executionTasks: state.executionTasks,
        viewMode: state.viewMode,
        reasoningThreads: state.reasoningThreads,
        evidenceItems: state.evidenceItems,
        overviewReport: state.overviewReport,
        globalReview: state.globalReview,
        contentClusters: state.contentClusters,
        nebulaMode: state.nebulaMode,
        focusSessions: state.focusSessions,
        llmProvider: state.llmProvider,
        llmApiKey: state.llmApiKey,
        llmBaseUrl: state.llmBaseUrl,
        llmModel: state.llmModel,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.setHydrated(true);

        // Migrate old nodes that lack contentItems or other new fields
        const nodes = (state.nodes || []).filter((n: any) => n && typeof n === 'object');
        let changed = false;
        const migratedNodes = nodes.map((n: any) => {
          const needsMigration = !Array.isArray(n.contentItems) || !Array.isArray(n.attachments) || !n.metadata;
          if (needsMigration) changed = true;
          return {
            ...n,
            contentItems: Array.isArray(n.contentItems) ? n.contentItems : [],
            attachments: Array.isArray(n.attachments) ? n.attachments : [],
            metadata: {
              ...(n.metadata || {}),
              tags: Array.isArray(n.metadata?.tags) ? n.metadata.tags : [],
            },
          };
        });
        if (changed) {
          state.importProject({
            id: state.currentProjectId || generateId('project'),
            name: '迁移项目',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            nodes: migratedNodes,
            links: state.links || [],
          });
        }

        // Migrate legacy TimelineEvent to ExecutionTask
        const legacyEvents = (state.timelineEvents || []) as any[];
        if (legacyEvents.length > 0 && (state.executionTasks || []).length === 0) {
          const migratedTasks: ExecutionTask[] = legacyEvents.map((e) => ({
            id: e.id || generateId('task'),
            title: e.title || '未命名任务',
            description: e.description,
            startDate: e.date || new Date().toISOString(),
            endDate: undefined,
            importance: 0.5,
            urgency: 0.5,
            customMetrics: {},
            nodeId: e.nodeId,
            status: 'todo',
            createdAt: e.createdAt || Date.now(),
            updatedAt: e.updatedAt || Date.now(),
          }));
          state.executionTasks = [...(state.executionTasks || []), ...migratedTasks];
          state.timelineEvents = [];
        }

        // Sanitize corrupted persisted data (GBK mojibake, null entries, missing arrays)
        const sanitized = sanitizeProject({
          id: state.currentProjectId || generateId('project'),
          name: '自动保存项目',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          nodes: state.nodes || [],
          links: state.links || [],
          reasoningThreads: state.reasoningThreads,
          evidenceItems: state.evidenceItems,
          executionTasks: state.executionTasks,
          changeLog: state.changeLog,
          overviewReport: state.overviewReport,
          globalReview: state.globalReview,
          contentClusters: state.contentClusters,
          nebulaMode: state.nebulaMode,
        });
        state.nodes = sanitized.nodes;
        state.links = sanitized.links;
        state.changeLog = sanitized.changeLog || [];
        state.overviewReport = sanitized.overviewReport || '';
        state.globalReview = sanitized.globalReview || null;
        state.contentClusters = sanitized.contentClusters || [];
        state.nebulaMode = sanitized.nebulaMode || false;
      },
    }
  )
);
