import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  Connection,
  Edge,
  Node,
  MarkerType,
  Position,
  ReactFlowInstance,
  Handle,
} from "reactflow";
import "reactflow/dist/style.css";
import { Plus, MoreVertical, X, ArrowLeft, ChevronDown, ChevronUp, Upload, AlertCircle, CheckCircle2, Loader2, Copy, Info, FileText, Lock, AlertTriangle, Zap, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import FancyAvatar from "@/components/ui/fancy-avatar";
import Logo from "@/components/Logo";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import RichTextEditor from "@/components/ui/rich-text-editor-lazy";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { parseMarkdownRCDO, validateParsedRCDO } from "@/utils/markdownRCDOParser";
import { importRCDOToDatabase } from "@/utils/importRCDOToDatabase";
import { formatRCDOForCanvas } from "@/utils/formatRCDOForCanvas";
import { useToast } from "@/hooks/use-toast";
import { UserProfileHeader } from "@/components/ui/user-profile-header";
import { MultiSelectParticipants } from "@/components/ui/multi-select-participants";
import { Switch } from "@/components/ui/switch";
import { SIPanelContent } from "@/components/rcdo/SIPanelContent";
import { CheckinFeedSidebar } from "@/components/rcdo/CheckinFeedSidebar";
import { isFeatureEnabled } from "@/lib/featureFlags";

// Types
type NodeKind = "strategy" | "do" | "sai" | "rally";

type NodeData = {
  title: string;
  status?: "draft" | "final";
  ownerId?: string; // owner user ID for DOs
  hypothesis?: string; // DO hypothesis (rich text)
  primarySuccessMetric?: string; // DO primary success metric
  parentDoId?: string; // only for legacy SI nodes (no longer used)
  bgColor?: string; // node background color
  size?: { w: number; h: number }; // optional fixed size per node
  // DO title candidates (for draft mode)
  titleCandidates?: string[];
  // SIs embedded in DO
  saiItems?: Array<{
    id: string;
    title: string;
    ownerId?: string; // references profiles.id
    participantIds?: string[]; // references profiles.id
    // legacy fields (rendered if ownerId missing)
    ownerName?: string;
    ownerAvatarUrl?: string;
    metric?: string;
    description?: string;
    dbId?: string; // database SI ID for fetching locked status and check-ins
  }>;
  // Rallying cry specific
  rallyCandidates?: string[];
  rallySelectedIndex?: number; // 0 is top/most likely
  rallyFinalized?: boolean;
};

const ROOT_ID = "rally-1";

function makeInitialNodes(): Node<NodeData>[] {
  // Start with rallying cry at top center; place DOs using non-overlapping helper
  const baseY = 80;
  const baseX = 400;
  const startY = baseY + 160;
  const nodes: Node<NodeData>[] = [
    {
      id: ROOT_ID,
      type: "rally",
      position: { x: baseX, y: baseY },
      data: {
        title: "",
        rallyCandidates: [
          "Draft your rallying cry",
          "Keep it short and inspiring",
          "Make it testable",
        ],
        rallySelectedIndex: 0,
        rallyFinalized: false,
        size: { w: 280, h: 100 },
      },
    },
  ];

  const initialDOs = [
    { id: "do-1", title: "DO 1" },
    { id: "do-2", title: "DO 2" },
    { id: "do-3", title: "DO 3" },
    { id: "do-4", title: "DO 4" },
  ];

  // Place 4 DOs centered under the Rallying Cry in a single row
  const gapX = 300; // horizontal spacing between DOs
  const offsets = [-1.5 * gapX, -0.5 * gapX, 0.5 * gapX, 1.5 * gapX];
  initialDOs.forEach((item, idx) => {
    const preferredX = baseX + offsets[idx];
    const pos = findNonOverlappingPosition(nodes, "do", preferredX, startY);
    nodes.push({
      id: item.id,
      type: "do",
      position: pos,
      data: { title: item.title, status: "draft", size: { w: 260, h: 110 } },
    });
  });

  return nodes;
}

function makeInitialEdges(): Edge[] {
  return [
    { id: "e-s-d1", source: ROOT_ID, target: "do-1", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e-s-d2", source: ROOT_ID, target: "do-2", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e-s-d3", source: ROOT_ID, target: "do-3", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } },
    { id: "e-s-d4", source: ROOT_ID, target: "do-4", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } },
  ];
}

// Simple node components
function StrategyNode({ data }: { data: NodeData }) {
  return (
    <div
      className="rounded-lg border shadow p-3 min-w-[160px] flex flex-col"
      style={{ backgroundColor: data.bgColor || "#ffffff", width: data.size?.w, height: data.size?.h }}
    >
      <div className="text-xs font-semibold break-words leading-tight">{data.title || "Strategy"}</div>
    </div>
  );
}

import type { NodeProps } from "reactflow";

// Create a factory function that accepts profilesMap, showProgress, SI progress data, and DO locked status
const createDoNode = (
  profilesMap: Record<string, any>,
  showProgress: boolean,
  siProgressMap: Map<string, { percentToGoal: number | null; isLocked: boolean; sentiment: number | null; latestDate: string | null; createdAt: string | null }>,
  doLockedStatus: Map<string, { locked: boolean; dbId?: string }>
) => {
  return function DoNode({ id, data }: NodeProps<NodeData>) {
    const status = data.status || "draft";
    const items = data.saiItems || [];
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const owner = data.ownerId ? profilesMap[data.ownerId] : undefined;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [data.title]);

  return (
    <div
      className={`rounded-xl border-2 shadow-lg p-4 min-w-[160px] flex flex-col relative overflow-hidden ${
        status === "final" 
          ? "border-slate-500 dark:border-slate-600 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950/30 dark:to-slate-900/30" 
          : "border-slate-400 dark:border-slate-600 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950/20 dark:to-slate-900/20"
      }`}
      style={{ 
        backgroundColor: data.bgColor, 
        width: data.size?.w, 
        minHeight: data.size?.h,
        boxShadow: status === "final" ? "0 4px 20px rgba(100, 116, 139, 0.2)" : "0 4px 20px rgba(100, 116, 139, 0.15)"
      }}
    >
      <Handle type="target" position={Position.Top} />
      {/* Decorative corner accent */}
      <div className={`absolute top-0 right-0 w-20 h-20 ${
        status === "final" ? "bg-slate-500/10" : "bg-slate-500/10"
      } rounded-bl-full`} />
      
      <div className="flex items-start justify-between gap-2 flex-shrink-0 relative z-10">
        <span className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-slate-600 text-white`}>Defining Objective</span>
        <span className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300`}>{status === "final" ? "locked" : "ideating"}</span>
      </div>
      <div className="flex items-start gap-2 mt-3 relative z-10">
        <span className={`inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 text-[10px] flex-shrink-0 mt-0.5 bg-white border-slate-500 dark:bg-slate-900/20 dark:border-slate-400`}>
          {(() => {
            const displayName = owner?.full_name || '';
            const isUnknown = !owner || !displayName || displayName.trim().toLowerCase() === 'unknown';
            if (isUnknown) {
              return <span className="text-xs font-semibold text-muted-foreground">?</span>;
            }
            return (
              <FancyAvatar 
                name={owner.avatar_name || displayName} 
                displayName={displayName}
                avatarUrl={owner.avatar_url}
                size="sm" 
              />
            );
          })()}
        </span>
        <textarea
          ref={textareaRef}
          className={`flex-1 w-full bg-transparent outline-none text-sm font-bold resize-none overflow-hidden leading-tight text-slate-900 dark:text-slate-100`}
          value={data.title || ""}
          placeholder="Name this DO"
          onChange={(e) => {
            window.dispatchEvent(new CustomEvent("rcdo:update-node", { 
              detail: { nodeId: id, updates: { title: e.target.value } } 
            }));
          }}
          onInput={(e) => {
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
          }}
          rows={2}
          style={{ 
            wordBreak: 'break-word',
            overflowWrap: 'break-word'
          }}
        />
      </div>
      {items.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 flex-shrink-0 relative z-10">
          {items.map((it) => (
            <button
              key={it.id}
              className={`group relative flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium w-full transition-all hover:scale-[1.02]
                ${(() => {
                  const siProg = it.dbId ? siProgressMap.get(it.dbId) : undefined;
                  if (siProg && siProg.sentiment !== null && siProg.sentiment !== undefined) {
                    // On-track (>=1): green border + light green background
                    if (siProg.sentiment >= 1) {
                      return 'border-green-500 hover:border-green-600 dark:border-green-600 bg-green-50 dark:bg-green-950/20';
                    }
                    // Otherwise: red border + light red background
                    return 'border-red-500 hover:border-red-600 dark:border-red-600 bg-red-50 dark:bg-red-950/20';
                  }
                  // Default: slate border + neutral background
                  return 'border-slate-300 hover:border-slate-500 dark:border-slate-700 bg-white/80 dark:bg-slate-900/10';
                })()}
                dark:hover:bg-slate-900/20`}
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("rcdo:open-si", { detail: { doId: id, siId: it.id } }));
              }}
            >
              <span className={`inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border text-[10px] flex-shrink-0 bg-slate-50 border-slate-400 dark:bg-slate-900/30 dark:border-slate-600`}>
                {(() => {
                  const prof = it.ownerId ? profilesMap[it.ownerId] : undefined;
                  const displayName = prof?.full_name || '';
                  const isUnknown = !prof || !displayName || displayName.trim().toLowerCase() === 'unknown';
                  if (!isUnknown && (prof?.avatar_name || prof?.full_name)) {
                    return <FancyAvatar name={prof.avatar_name || displayName} displayName={displayName} avatarUrl={prof.avatar_url} size="sm" />;
                  }
                  return <span className="text-[10px] leading-none font-semibold">?</span>;
                })()}
              </span>
              <span className={`text-[11px] leading-tight break-words text-left flex-1 text-slate-900 dark:text-slate-100`}>{it.title || "Untitled SI"}</span>
              {/* Progress indicator - show bar when > 0; show "0%" text when exactly 0 */}
              {showProgress && (() => {
                const isDOLocked = doLockedStatus.get(id)?.locked ?? false;
                const siProgress = it.dbId ? siProgressMap.get(it.dbId) : null;
                const percentToGoal = siProgress?.percentToGoal ?? null;
                const isSILocked = siProgress?.isLocked ?? false;

                // Iconography for recency/staleness
                const latestDate = siProgress?.latestDate ? new Date(siProgress.latestDate) : null;
                const createdAt = siProgress?.createdAt ? new Date(siProgress.createdAt) : null;
                const now = new Date();
                const daysSinceUpdate = latestDate ? (now.getTime() - latestDate.getTime()) / (1000*60*60*24) : Infinity;
                const daysSinceCreated = createdAt ? (now.getTime() - createdAt.getTime()) / (1000*60*60*24) : Infinity;
                const showLightning = latestDate && daysSinceUpdate < 3;
                const showWarning = daysSinceUpdate > 21 && daysSinceCreated > 21;

                // Only show something when DO and SI are locked and the SI has a percent value (including 0)
                const shouldShow = isDOLocked && isSILocked && percentToGoal !== null && percentToGoal !== undefined;
                if (!shouldShow) {
                  // Still render iconography even if progress bar hidden
                  return (
                    <>
                      {(showLightning || showWarning) && (
                        <div className="absolute -top-2 -right-2 pointer-events-none z-10">
                          {showLightning ? (
                            <div className="h-6 w-6 rounded-full bg-yellow-300 border-2 border-black flex items-center justify-center shadow">
                              <Zap className="h-3.5 w-3.5 text-black" />
                            </div>
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-orange-600 flex items-center justify-center shadow ring-2 ring-white">
                              <AlertTriangle className="h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                }

                // If the percent is 0, render a small "0%" label instead of a bar
                if (percentToGoal <= 0) {
                  return <span className="text-[10px] text-muted-foreground">0%</span>;
                }
                
                // Otherwise render the progress bar
                return (
                  <>
                    {(showLightning || showWarning) && (
                      <div className="absolute -top-2 -right-2 pointer-events-none z-10">
                        {showLightning ? (
                          <div className="h-6 w-6 rounded-full bg-yellow-300 border-2 border-black flex items-center justify-center shadow">
                            <Zap className="h-3.5 w-3.5 text-black" />
                          </div>
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-orange-600 flex items-center justify-center shadow ring-2 ring-white">
                            <AlertTriangle className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted overflow-hidden rounded-b-lg">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
                        style={{
                          width: `${percentToGoal}%`,
                          marginLeft: 'auto', // Start from right, fill leftward
                        }}
                      />
                    </div>
                  </>
                );
              })()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  };
};

function SaiNode({ id, data }: NodeProps<NodeData>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [data.title]);

  return (
    <div
      className="rounded-md border shadow-sm px-2 py-1.5 min-w-[140px] flex flex-col"
      style={{ backgroundColor: data.bgColor || "#ffffff", width: data.size?.w, height: data.size?.h }}
    >
      <textarea
        ref={textareaRef}
        className="w-full bg-transparent outline-none text-xs resize-none overflow-hidden leading-tight"
        defaultValue={data.title}
        placeholder="SI idea"
        onBlur={(e) => {
          window.dispatchEvent(new CustomEvent("rcdo:update-node", { 
            detail: { nodeId: id, updates: { title: e.target.value } } 
          }));
        }}
        onInput={(e) => {
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
        }}
        rows={1}
        style={{ 
          wordBreak: 'break-word',
          overflowWrap: 'break-word'
        }}
      />
    </div>
  );
}

function RallyNode({ data }: { data: NodeData }) {
  const finalized = !!data.rallyFinalized;
  const bg = data.bgColor;
  const headline = data.rallyCandidates?.[0] || data.title || "Double‑click to edit candidates";
  return (
    <div 
      className={`rounded-xl border-2 shadow-lg p-4 min-w-[220px] flex flex-col relative ${
        finalized
          ? "border-purple-500 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30"
          : "border-amber-400 dark:border-amber-500 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20"
      }`}
      style={{ 
        backgroundColor: bg, 
        width: data.size?.w, 
        minHeight: data.size?.h,
        boxShadow: finalized ? "0 6px 24px rgba(168, 85, 247, 0.2)" : "0 6px 24px rgba(251, 191, 36, 0.2)",
        overflow: 'visible'
      }}
    >
      <Handle type="source" position={Position.Bottom} />
      {/* Decorative corner accent */}
      <div className={`absolute top-0 right-0 w-24 h-24 ${
        finalized ? "bg-purple-500/10" : "bg-amber-500/10"
      } rounded-bl-full`} />
      
      {/* Decorative top accent */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${
        finalized 
          ? "bg-gradient-to-r from-purple-500 via-violet-500 to-purple-500" 
          : "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500"
      }`} />
      
      <div className="flex items-start justify-between gap-2 flex-shrink-0 relative z-10">
        <span className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap ${
          finalized
            ? "bg-purple-500 text-white"
            : "bg-amber-500 text-white"
        }`}>Rallying Cry</span>
        <span className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap ${
          finalized 
            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300" 
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
        }`}>
          {finalized ? "locked" : "ideating"}
        </span>
      </div>
      <div className={`mt-3 text-base font-bold leading-snug break-words whitespace-normal relative z-10 ${
        finalized
          ? "text-purple-900 dark:text-purple-100"
          : "text-amber-900 dark:text-amber-100"
      }`}
      style={{
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical' as any,
      }}>
        {headline}
      </div>
    </div>
  );
}

// nodeTypes will be created inside the component with access to profilesMap

// ---- Layout helpers to avoid overlapping nodes ----
const DEFAULT_NODE_DIMENSIONS: Record<NodeKind, { w: number; h: number }> = {
  strategy: { w: 180, h: 64 },
  do: { w: 260, h: 110 },
  sai: { w: 160, h: 48 },
  rally: { w: 280, h: 100 },
};

function rectForNode(n: Node<NodeData>) {
  const data = (n.data as NodeData) || {};
  const kind = (n.type as NodeKind) || "do";
  const w = (n as any).width || data.size?.w || DEFAULT_NODE_DIMENSIONS[kind].w;
  const h = (n as any).height || data.size?.h || DEFAULT_NODE_DIMENSIONS[kind].h;
  return { x: n.position.x, y: n.position.y, w, h };
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findNonOverlappingPosition(existing: Node<NodeData>[], type: NodeKind, startX: number, startY: number) {
  const stepX = DEFAULT_NODE_DIMENSIONS[type].w + 60; // include margin
  const stepY = DEFAULT_NODE_DIMENSIONS[type].h + 60;
  let x = startX;
  let y = startY;
  let attempts = 0;
  while (attempts < 500) {
    const testRect = { x, y, w: DEFAULT_NODE_DIMENSIONS[type].w, h: DEFAULT_NODE_DIMENSIONS[type].h };
    const collides = existing.some((n) => rectsOverlap(testRect, rectForNode(n)));
    if (!collides) return { x, y };
    x += stepX;
    if (x > startX + stepX * 6) {
      x = startX;
      y += stepY;
    }
    attempts++;
  }
  return { x: startX, y: startY };
}

export default function StrategyCanvasPage() {
  // Realtime doc and provider (optional if server not running)
  const ydocRef = useRef<Y.Doc>();
  
  // Guard to avoid repeated hydration requests
  const hydrationGuardRef = useRef<{ inFlight: boolean; cycle: string | null; sig: string | null }>({ inFlight: false, cycle: null, sig: null });
  const providerRef = useRef<WebsocketProvider | null>(null);
  const updatingFromRemoteNodes = useRef(false);
  const updatingFromRemoteEdges = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  // React Flow instance to control viewport
  const rfInstanceRef = useRef<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);
  const didInitialFitRef = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  
  // Get cycle ID from URL query parameter
  const searchParams = new URLSearchParams(location.search);
  const cycleId = searchParams.get('cycle');
  
  // If no cycle ID, redirect back to strategies list
  useEffect(() => {
    if (!cycleId) {
      navigate('/dashboard/rcdo');
    }
  }, [cycleId, navigate]);

  const collabUrl = import.meta.env.VITE_COLLAB_WS_URL || "ws://localhost:1234";
  const roomName = cycleId ? `strategy-canvas-${cycleId}` : "strategy-canvas-default";

  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(makeInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(makeInitialEdges());
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const [focusedSI, setFocusedSI] = useState<null | { doId: string; siId: string }>(null);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
  const [profiles, setProfiles] = useState<Tables<'profiles'>[]>([]);
  const profilesMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p])), [profiles]);
  const progressFeatureOn = isFeatureEnabled('siProgress');
  const [showProgress, setShowProgress] = useState(progressFeatureOn);
  const [doLockedStatus, setDoLockedStatus] = useState<Map<string, { locked: boolean; dbId?: string }>>(new Map());
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);
  
  // Map to store SI progress data (dbId -> { percentToGoal, isLocked })
  const [siProgressMap, setSiProgressMap] = useState<Map<string, { percentToGoal: number | null; isLocked: boolean; sentiment: number | null; latestDate: string | null; createdAt: string | null }>>(new Map());
  
  // Filter nodes and edges based on "View As..." selection
  const filteredNodes = useMemo(() => {
    if (!viewAsUserId) return nodes;
    
    // Always keep rally cry
    const rallyNode = nodes.find(n => n.type === 'rally');
    if (!rallyNode) return nodes;
    
    const filtered: Node<NodeData>[] = [rallyNode];
    
    // Filter DOs: keep only if they have at least one SI where the user is owner or contributor
    const doNodes = nodes.filter(n => n.type === 'do');
    for (const doNode of doNodes) {
      const saiItems = (doNode.data.saiItems || []) as any[];
      
      // Check if any SI in this DO has the user as owner or contributor
      const hasRelevantSI = saiItems.some((si: any) => {
        const isOwner = si.ownerId === viewAsUserId;
        const isContributor = Array.isArray(si.participantIds) && si.participantIds.includes(viewAsUserId);
        return isOwner || isContributor;
      });
      
      if (hasRelevantSI) {
        // Filter SIs within this DO: keep only where user is owner or contributor
        const filteredSaiItems = saiItems.filter((si: any) => {
          const isOwner = si.ownerId === viewAsUserId;
          const isContributor = Array.isArray(si.participantIds) && si.participantIds.includes(viewAsUserId);
          return isOwner || isContributor;
        });
        
        filtered.push({
          ...doNode,
          data: {
            ...doNode.data,
            saiItems: filteredSaiItems,
          },
        });
      }
    }
    
    return filtered;
  }, [nodes, viewAsUserId]);
  
  // Filter edges to only connect visible nodes
  const filteredEdges = useMemo(() => {
    if (!viewAsUserId) return edges;
    
    const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
    return edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
  }, [edges, filteredNodes, viewAsUserId]);
  
  // Extract visible DO and SI database IDs for check-in filtering
  const visibleParentIds = useMemo(() => {
    if (!viewAsUserId) return { doIds: [], siIds: [] };
    
    const doIds: string[] = [];
    const siIds: string[] = [];
    
    filteredNodes.forEach((node) => {
      if (node.type === 'do') {
        const doStatus = doLockedStatus.get(node.id);
        if (doStatus?.dbId) {
          doIds.push(doStatus.dbId);
        }
        
        // Collect SI IDs from this DO
        const saiItems = (node.data.saiItems || []) as any[];
        saiItems.forEach((si: any) => {
          if (si.dbId) {
            siIds.push(si.dbId);
          }
        });
      }
    });
    
    return { doIds, siIds };
  }, [filteredNodes, viewAsUserId, doLockedStatus]);
  
  // Create node types with access to profilesMap, showProgress, SI progress data, and DO locked status
  const nodeTypes = useMemo(() => ({
    strategy: StrategyNode,
    do: createDoNode(profilesMap, showProgress, siProgressMap, doLockedStatus),
    sai: SaiNode,
    rally: RallyNode,
  }), [profilesMap, showProgress, siProgressMap, doLockedStatus]);
  
  // Import state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [importProgress, setImportProgress] = useState<Array<{ label: string; status: 'pending' | 'loading' | 'success' | 'error' }>>([]);
  const [importMode, setImportMode] = useState<'file' | 'paste'>('paste');
  const [pastedMarkdown, setPastedMarkdown] = useState('');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // One-click import + lock ("DO")
  const oneClickFileInputRef = useRef<HTMLInputElement>(null);
  const [oneClickMode, setOneClickMode] = useState(false);

  // Header state (logo/tabs/avatar)
  const activeTab = location.pathname.includes('/dashboard/rcdo') ? 'rcdo' : 'main';
  const handleTabChange = (value: string) => {
    if (value === 'main') navigate('/dashboard/main');
    else if (value === 'rcdo') navigate('/dashboard/rcdo');
    else if (value === 'checkins') navigate('/dashboard/checkins');
  };

  // Run a one-time de-overlap pass to ensure default layout has no collisions
  const didAutoLayoutRef = useRef(false);
  useEffect(() => {
    if (didAutoLayoutRef.current) return;
    if (!nodes || nodes.length === 0) return;
    const laidOut: Node<NodeData>[] = [];
    for (const n of nodes) {
      if (n.type === "do") {
        const pos = findNonOverlappingPosition(laidOut, "do", n.position.x, n.position.y);
        laidOut.push({ ...n, position: pos, data: { ...n.data, size: n.data.size || { w: 260, h: 110 } } });
      } else {
        laidOut.push(n);
      }
    }
    const changed = laidOut.some((n, i) => n.position.x !== nodes[i].position.x || n.position.y !== nodes[i].position.y);
    if (changed) setNodes(laidOut);
    didAutoLayoutRef.current = true;
  }, [nodes, setNodes]);

  // Init Yjs and bind basic sync for nodes/edges
  useEffect(() => {
    if (!cycleId) return;
    
    const doc = new Y.Doc();
    ydocRef.current = doc;
    let provider: WebsocketProvider | null = null;
    try {
      provider = new WebsocketProvider(collabUrl, roomName, doc);
      providerRef.current = provider;
    } catch (_) {
      // no-op (offline/local only)
    }

    const yNodes = doc.getArray<any>("nodes");
    const yEdges = doc.getArray<any>("edges");

    // First client seeds the arrays
    if (yNodes.length === 0) yNodes.push(makeInitialNodes());
    if (yEdges.length === 0) yEdges.push(makeInitialEdges());

    const nodesObserver = () => {
      updatingFromRemoteNodes.current = true;
      setNodes(yNodes.toArray().flat());
    };
    const edgesObserver = () => {
      updatingFromRemoteEdges.current = true;
      setEdges(yEdges.toArray().flat());
    };

    yNodes.observe(nodesObserver);
    yEdges.observe(edgesObserver);

    // Seed local from Yjs
    updatingFromRemoteNodes.current = true;
    updatingFromRemoteEdges.current = true;
    setNodes(yNodes.toArray().flat());
    setEdges(yEdges.toArray().flat());

    return () => {
      yNodes.unobserve(nodesObserver);
      yEdges.unobserve(edgesObserver);
      provider?.destroy();
      doc.destroy();
    };
  }, [collabUrl, roomName, cycleId]);

  // Load initial canvas from Supabase (if present). If missing, fall back to building from DB RCDO tables.
  useEffect(() => {
    if (!cycleId) return;
    
    (async () => {
      // 1) Try loading a saved canvas snapshot for this cycle/room
      const { data, error } = await supabase
        .from('rc_canvas_states')
        .select('nodes, edges')
        .eq('room', roomName)
        .maybeSingle();

      // Heuristic: detect the built-in template so we can ignore it and rebuild from DB
      let snapshotLooksLikeTemplate = false;
      if (!error && data && Array.isArray(data.nodes)) {
        try {
          const nodeList = (data.nodes as any[]);
          const rally = nodeList.find((n: any) => n?.type === 'rally');
          const doTitles = nodeList.filter((n: any) => n?.type === 'do').map((n: any) => String(n?.data?.title || ''));
          const hasDraftRally = !!(rally && Array.isArray(rally.data?.rallyCandidates) && rally.data?.rallyCandidates?.[0] === 'Draft your rallying cry');
          const hasDefaultDOs = doTitles.length === 4 && doTitles.every((t: string, i: number) => t === `DO ${i+1}`);
          snapshotLooksLikeTemplate = hasDraftRally && hasDefaultDOs;
        } catch { /* ignore */ }
      }

      if (!error && data && Array.isArray(data.nodes) && Array.isArray(data.edges) && (data.nodes as any[]).length > 0 && !snapshotLooksLikeTemplate) {
        console.log('[Canvas] Loaded saved snapshot for', roomName, { nodeCount: (data.nodes as any[]).length, edgeCount: (data.edges as any[]).length });
        setNodes(data.nodes as any);
        setEdges(data.edges as any);
        return;
      } else if (snapshotLooksLikeTemplate) {
        console.log('[Canvas] Ignoring template snapshot; rebuilding from DB…');
      }

      // 2) Fallback: build canvas from the canonical RCDO tables so users still see their data
      try {
        const { data: rc, error: rcErr } = await supabase
          .from('rc_rallying_cries')
          .select('id, title')
          .eq('cycle_id', cycleId)
          .maybeSingle();

        if (rcErr) console.warn('[Canvas] RC query error:', rcErr);
        if (!rc) { console.log('[Canvas] No rallying cry found for cycle', cycleId); return; }

        const { data: dos, error: dosErr } = await supabase
          .from('rc_defining_objectives')
          .select('id, title, hypothesis, owner_user_id, status, locked_at, display_order')
          .eq('rallying_cry_id', rc.id)
          .order('display_order', { ascending: true });
        if (dosErr) console.warn('[Canvas] DO query error:', dosErr);

        const doDbIds = (dos || []).map(d => d.id);
        console.log('[Canvas] Fallback found', { doCount: (dos || []).length });

        // If there are no DOs, nothing to render beyond the RC
        const { data: sis, error: siErr } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, owner_user_id, participant_user_ids, description, defining_objective_id, status, locked_at, created_at')
          .in('defining_objective_id', doDbIds.length ? doDbIds : ['00000000-0000-0000-0000-000000000000']);
        if (siErr) console.warn('[Canvas] SI query error:', siErr);
        console.log('[Canvas] Fallback SI count', (sis || []).length);

        // Compute a simple layout identical to the import-based formatter
        const baseX = 400;
        const baseY = 80;
        const startY = baseY + 180;
        const gapX = 320;
        const count = (dos?.length) || 0;
        const totalWidth = (count - 1) * gapX;
        const startX = baseX - totalWidth / 2;

        const builtNodes: any[] = [
          {
            id: ROOT_ID,
            type: 'rally',
            position: { x: baseX, y: baseY },
            data: {
              title: '',
              rallyCandidates: [rc.title],
              rallySelectedIndex: 0,
              rallyFinalized: true,
              size: { w: 280, h: 100 },
            },
          },
        ];
        const builtEdges: any[] = [];

        (dos || []).forEach((d: any, index: number) => {
          const doId = `do-${index + 1}`;
          const posX = startX + index * gapX;
          const relatedSIs = (sis || []).filter((s: any) => s.defining_objective_id === d.id);
          const saiItems = relatedSIs.map((si: any) => ({
            id: `si-${doId}-${String(si.id).slice(0, 6)}`,
            title: si.title,
            ownerId: si.owner_user_id || undefined,
            participantIds: Array.isArray(si.participant_user_ids) ? si.participant_user_ids : undefined,
            description: si.description || '',
            dbId: si.id,
          }));

          builtNodes.push({
            id: doId,
            type: 'do',
            position: { x: posX, y: startY },
            data: {
              title: d.title,
              status: d.status === 'final' ? 'final' : 'draft',
              ownerId: d.owner_user_id || undefined,
              hypothesis: d.hypothesis || '',
              primarySuccessMetric: '',
              saiItems,
              size: { w: 260, h: 110 },
              dbId: d.id,
            },
          });

          builtEdges.push({
            id: `e-rc-${doId}`,
            source: ROOT_ID,
            target: doId,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        });

        if (((dos || []).length) > 0) {
          setNodes(builtNodes);
          setEdges(builtEdges);

          // Populate DO locked status map keyed by canvas DO node id (e.g. 'do-1')
          const doStatusEntries: Array<[string, { locked: boolean; dbId?: string }]> = (dos || []).map((d: any, index: number) => {
            const uiId = `do-${index + 1}`;
            const locked = !!d.locked_at;
            return [uiId, { locked, dbId: d.id }];
          });
          setDoLockedStatus(new Map(doStatusEntries));

          // Populate SI progress map with latest percent_to_goal and SI locked state
          const siIds = (sis || []).map((s: any) => s.id);
          if (siIds.length > 0) {
            const { data: checkins, error: checkinsErr } = await supabase
              .from('rc_checkins')
              .select('parent_id, percent_to_goal, sentiment, date, created_at')
              .eq('parent_type', 'initiative')
              .in('parent_id', siIds)
              .order('date', { ascending: false })
              .order('created_at', { ascending: false });
            if (checkinsErr) {
              console.warn('[Canvas] Checkins query error:', checkinsErr);
            }
            const latestBySi = new Map<string, { percent_to_goal: number | null; sentiment: number | null; date: string | null }>();
            for (const c of (checkins || [])) {
              if (!latestBySi.has(c.parent_id)) {
                latestBySi.set(c.parent_id, { percent_to_goal: c.percent_to_goal ?? null, sentiment: c.sentiment ?? null, date: c.date ?? null });
              }
            }
            const progressEntries: Array<[string, { percentToGoal: number | null; isLocked: boolean; sentiment: number | null; latestDate: string | null; createdAt: string | null }]> = (sis || []).map((si: any) => {
              const latest = latestBySi.get(si.id);
              const pct = latest?.percent_to_goal ?? null;
              const sent = latest?.sentiment ?? null;
              const latestDate = latest?.date ?? null;
              const isLocked = !!si.locked_at;
              const createdAt = si.created_at ?? null;
              return [si.id, { percentToGoal: pct, isLocked, sentiment: sent, latestDate, createdAt }];
            });
            setSiProgressMap(new Map(progressEntries));
          }
        }
      } catch (_e) {
        // ignore; leave template visible
      }
    })();
  }, [cycleId, roomName]);

  // Hydrate progress/locks without mutating the canvas; skip if template snapshot
  useEffect(() => {
    (async () => {
      try {
        if (!cycleId) return;
        if (!nodes || nodes.length === 0) return;

        // Stable signature of canvas DO/SI titles to prevent request storms
        const sig = JSON.stringify(
          nodes
            .filter((n) => n.type === 'do')
            .map((n) => ({
              t: String((n.data as any)?.title || ''),
              s: (((n.data as any)?.saiItems) || []).map((x: any) => String(x?.title || '')),
            }))
        );
        if (hydrationGuardRef.current.inFlight) return;
        if (hydrationGuardRef.current.cycle === cycleId && hydrationGuardRef.current.sig === sig) return;
        hydrationGuardRef.current.inFlight = true;
        hydrationGuardRef.current.cycle = cycleId || null;
        hydrationGuardRef.current.sig = sig;

        // Skip if the snapshot looks like the empty template
        const rallyNode = nodes.find((n) => n.type === 'rally');
        const doTitles = nodes.filter((n) => n.type === 'do').map((n) => String((n.data as any)?.title || ''));
        const looksLikeTemplate = !!rallyNode && Array.isArray((rallyNode.data as any)?.rallyCandidates)
          && ((rallyNode.data as any).rallyCandidates[0] === 'Draft your rallying cry')
          && doTitles.length === 4 && doTitles.every((t, i) => t === `DO ${i+1}`);
        if (looksLikeTemplate) return;

        const doNodes = nodes.filter((n) => n.type === 'do');
        const { data: rc } = await supabase
          .from('rc_rallying_cries')
          .select('id')
          .eq('cycle_id', cycleId)
          .maybeSingle();
        if (!rc?.id) return;

        // Map DO titles -> db rows (no node changes)
        const doTitleList = doNodes.map((n) => String((n.data as any).title || '')).filter(Boolean);
        if (doTitleList.length === 0) return;
        const { data: doRows } = await supabase
          .from('rc_defining_objectives')
          .select('id, title, locked_at')
          .eq('rallying_cry_id', rc.id)
          .in('title', doTitleList);

        const doByTitle = new Map<string, { id: string; locked: boolean }>();
        for (const row of (doRows || [])) doByTitle.set(row.title, { id: row.id, locked: !!row.locked_at });

        // Update lock map
        const doLockEntries: Array<[string, { locked: boolean; dbId?: string }]> = [];
        for (const n of doNodes) {
          const t = String((n.data as any).title || '');
          const match = doByTitle.get(t);
          if (match) doLockEntries.push([n.id, { locked: match.locked, dbId: match.id }]);
        }
        if (doLockEntries.length) setDoLockedStatus(new Map(doLockEntries));

        // SI progress: build (siId by (doId,title)) without mutating nodes
        const doIdByNodeId = new Map<string, string>();
        for (const [nodeId, status] of doLockEntries) { if (status.dbId) doIdByNodeId.set(nodeId, status.dbId); }

        const siTitleRequests: Array<{ doDbId: string; title: string }>= [];
        for (const n of doNodes) {
          const doDbId = doIdByNodeId.get(n.id);
          const items = (((n.data as any).saiItems) || []) as any[];
          if (!doDbId || !items.length) continue;
          for (const s of items) {
            const t = String(s.title || '');
            if (t) siTitleRequests.push({ doDbId, title: t });
          }
        }
        if (!siTitleRequests.length) return;

        const uniqueDoIds = Array.from(new Set(siTitleRequests.map(x => x.doDbId)));
        const uniqueTitles = Array.from(new Set(siTitleRequests.map(x => x.title)));
        const { data: siRows } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, defining_objective_id, locked_at, created_at')
          .in('defining_objective_id', uniqueDoIds)
          .in('title', uniqueTitles);
        const siByKey = new Map<string, { id: string; locked: boolean; createdAt: string | null }>();
        const key = (doId: string, t: string) => `${doId}:::${t}`;
        for (const r of (siRows || [])) siByKey.set(key(r.defining_objective_id, r.title), { id: r.id, locked: !!r.locked_at, createdAt: r.created_at ?? null });

        const siIds = Array.from(siByKey.values()).map((v) => v.id);
        if (!siIds.length) return;

        const { data: checkins } = await supabase
          .from('rc_checkins')
          .select('parent_id, percent_to_goal, sentiment, date, created_at')
          .eq('parent_type', 'initiative')
          .in('parent_id', siIds)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });
        const latestBySi = new Map<string, { percent_to_goal: number | null; sentiment: number | null; date: string | null }>();
        for (const c of (checkins || [])) if (!latestBySi.has(c.parent_id)) latestBySi.set(c.parent_id, { percent_to_goal: c.percent_to_goal ?? null, sentiment: c.sentiment ?? null, date: c.date ?? null });

        const progressEntries: Array<[string, { percentToGoal: number | null; isLocked: boolean; sentiment: number | null; latestDate: string | null; createdAt: string | null }]> = [];
        for (const v of siByKey.values()) {
          const latest = latestBySi.get(v.id);
          const pct = latest?.percent_to_goal ?? null;
          const sent = latest?.sentiment ?? null;
          const latestDate = latest?.date ?? null;
          progressEntries.push([v.id, { percentToGoal: pct, isLocked: v.locked, sentiment: sent, latestDate, createdAt: v.createdAt ?? null }]);
        }
        if (progressEntries.length) setSiProgressMap(new Map(progressEntries));
      } catch (_e) {
        // no-op
      } finally {
        hydrationGuardRef.current.inFlight = false;
      }
    })();
  }, [nodes, cycleId]);

  // Load a baseline set of profiles (subject to RLS)
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, avatar_name, avatar_url, first_name, email')
      .then(({ data, error }) => {
        if (!error && data) setProfiles(data as any);
      });
  }, []);

  // Ensure we also fetch any missing owners referenced by DO/SI items.
  // This helps when broad profile reads are restricted by RLS policies: we fetch just the needed IDs.
  useEffect(() => {
    if (!nodes || nodes.length === 0) return;

    // Collect all profile IDs referenced by the canvas (DO owners and SI owners/participants)
    const needed = new Set<string>();
    for (const n of nodes) {
      const d: any = n.data || {};
      if (d.ownerId) needed.add(String(d.ownerId));
      const items: any[] = Array.isArray(d.saiItems) ? d.saiItems : [];
      for (const s of items) {
        if (s?.ownerId) needed.add(String(s.ownerId));
        if (Array.isArray(s?.participantIds)) for (const pid of s.participantIds) needed.add(String(pid));
      }
    }

    if (needed.size === 0) return;

    const have = new Set(profiles.map((p) => p.id));
    const missing = Array.from(needed).filter((id) => !have.has(id));
    if (missing.length === 0) return;

    supabase
      .from('profiles')
      .select('id, full_name, avatar_name, avatar_url, first_name, email')
      .in('id', missing)
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;
        setProfiles((prev) => {
          const map = new Map(prev.map((p) => [p.id, p] as const));
          for (const row of data as any[]) map.set(row.id, row);
          return Array.from(map.values()) as any;
        });
      });
  }, [nodes, profiles]);

  // Listen to SI open events from DoNode buttons
  useEffect(() => {
    const handler = (e: any) => setFocusedSI(e.detail);
    window.addEventListener("rcdo:open-si", handler as any);
    return () => window.removeEventListener("rcdo:open-si", handler as any);
  }, []);

  // Listen to node update events from inline editing
  useEffect(() => {
    const handler = (e: any) => {
      const { nodeId, updates } = e.detail;
      setNodes((currentNodes) => 
        currentNodes.map((n) => 
          n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
        )
      );
    };
    window.addEventListener("rcdo:update-node", handler as any);
    return () => window.removeEventListener("rcdo:update-node", handler as any);
  }, [setNodes]);

  // Push local changes to Yjs, but avoid echoing remote updates back
  useEffect(() => {
    const doc = ydocRef.current;
    if (!doc) return;
    if (updatingFromRemoteNodes.current) {
      updatingFromRemoteNodes.current = false;
      return;
    }
    const yNodes = doc.getArray<any>("nodes");
    yNodes.delete(0, yNodes.length);
    yNodes.insert(0, [nodes]);
  }, [nodes]);

  useEffect(() => {
    const doc = ydocRef.current;
    if (!doc) return;
    if (updatingFromRemoteEdges.current) {
      updatingFromRemoteEdges.current = false;
      return;
    }
    const yEdges = doc.getArray<any>("edges");
    yEdges.delete(0, yEdges.length);
    yEdges.insert(0, [edges]);
  }, [edges]);

  // Debounced save of canvas state to Supabase
  useEffect(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        await supabase
          .from('rc_canvas_states')
          .upsert(
            {
              room: roomName,
              nodes: nodes as any,
              edges: edges as any,
              updated_by: auth?.user?.id || null,
            },
            { onConflict: 'room' }
          );
      } catch (_e) {
        // no-op; optional: toast in future
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [nodes, edges]);

  const onConnect = useCallback((params: Edge | Connection) => {
    // Enforce: SI has exactly one DO parent
    if ("source" in params && "target" in params) {
      const source = nodes.find((n) => n.id === params.source);
      const target = nodes.find((n) => n.id === params.target);
      if (source?.type === "sai" && target?.type === "do") {
        // move SI under this DO (reassign parentDoId) and ensure only one DO edge
        const updatedNodes = nodes.map((n) =>
          n.id === source.id ? { ...n, data: { ...n.data, parentDoId: target.id } } : n
        );
        let updatedEdges = edges.filter(
          (e) => !(e.source === source.id && nodes.find((n) => n.id === e.target)?.type === "do")
        );
        updatedEdges = addEdge({ ...(params as Edge), id: `e-${source.id}-${target.id}`, markerEnd: { type: MarkerType.ArrowClosed } }, updatedEdges);
        setNodes(updatedNodes);
        setEdges(updatedEdges);
        return;
      }
    }
    const next = addEdge({ ...(params as Edge), markerEnd: { type: MarkerType.ArrowClosed } }, edges);
    setEdges(next);
  }, [edges, nodes]);

  const onNodeClick = useCallback((_e: any, node: Node<NodeData>) => setSelectedNode(node), []);
  const onNodeDoubleClick = useCallback((_e: any, node: Node<NodeData>) => {
    if (node.type === "rally") setSelectedNode(node);
  }, []);

  const closePanel = useCallback(() => setSelectedNode(null), []);

  // Toolbar actions
const addDo = useCallback(() => {
    const count = nodes.filter((n) => n.type === "do").length;
    const id = `do-${count + 1}`;
    const preferred = { x: 200, y: 240 };
    const pos = findNonOverlappingPosition(nodes, "do", preferred.x, preferred.y);
    const newDo: Node<NodeData> = { id, type: "do", position: pos, data: { title: `DO ${count + 1}`, status: "draft", size: { w: 260, h: 110 } } };
    const newEdge: Edge = { id: `e-s-${id}`, source: ROOT_ID, target: id, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } };
    setNodes([...nodes, newDo]);
    setEdges([...edges, newEdge]);
  }, [nodes, edges]);

  const removeDo = useCallback(() => {
    const lastDo = [...nodes].filter((n) => n.type === "do").sort((a, b) => a.id.localeCompare(b.id)).pop();
    if (!lastDo) return;
    const remainingNodes = nodes.filter((n) => n.id !== lastDo.id && !(n.type === "sai" && (n.data as NodeData).parentDoId === lastDo.id));
    const remainingEdges = edges.filter((e) => e.source !== lastDo.id && e.target !== lastDo.id);
    setNodes(remainingNodes);
    setEdges(remainingEdges);
  }, [nodes, edges]);

  const addSaiToSelectedDo = useCallback(() => {
    const targetDo = selectedNode?.type === "do" ? selectedNode : nodes.find((n) => n.type === "do");
    if (!targetDo) return;
    const saiId = `sai-${Math.random().toString(36).slice(2, 7)}`;
    const nextNodes = nodes.map((n) => {
      if (n.id !== targetDo.id) return n;
      const items = (n.data.saiItems || []).concat([{ id: saiId, title: "New Initiative", ownerId: undefined, metric: "", description: "" }]);
      return { ...n, data: { ...n.data, saiItems: items } } as Node<NodeData>;
    });
    setNodes(nextNodes);
    setFocusedSI({ doId: targetDo.id, siId: saiId });
  }, [nodes, selectedNode]);

const duplicateSelectedDo = useCallback(() => {
    if (selectedNode?.type !== "do") return;
    const count = nodes.filter((n) => n.type === "do").length;
    const id = `do-${count + 1}`;
    const offset = 40;
    const pos = findNonOverlappingPosition(nodes, "do", selectedNode.position.x + offset, selectedNode.position.y + offset);
    const newDo: Node<NodeData> = {
      id,
      type: "do",
      position: pos,
      data: { title: `${selectedNode.data.title || "DO"} (copy)`, status: selectedNode.data.status || "draft", bgColor: selectedNode.data.bgColor, size: selectedNode.data.size || { w: 260, h: 110 } },
    };
    const newEdge: Edge = { id: `e-s-${id}`, source: ROOT_ID, target: id, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } };
    setNodes([...nodes, newDo]);
    setEdges([...edges, newEdge]);
  }, [nodes, edges, selectedNode]);

  const deleteSelectedDo = useCallback(() => {
    if (selectedNode?.type !== "do") return;
    const doId = selectedNode.id;
    const remainingNodes = nodes.filter((n) => n.id !== doId && !(n.type === "sai" && (n.data as NodeData).parentDoId === doId));
    const remainingEdges = edges.filter((e) => e.source !== doId && e.target !== doId);
    setNodes(remainingNodes);
    setEdges(remainingEdges);
    setSelectedNode(null);
  }, [nodes, edges, selectedNode]);

  // Bulk actions
  const lockEverything = useCallback(async () => {
    // 1) Lock all DOs locally and finalize the Rallying Cry
    setNodes((curr) => curr.map((n) => {
      if (n.type === 'do') {
        return { ...n, data: { ...(n.data as any), status: 'final' } } as Node<NodeData>;
      }
      if (n.type === 'rally') {
        const d: any = n.data || {};
        const top = Array.isArray(d.rallyCandidates) && d.rallyCandidates.length > 0 ? d.rallyCandidates[0] : (d.title || '');
        return { ...n, data: { ...d, rallyCandidates: top ? [top] : d.rallyCandidates, rallyFinalized: true } } as Node<NodeData>;
      }
      return n;
    }));

    // 2) Optimistically mark DOs as locked in local lock map (UI-only)
    setDoLockedStatus((prev) => {
      const updated = new Map(prev);
      for (const n of nodes) {
        if (n.type === 'do') {
          const existing = updated.get(n.id);
          const dbId = (existing?.dbId || (n as any)?.data?.dbId);
          updated.set(n.id, { locked: true, dbId });
        }
      }
      return updated;
    });

    // 3) Optimistically mark all known SIs as locked in local progress map (UI-only)
    setSiProgressMap((prev) => {
      const updated = new Map(prev);
      for (const [k, v] of updated) {
        updated.set(k, { ...v, isLocked: true });
      }
      return updated;
    });

    // 4) Persist to database: lock DOs; trigger on DO will cascade lock SIs
    try {
      const doDbIds: string[] = nodes
        .filter((n) => n.type === 'do')
        .map((n) => {
          const existing = doLockedStatus.get(n.id);
          return (existing?.dbId || (n as any)?.data?.dbId) as string | undefined;
        })
        .filter(Boolean) as string[];

      if (doDbIds.length === 0) {
        toast({ title: 'Nothing to lock', description: 'No Defining Objectives to lock yet.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const { error: doLockErr } = await supabase
        .from('rc_defining_objectives')
        .update({ status: 'final', locked_at: nowIso })
        .in('id', doDbIds);

      if (doLockErr) {
        toast({ title: 'Lock failed', description: 'Could not persist lock to the server.', variant: 'destructive' });
        return;
      }

      // Successful: server trigger will set locked_at on child SIs
      toast({ title: 'Locked', description: 'All DOs and their SIs were locked.' });
    } catch (_) {
      // best-effort: UI already updated
    }
  }, [nodes, setNodes, setDoLockedStatus, setSiProgressMap, doLockedStatus, toast]);

  const openImportFromFile = useCallback(() => {
    setShowImportDialog(true);
    setImportProgress([]);
    setImportStatus(null);
    setPastedMarkdown('');
  }, []);

  // Check if canvas has content
  const hasCanvasContent = useCallback(() => {
    // Check if there are DOs beyond the initial template state
    const doNodes = nodes.filter(n => n.type === 'do');
    if (doNodes.length === 0) return false;
    
    // Check if any DO has a custom title or SIs
    const hasCustomContent = doNodes.some(n => {
      const title = n.data.title || '';
      const hasSIs = (n.data.saiItems?.length || 0) > 0;
      const hasCustomTitle = title && !title.match(/^DO \d+$/);
      return hasCustomTitle || hasSIs;
    });
    
    return hasCustomContent;
  }, [nodes]);

  // Import from markdown text (shared logic)
  const processMarkdownImport = useCallback(async (markdownText: string, skipWarning = false, opts?: { lockAll?: boolean }) => {
    // Check if canvas has content and show warning if needed
    if (!skipWarning && hasCanvasContent()) {
      setPendingImportData(markdownText);
      setShowOverwriteWarning(true);
      return;
    }

    setIsImporting(true);
    setImportProgress([]);

    try {
      // Check if replacing existing data
      if (skipWarning && hasCanvasContent()) {
        setImportStatus({ type: 'info', message: 'Removing existing data...' });
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Parse markdown
      setImportStatus({ type: 'info', message: 'Parsing markdown...' });
      const parsedData = parseMarkdownRCDO(markdownText);
      
      // Initialize progress items
      const progressItems = [
        { label: 'Rallying Cry', status: 'pending' as const },
        ...parsedData.definingObjectives.map(do_ => ({
          label: do_.title,
          status: 'pending' as const
        }))
      ];
      setImportProgress(progressItems);
      
      // Validate
      const validation = validateParsedRCDO(parsedData);
      if (!validation.valid) {
        setImportStatus({ 
          type: 'error', 
          message: `Validation failed:\n${validation.errors.join('\n')}` 
        });
        toast({
          title: "Import Failed",
          description: validation.errors[0],
          variant: "destructive"
        });
        setIsImporting(false);
        return;
      }

      // Show warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        console.warn('⚠️ Import warnings:', validation.warnings);
        setImportStatus({ 
          type: 'info', 
          message: `Warnings: ${validation.warnings.join(', ')}` 
        });
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No user found');
      }

      // Import to database
      if (!cycleId) {
        throw new Error('No cycle ID found');
      }

      setImportStatus({ type: 'info', message: 'Saving to database...' });
      
      // Import with progress callback
      const importResult = await importRCDOToDatabase(parsedData, {
        cycleId,
        ownerUserId: user.id
      }, (progress) => {
        setImportProgress(prev => 
          prev.map((item, idx) => 
            idx === progress.index ? { ...item, status: progress.status } : item
          )
        );
      });

      if (!importResult.success) {
        throw new Error(importResult.error || 'Import failed');
      }

      // Format for canvas
      setImportStatus({ type: 'info', message: 'Updating canvas...' });
      
      // Add canvas update to progress
      setImportProgress(prev => [
        ...prev,
        { label: 'Rendering canvas', status: 'loading' }
      ]);
      
      // Small delay to let UI update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const { nodes: importedNodes, edges: importedEdges } = formatRCDOForCanvas(parsedData);
      
      // Update canvas
      setNodes(importedNodes);
      setEdges(importedEdges);
      
      // Wait for ReactFlow to render
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Mark canvas update complete
      setImportProgress(prev => 
        prev.map(item => 
          item.label === 'Rendering canvas' ? { ...item, status: 'success' as const } : item
        )
      );

      // Optional post-action: lock all DOs and SIs
      if (opts?.lockAll) {
        try {
          const doIds = importResult.doIds || [];
          const siIds = importResult.siIds || [];
          const nowIso = new Date().toISOString();

          // Lock DOs
          if (doIds.length > 0) {
            setImportProgress(prev => [...prev, { label: 'Locking Defining Objectives', status: 'loading' }]);
            const { error: doLockErr } = await supabase
              .from('rc_defining_objectives')
              .update({ status: 'final', locked_at: nowIso })
              .in('id', doIds);
            setImportProgress(prev => prev.map(item => item.label === 'Locking Defining Objectives' ? { ...item, status: doLockErr ? 'error' : 'success' } : item));
          }

          // Lock SIs
          if (siIds.length > 0) {
            setImportProgress(prev => [...prev, { label: 'Locking Strategic Initiatives', status: 'loading' }]);
            const { error: siLockErr } = await supabase
              .from('rc_strategic_initiatives')
              .update({ locked_at: nowIso })
              .in('id', siIds);
            setImportProgress(prev => prev.map(item => item.label === 'Locking Strategic Initiatives' ? { ...item, status: siLockErr ? 'error' : 'success' } : item));
          }

          // Update local lock map so progress bars can show when applicable
          if ((importResult.doIds || []).length > 0) {
            const lockEntries: Array<[string, { locked: boolean; dbId?: string }]> = (importResult.doIds || []).map((id, idx) => [`do-${idx + 1}`, { locked: true, dbId: id }]);
            setDoLockedStatus(new Map(lockEntries));
          }
          setImportStatus({ 
            type: 'success', 
            message: `Imported and locked ${parsedData.definingObjectives.length} DOs and ${(importResult.siIds || []).length} SIs.` 
          });
        } catch (_e) {
          // Non-fatal
        }
      } else {
        setImportStatus({ 
          type: 'success', 
          message: `Successfully imported: ${parsedData.definingObjectives.length} DOs with ${parsedData.definingObjectives.reduce((sum, d) => sum + d.strategicInitiatives.length, 0)} Strategic Initiatives` 
        });
      }

      toast({
        title: "Import Successful",
        description: `Imported ${parsedData.definingObjectives.length} Defining Objectives`,
      });

      // Keep dialog open to show success state
      // User can close manually

    } catch (error: any) {
      setImportStatus({ 
        type: 'error', 
        message: error.message || 'An error occurred during import' 
      });
      toast({
        title: "Import Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
      setPendingImportData(null);
      setShowOverwriteWarning(false);
      // Don't clear progress - keep it visible
    }
  }, [cycleId, setNodes, setEdges, toast, hasCanvasContent]);

  // Import from file
  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus({ type: 'info', message: 'Reading file...' });
    try {
      const text = await file.text();
      await processMarkdownImport(text);
    } catch (error: any) {
      setImportStatus({ 
        type: 'error', 
        message: error.message || 'Failed to read file' 
      });
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [processMarkdownImport]);

  // One-click Import + Lock handler
  const handleOneClickFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) { setOneClickMode(false); return; }
    try {
      // Ensure import dialog is visible to show progress
      setShowImportDialog(true);
      setImportMode('file');
      setImportProgress([]);
      setImportStatus({ type: 'info', message: 'Reading file...' });
      setIsImporting(true);
      const text = await file.text();
      await processMarkdownImport(text, true, { lockAll: true });
    } catch (_e) {
      // status already set inside processor
    } finally {
      if (oneClickFileInputRef.current) oneClickFileInputRef.current.value = '';
      setIsImporting(false);
      setOneClickMode(false);
    }
  }, [processMarkdownImport]);

  // Import from pasted text
  const handleImportPasted = useCallback(async () => {
    if (!pastedMarkdown.trim()) {
      toast({
        title: "No Content",
        description: "Please paste markdown content first",
        variant: "destructive"
      });
      return;
    }
    await processMarkdownImport(pastedMarkdown);
  }, [pastedMarkdown, processMarkdownImport, toast]);

  // Confirm overwrite and proceed with import
  const handleConfirmOverwrite = useCallback(async () => {
    if (pendingImportData) {
      setShowOverwriteWarning(false);
      // Keep import dialog open to show progress
      await processMarkdownImport(pendingImportData, true);
    }
  }, [pendingImportData, processMarkdownImport]);

  // Cancel overwrite
  const handleCancelOverwrite = useCallback(() => {
    setShowOverwriteWarning(false);
    setPendingImportData(null);
    // Keep import dialog open so user can try again or cancel
  }, []);

  // Ensure content fits and rallying cry sits near the top (~1–2 cm ≈ 38–76 px; we use ~60 px)
  const optimizeViewport = useCallback(() => {
    const inst = rfInstanceRef.current as any;
    if (!inst) return;

    // First fit everything into view with a modest padding
    try {
      // Increase padding to ensure visible side margins
      inst.fitView?.({ padding: 0.12, includeHiddenNodes: true, duration: 0 });
    } catch { /* no-op */ }

    // After the fit, nudge the viewport so the rally node is near the top
    const rally = nodes.find((n) => n.type === 'rally');
    if (!rally) return;

    // Try to get current viewport; fallback to reading internal transform if needed
    let vp: { x: number; y: number; zoom: number } | null = null;
    if (typeof inst.getViewport === 'function') {
      vp = inst.getViewport();
    } else if (inst.toObject?.().viewport) {
      vp = inst.toObject().viewport;
    }
    if (!vp) return;

    const marginTopPx = 60; // target top margin for rallying cry
    const rallyRect = rectForNode(rally);
    const rallyTopScreenY = rallyRect.y * vp.zoom + vp.y;
    const delta = rallyTopScreenY - marginTopPx;
    if (delta > 2) {
      // Move content up by decreasing translateY
      inst.setViewport?.({ x: vp.x, y: vp.y - delta, zoom: vp.zoom }, { duration: 150 });
    }
  }, [nodes]);

  useEffect(() => {
    // Run auto-fit once after nodes are available or change significantly
    if (!rfInstanceRef.current) return;
    if (didInitialFitRef.current) return;
    if (!nodes || nodes.length === 0) return;
    // Give ReactFlow a tick to measure node sizes
    const t = window.setTimeout(() => {
      optimizeViewport();
      didInitialFitRef.current = true;
    }, 0);
    return () => window.clearTimeout(t);
  }, [nodes, optimizeViewport]);

  return (
    <div className="w-full h-dvh flex flex-col">
      {/* Page header (logo, tabs, avatar) */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          {/* Left: Back (when not on main) + Logo */}
          <div className="flex items-center gap-4">
            {activeTab !== 'main' && (
              <button
                onClick={() => navigate('/dashboard/rcdo')}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          </div>

          {/* Center: Tabs */}
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="h-10">
                <TabsTrigger value="rcdo" className="px-6">RCDO</TabsTrigger>
                <TabsTrigger value="main" className="px-6">Meetings</TabsTrigger>
                <TabsTrigger value="checkins" className="px-6">My DOSIs</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Right: Avatar + name clickable */}
          <UserProfileHeader />
        </div>
      </header>

      {/* Canvas toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-background">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="flex items-center gap-1">
              Actions <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => navigate('/dashboard/rcdo')}>
              <Layers className="h-4 w-4 mr-2" />
              View all strategies
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={addDo}>
              <Plus className="h-4 w-4 mr-2" />
              Add DO
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openImportFromFile}>
              <Upload className="h-4 w-4 mr-2" />
              Import from File
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={lockEverything}>
              <Lock className="h-4 w-4 mr-2" />
              Lock everything
            </DropdownMenuItem>
        {progressFeatureOn && (
              <DropdownMenuItem onClick={() => setShowProgress(true)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Turn Progress on
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* View As... dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">View As:</span>
          <Select value={viewAsUserId || "all"} onValueChange={(value) => setViewAsUserId(value === "all" ? null : value)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {profiles.map((p) => {
                const displayName = p.full_name || '';
                const isUnknown = !displayName || displayName.trim().toLowerCase() === 'unknown';
                return (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                        {isUnknown ? (
                          <span className="font-semibold">?</span>
                        ) : (
                          <FancyAvatar 
                            name={p.avatar_name || displayName} 
                            displayName={displayName}
                            avatarUrl={p.avatar_url}
                            size="sm" 
                          />
                        )}
                      </span>
                      <span>{isUnknown ? 'Unknown' : displayName}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_360px]">
        <div className="min-h-0 relative">
        {/* Watermark text in top-left of canvas */}
        <div className="absolute top-4 left-4 z-10 text-xs text-muted-foreground/60 pointer-events-none">
          Top box is the Rallying Cry. Start with 4 DOs; SIs support only one DO.
        </div>
        <ReactFlow
          nodes={filteredNodes}
          edges={filteredEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onInit={(inst) => {
            rfInstanceRef.current = inst as any;
            // Perform an initial fit + top offset when the instance is ready
            requestAnimationFrame(() => optimizeViewport());
          }}
          onNodeDragStop={(_e, node) => {
            // Basic overlap avoidance: nudge dragged node until it doesn't collide
            function rect(n: Node<NodeData>) {
              return rectForNode(n);
            }
            function overlaps(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) {
              return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
            }
            let next = nodes.map((n) => ({ ...n }));
            const idx = next.findIndex((n) => n.id === node.id);
            if (idx === -1) return;
            let attempts = 0;
            while (attempts < 50) {
              const r = rect(next[idx]);
              const collidesWith = next.find((other, j) => j !== idx && overlaps(r, rect(other)));
              if (!collidesWith) break;
              next[idx].position = { x: next[idx].position.x + 20, y: next[idx].position.y + 20 };
              attempts++;
            }
            setNodes(next);
          }}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.25}
          maxZoom={1.5}
          snapToGrid
          snapGrid={[10, 10]}
        >
          <MiniMap pannable zoomable />
          <Controls />
          <Background />
        </ReactFlow>
        </div>
        <aside className="hidden lg:block h-full border-l border-gray-200 bg-gray-50 shadow-md overflow-y-auto p-3">
          <CheckinFeedSidebar viewAsUserId={viewAsUserId} filteredNodeIds={visibleParentIds} />
        </aside>
      </div>

      {/* Global lock overlay during one-click import */}
      {(oneClickMode || (showImportDialog && isImporting)) && (
        <div className="fixed inset-0 z-40 bg-black/20 pointer-events-auto" />
      )}

      {/* Right-side Rally panel */}
      {selectedNode?.type === "rally" && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closePanel} />
          <div className="absolute right-0 top-0 h-full w-[440px] bg-background border-l shadow-xl p-4 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Rallying Cry</h3>
              <button className="text-sm text-muted-foreground hover:text-foreground" onClick={closePanel}>Close</button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <label className="text-sm">Background</label>
                <input
                  type="color"
                  value={selectedNode?.data.bgColor || "#ffffff"}
                  onChange={(e) => {
                    const value = e.target.value;
                    const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, bgColor: value } } : n);
                    setNodes(next);
                    setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, bgColor: value } });
                  }}
                />
              </div>

              {/* Size controls for Rally */}
              <div className="flex items-center gap-2">
                <label className="text-sm">Size</label>
                <input
                  type="number"
                  min={220}
                  max={800}
                  className="w-20 rounded border px-2 py-1 text-sm bg-background"
                  value={selectedNode?.data.size?.w || 280}
                  onChange={(e) => {
                    const w = Math.max(220, Math.min(800, Number(e.target.value)));
                    const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, size: { w, h: n.data.size?.h || 100 } } } : n);
                    setNodes(next);
                    setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, size: { w, h: selectedNode!.data.size?.h || 100 } } });
                  }}
                />
                <span className="text-xs">×</span>
                <input
                  type="number"
                  min={80}
                  max={400}
                  className="w-20 rounded border px-2 py-1 text-sm bg-background"
                  value={selectedNode?.data.size?.h || 100}
                  onChange={(e) => {
                    const h = Math.max(80, Math.min(400, Number(e.target.value)));
                    const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, size: { w: n.data.size?.w || 280, h } } } : n);
                    setNodes(next);
                    setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, size: { w: selectedNode!.data.size?.w || 280, h } } });
                  }}
                />
              </div>

              {/* Candidates */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Candidates (top = most likely)</div>
                <div className="space-y-2">
                  {(selectedNode.data.rallyCandidates || []).map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {/* Up/Down chevrons for reordering */}
                      {!selectedNode.data.rallyFinalized && (
                        <div className="flex flex-col">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (i === 0) return;
                              const arr = [...(selectedNode.data.rallyCandidates || [])];
                              // Swap with previous item
                              [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                              const next = nodes.map((n) => 
                                n.id === selectedNode!.id 
                                  ? { ...n, data: { ...n.data, rallyCandidates: arr } } 
                                  : n
                              );
                              setNodes(next);
                              setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, rallyCandidates: arr } });
                            }}
                            disabled={i === 0}
                            className="h-5 w-6 p-0 hover:bg-accent disabled:opacity-30"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const arr = [...(selectedNode.data.rallyCandidates || [])];
                              if (i >= arr.length - 1) return;
                              // Swap with next item
                              [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                              const next = nodes.map((n) => 
                                n.id === selectedNode!.id 
                                  ? { ...n, data: { ...n.data, rallyCandidates: arr } } 
                                  : n
                              );
                              setNodes(next);
                              setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, rallyCandidates: arr } });
                            }}
                            disabled={i >= (selectedNode.data.rallyCandidates || []).length - 1}
                            className="h-5 w-6 p-0 hover:bg-accent disabled:opacity-30"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      
                      {/* Rank number badge */}
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold flex-shrink-0 ${
                        i === 0 ? "bg-purple-500 text-white" : "bg-muted text-foreground"
                      }`}>
                        {i + 1}
                      </span>
                      
                      <input
                        className={`flex-1 rounded border px-2 py-1 text-sm bg-background ${i === 0 ? "font-semibold" : ""}`}
                        value={c}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = nodes.map((n) =>
                            n.id === selectedNode!.id
                              ? { ...n, data: { ...n.data, rallyCandidates: (n.data.rallyCandidates || []).map((x, j) => (j === i ? val : x)) } }
                              : n
                          );
                          setNodes(next);
                          setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, rallyCandidates: (selectedNode!.data.rallyCandidates || []).map((x, j) => (j === i ? val : x)) } });
                        }}
                        disabled={selectedNode.data.rallyFinalized && i > 0}
                      />
                      
                      {/* Remove button (only for non-first items and when not finalized) */}
                      {i > 0 && !selectedNode.data.rallyFinalized && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const arr = [...(selectedNode.data.rallyCandidates || [])];
                            arr.splice(i, 1);
                            const next = nodes.map((n) => 
                              n.id === selectedNode!.id 
                                ? { ...n, data: { ...n.data, rallyCandidates: arr } } 
                                : n
                            );
                            setNodes(next);
                            setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, rallyCandidates: arr } });
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {!selectedNode.data.rallyFinalized && (
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded border px-2 py-1 text-sm bg-background"
                      placeholder="Add another candidate"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (!val) return;
                          const arr = [...(selectedNode.data.rallyCandidates || [])];
                          arr.push(val);
                          (e.target as HTMLInputElement).value = "";
                          const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, rallyCandidates: arr } } : n);
                          setNodes(next);
                          setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, rallyCandidates: arr } });
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const arr = [...(selectedNode.data.rallyCandidates || [])];
                        arr.push("New candidate");
                        const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, rallyCandidates: arr } } : n);
                        setNodes(next);
                        setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, rallyCandidates: arr } });
                      }}
                    >
                      Add
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  {!selectedNode.data.rallyFinalized ? (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        const top = (selectedNode.data.rallyCandidates || [selectedNode.data.title || ""]) [0] || "";
                        const next = nodes.map((n) =>
                          n.id === selectedNode!.id
                            ? { ...n, data: { ...n.data, rallyCandidates: [top], rallyFinalized: true } }
                            : n
                        );
                        setNodes(next);
                        setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, rallyCandidates: [top], rallyFinalized: true } });
                      }}
                    >
                      Finalize
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Finalized. Other options removed.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right-side DO panel */}
      {selectedNode?.type === "do" && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closePanel} />
          <div className="absolute right-0 top-0 h-full w-[380px] bg-background border-l shadow-xl p-4 flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">
                DO: {selectedNode.data.titleCandidates?.[0] || selectedNode.data.title || "Untitled"}
              </h3>
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="More actions">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={duplicateSelectedDo}>Duplicate</DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onClick={deleteSelectedDo}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="Close" onClick={closePanel}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-3 flex-1 overflow-y-auto">
              <div className="space-y-3">
                {/* 1. Name */}
                <div>
                  <span className="text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-slate-600 text-white mb-2 inline-block">Defining Objective</span>
                  <label className="block text-sm font-medium">
                    Name
                  </label>
                  <div className="flex items-center gap-2 mt-1 mb-2">
                    <label className="text-xs text-muted-foreground">Status</label>
                    <select
                      className="rounded border bg-background px-2 py-1 text-xs"
                      value={selectedNode.data.status || "draft"}
                      onChange={(e) => {
                        if (!selectedNode) return;
                        const value = e.target.value as "draft" | "final";
                        const next = nodes.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, status: value } } : n);
                        setNodes(next);
                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, status: value } });
                      }}
                    >
                      <option value="draft">ideating</option>
                      <option value="final">locked</option>
                    </select>
                  </div>
                  
                  {selectedNode.data.status === "final" ? (
                    // Final mode: just show the locked title
                    <input
                      className="w-full rounded border px-2 py-1 text-sm bg-background mt-1"
                      value={selectedNode?.data.title || ""}
                      onChange={(e) => {
                        if (!selectedNode) return;
                        const next = nodes.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, title: e.target.value } } : n);
                        setNodes(next);
                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, title: e.target.value } });
                      }}
                      placeholder="Name this DO"
                    />
                  ) : (
                    // Draft mode: show candidates with ranking
                    <div className="space-y-2 mt-1">
                      {(selectedNode.data.titleCandidates || [selectedNode.data.title || "New DO"]).map((candidate, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {/* Up/Down chevrons for reordering */}
                          <div className="flex flex-col">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (!selectedNode || idx === 0) return;
                                const arr = [...(selectedNode.data.titleCandidates || [selectedNode.data.title || ""])];
                                // Swap with previous item
                                [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                const next = nodes.map((n) => 
                                  n.id === selectedNode.id 
                                    ? { ...n, data: { ...n.data, titleCandidates: arr, title: arr[0] } } 
                                    : n
                                );
                                setNodes(next);
                                setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, titleCandidates: arr, title: arr[0] } });
                              }}
                              disabled={idx === 0}
                              className="h-5 w-6 p-0 hover:bg-accent disabled:opacity-30"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (!selectedNode) return;
                                const arr = [...(selectedNode.data.titleCandidates || [selectedNode.data.title || ""])];
                                if (idx >= arr.length - 1) return;
                                // Swap with next item
                                [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                const next = nodes.map((n) => 
                                  n.id === selectedNode.id 
                                    ? { ...n, data: { ...n.data, titleCandidates: arr, title: arr[0] } } 
                                    : n
                                );
                                setNodes(next);
                                setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, titleCandidates: arr, title: arr[0] } });
                              }}
                              disabled={idx >= (selectedNode.data.titleCandidates || [selectedNode.data.title || "New DO"]).length - 1}
                              className="h-5 w-6 p-0 hover:bg-accent disabled:opacity-30"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          {/* Rank number badge */}
                          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold flex-shrink-0 ${
                            idx === 0 ? "bg-blue-500 text-white" : "bg-muted text-foreground"
                          }`}>
                            {idx + 1}
                          </span>
                          
                          <input
                            className="flex-1 rounded border px-2 py-1 text-sm bg-background"
                            value={candidate}
                            onChange={(e) => {
                              if (!selectedNode) return;
                              const arr = [...(selectedNode.data.titleCandidates || [selectedNode.data.title || ""])];
                              arr[idx] = e.target.value;
                              const next = nodes.map((n) => 
                                n.id === selectedNode.id 
                                  ? { ...n, data: { ...n.data, titleCandidates: arr, title: arr[0] } } 
                                  : n
                              );
                              setNodes(next);
                              setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, titleCandidates: arr, title: arr[0] } });
                            }}
                            placeholder={`Candidate ${idx + 1}`}
                          />
                          
                          {/* Remove button (only for non-first items) */}
                          {idx > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (!selectedNode) return;
                                const arr = [...(selectedNode.data.titleCandidates || [selectedNode.data.title || ""])];
                                arr.splice(idx, 1);
                                const next = nodes.map((n) => 
                                  n.id === selectedNode.id 
                                    ? { ...n, data: { ...n.data, titleCandidates: arr, title: arr[0] } } 
                                    : n
                                );
                                setNodes(next);
                                setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, titleCandidates: arr, title: arr[0] } });
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      
                      {/* Add new candidate */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          className="flex-1 rounded border px-2 py-1 text-sm bg-background"
                          placeholder="Add another candidate..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (!val) return;
                              const arr = [...(selectedNode.data.titleCandidates || [selectedNode.data.title || ""])];
                              arr.push(val);
                              (e.target as HTMLInputElement).value = "";
                              const next = nodes.map((n) => 
                                n.id === selectedNode.id 
                                  ? { ...n, data: { ...n.data, titleCandidates: arr, title: arr[0] } } 
                                  : n
                              );
                              setNodes(next);
                              setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, titleCandidates: arr, title: arr[0] } });
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            const arr = [...(selectedNode.data.titleCandidates || [selectedNode.data.title || ""])];
                            arr.push("New candidate");
                            const next = nodes.map((n) => 
                              n.id === selectedNode.id 
                                ? { ...n, data: { ...n.data, titleCandidates: arr, title: arr[0] } } 
                                : n
                            );
                            setNodes(next);
                            setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, titleCandidates: arr, title: arr[0] } });
                          }}
                        >
                          Add
                        </Button>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        The #1 ranked candidate is displayed on the canvas. Change status to "final" to lock it.
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Description */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Definition & Hypothesis</label>
                  <RichTextEditor
                    content={selectedNode?.data.hypothesis || ""}
                    onChange={(content) => {
                      if (!selectedNode) return;
                      const next = nodes.map((n) => 
                        n.id === selectedNode.id ? { ...n, data: { ...n.data, hypothesis: content } } : n
                      );
                      setNodes(next);
                      setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, hypothesis: content } });
                    }}
                    placeholder="If we do X, then Y will happen because Z..."
                    minHeight="96px"
                  />
                </div>

                {/* 3. Primary Success Metric */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Primary Success Metric</label>
                  <textarea
                    className="w-full rounded border px-2 py-2 text-sm bg-background resize-none"
                    rows={3}
                    value={selectedNode?.data.primarySuccessMetric || ""}
                    onChange={(e) => {
                      if (!selectedNode) return;
                      const next = nodes.map((n) => 
                        n.id === selectedNode.id ? { ...n, data: { ...n.data, primarySuccessMetric: e.target.value } } : n
                      );
                      setNodes(next);
                      setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, primarySuccessMetric: e.target.value } });
                    }}
                    placeholder="e.g., OpEx management and achievement of SI-level metrics"
                    style={{ 
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}
                  />
                </div>

                {/* 4. Owner */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Owner</label>
                  <Select
                      value={selectedNode.data.ownerId || ""}
                      onValueChange={async (val) => {
                        if (!selectedNode) return;
                        // Update local canvas state immediately for responsiveness
                        const next = nodes.map((n) => 
                          n.id === selectedNode.id ? { ...n, data: { ...n.data, ownerId: val || undefined } } : n
                        );
                        setNodes(next);
                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ownerId: val || undefined } });

                        // Persist to DB if this DO is linked to a DB row
                        try {
                          const doStatus = doLockedStatus.get(selectedNode.id);
                          const doDbId = doStatus?.dbId;
                          if (doDbId && val) {
                            const { error } = await supabase
                              .from('rc_defining_objectives')
                              .update({ owner_user_id: val })
                              .eq('id', doDbId);
                            if (error) {
                              console.warn('[Canvas] Failed to persist DO owner change', error);
                            } else {
                              // Optional toast could be added here
                            }
                          }
                        } catch (e) {
                          console.warn('[Canvas] Error updating DO owner in DB', e);
                        }
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9">
                        <SelectValue placeholder="Select owner">
                          {selectedNode.data.ownerId && (() => {
                            const owner = profilesMap[selectedNode.data.ownerId];
                            if (!owner) return null;
                            const displayName = owner.full_name || '';
                            const isUnknown = !displayName || displayName.trim().toLowerCase() === 'unknown';
                            return (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                                  {isUnknown ? (
                                    <span className="font-semibold">?</span>
                                  ) : (
                                    <FancyAvatar 
                                      name={owner.avatar_name || displayName} 
                                      displayName={displayName}
                                      avatarUrl={owner.avatar_url}
                                      size="sm" 
                                    />
                                  )}
                                </span>
                                <span className="text-sm">{isUnknown ? 'Unknown' : displayName}</span>
                              </div>
                            );
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => {
                          const displayName = p.full_name || '';
                          const isUnknown = !displayName || displayName.trim().toLowerCase() === 'unknown';
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              <div className="flex items-center gap-2">
                                <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                                  {isUnknown ? (
                                    <span className="font-semibold">?</span>
                                  ) : (
                                    <FancyAvatar 
                                      name={p.avatar_name || displayName} 
                                      displayName={displayName}
                                      avatarUrl={p.avatar_url}
                                      size="sm" 
                                    />
                                  )}
                                </span>
                                <span>{isUnknown ? 'Unknown' : displayName}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                </div>

                {/* 5. Other Participants - Not applicable for DO, skipping */}

                <div className="pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Strategic Initiatives</div>
                      <Button size="sm" variant="link" className="px-0 h-auto hover:no-underline" onClick={addSaiToSelectedDo}>+ Add</Button>
                    </div>
                  <div className="space-y-2 max-h-48 overflow-auto pr-1">
                    {(selectedNode?.data.saiItems || []).map((it) => (
                      <button
                        key={it.id}
                        className="w-full flex items-center gap-2 rounded border px-2 py-1 text-xs bg-background hover:bg-accent"
                        onClick={() => setFocusedSI({ doId: selectedNode!.id, siId: it.id })}
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                          {(() => {
                            // Prefer explicit avatar URL; otherwise resolve via ownerId -> profilesMap; fallback to initial from ownerName or '?'
                            if (it.ownerAvatarUrl) {
                              return <img src={it.ownerAvatarUrl} className="h-full w-full object-cover" />;
                            }
                            const prof = it.ownerId ? profilesMap[it.ownerId] : undefined;
                            const displayName = prof?.full_name || '';
                            const isUnknown = !prof || !displayName || displayName.trim().toLowerCase() === 'unknown';
                            if (!isUnknown) {
                              return (
                                <FancyAvatar
                                  name={prof.avatar_name || displayName}
                                  displayName={displayName}
                                  avatarUrl={prof.avatar_url}
                                  size="sm"
                                />
                              );
                            }
                            const ch = (it.ownerName?.charAt(0).toUpperCase() || '?');
                            return <span className="font-semibold">{ch}</span>;
                          })()}
                        </span>
                        <span className="flex-1 truncate text-left">{it.title || "Untitled SI"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Advanced Options - Collapsible Section */}
              <div className="pt-4 border-t mt-auto">
                <Collapsible open={advancedOptionsOpen} onOpenChange={setAdvancedOptionsOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full text-sm font-medium py-2 hover:bg-accent rounded px-2">
                    <span>Advanced Options</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${advancedOptionsOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm">Background</label>
                      <input
                        type="color"
                        value={selectedNode?.data.bgColor || "#ffffff"}
                        onChange={(e) => {
                          if (!selectedNode) return;
                          const value = e.target.value;
                          const next = nodes.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, bgColor: value } } : n);
                          setNodes(next);
                          setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, bgColor: value } });
                        }}
                      />
                    </div>

                    {/* Size controls for DO */}
                    <div className="flex items-center gap-2">
                      <label className="text-sm">Size</label>
                      <input
                        type="number"
                        min={160}
                        max={600}
                        className="w-20 rounded border px-2 py-1 text-sm bg-background"
                        value={selectedNode?.data.size?.w || 200}
                        onChange={(e) => {
                          const w = Math.max(160, Math.min(600, Number(e.target.value)));
                          const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, size: { w, h: n.data.size?.h || 110 } } } : n);
                          setNodes(next);
                          setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, size: { w, h: selectedNode!.data.size?.h || 110 } } });
                        }}
                      />
                      <span className="text-xs">×</span>
                      <input
                        type="number"
                        min={80}
                        max={400}
                        className="w-20 rounded border px-2 py-1 text-sm bg-background"
                        value={selectedNode?.data.size?.h || 110}
                        onChange={(e) => {
                          const h = Math.max(80, Math.min(400, Number(e.target.value)));
                          const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, size: { w: n.data.size?.w || 200, h } } } : n);
                          setNodes(next);
                          setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, size: { w: selectedNode!.data.size?.w || 200, h } } });
                        }}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Secondary drawer for SI details - position left of DO panel when both are open */}
      {focusedSI && (() => {
        const doNode = nodes.find(n => n.id === focusedSI.doId);
        const si = doNode?.data.saiItems?.find(x => x.id === focusedSI.siId);
        if (!doNode || !si) return null;
        
        return (
        <>
          {/* Only show an overlay if the DO panel is NOT open */}
          {selectedNode?.type !== "do" && (
            <div className="fixed inset-0 z-[55] bg-black/30" onClick={() => setFocusedSI(null)} />
          )}
          <SIPanelContent
            doNode={doNode}
            si={si}
            profiles={profiles}
            profilesMap={profilesMap}
            doLockedStatus={doLockedStatus}
            onUpdate={(patch) => {
              const next = nodes.map(n => n.id === doNode.id ? { ...n, data: { ...n.data, saiItems: (n.data.saiItems||[]).map(x => x.id===si.id ? { ...x, ...patch } : x) } } : n);
              setNodes(next);
            }}
            onDuplicate={() => {
              const newId = `si-${Math.random().toString(36).slice(2,7)}`;
              const next = nodes.map(n => n.id === doNode.id ? { ...n, data: { ...n.data, saiItems: [...(n.data.saiItems||[]), { ...si, id: newId, title: `${si.title || "Untitled SI"} (copy)` }] } } : n);
              setNodes(next);
              setFocusedSI({ doId: doNode.id, siId: newId });
            }}
            onDelete={() => {
              const next = nodes.map(n => n.id === doNode.id ? { ...n, data: { ...n.data, saiItems: (n.data.saiItems||[]).filter(x => x.id !== si.id) } } : n);
              setNodes(next);
              setFocusedSI(null);
            }}
            onClose={() => setFocusedSI(null)}
            isDoPanelOpen={selectedNode?.type === "do"}
          />
        </>
        );
      })()}

      {/* Bottom drawer for SI only (legacy) */}
      {selectedNode && selectedNode.type === "sai" && (
        <Drawer open={true} onOpenChange={(o) => !o && setSelectedNode(null)}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Edit SI</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-4 space-y-3">
              <label className="block text-sm font-medium">Title</label>
              <input
              className="w-full rounded border px-2 py-1 text-sm bg-background"
              value={selectedNode?.data.title || ""}
              onChange={(e) => {
                if (!selectedNode) return;
                const next = nodes.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, title: e.target.value } } : n);
                setNodes(next);
                setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, title: e.target.value } });
              }}
              placeholder={selectedNode?.type === "do" ? "Name this DO" : selectedNode?.type === "sai" ? "SI idea" : selectedNode?.type === "rally" ? "Optional label" : "Title"}
            />
            <div className="flex items-center gap-2">
              <label className="text-sm">Background</label>
              <input
                type="color"
                value={selectedNode?.data.bgColor || "#ffffff"}
                onChange={(e) => {
                  if (!selectedNode) return;
                  const value = e.target.value;
                  const next = nodes.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, bgColor: value } } : n);
                  setNodes(next);
                  setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, bgColor: value } });
                }}
              />
            </div>
            {selectedNode?.type === "sai" && (
              <div className="flex items-center gap-2">
                <label className="text-sm">Parent DO</label>
                <span className="text-xs text-muted-foreground">{selectedNode.data.parentDoId}</span>
              </div>
            )}

            {/* Size controls for SI */}
            <div className="flex items-center gap-2">
              <label className="text-sm">Size</label>
              <input
                type="number"
                min={120}
                max={600}
                className="w-20 rounded border px-2 py-1 text-sm bg-background"
                value={selectedNode?.data.size?.w || 160}
                onChange={(e) => {
                  const w = Math.max(120, Math.min(600, Number(e.target.value)));
                  const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, size: { w, h: n.data.size?.h || 48 } } } : n);
                  setNodes(next);
                  setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, size: { w, h: selectedNode!.data.size?.h || 48 } } });
                }}
              />
              <span className="text-xs">×</span>
              <input
                type="number"
                min={32}
                max={400}
                className="w-20 rounded border px-2 py-1 text-sm bg-background"
                value={selectedNode?.data.size?.h || 48}
                onChange={(e) => {
                  const h = Math.max(32, Math.min(400, Number(e.target.value)));
                  const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, size: { w: n.data.size?.w || 160, h } } } : n);
                  setNodes(next);
                  setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, size: { w: selectedNode!.data.size?.w || 160, h } } });
                }}
              />
            </div>

            {/* Rally candidates were here; now RC uses right-side panel */}
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="secondary">Close</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}

      {/* Overwrite Warning Dialog */}
      {showOverwriteWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={handleCancelOverwrite} />
          <div className="relative bg-background border rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold mb-2">Replace Canvas Content?</h3>
                <p className="text-sm text-muted-foreground">
                  The canvas currently contains data. Importing this file will <strong>replace all existing content</strong> including:
                </p>
                <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1 ml-2">
                  <li>All Defining Objectives</li>
                  <li>All Strategic Initiatives</li>
                  <li>The Rallying Cry</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  This action cannot be undone. Are you sure you want to continue?
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={handleCancelOverwrite}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmOverwrite}
                className="flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4" />
                Replace All Content
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => {
            if (!isImporting) {
              setShowImportDialog(false);
              setImportProgress([]);
              setImportStatus(null);
              setPastedMarkdown('');
            }
          }} />
          <div className="relative bg-background border rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Import RCDO from Markdown</h3>
              {!isImporting && (
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setShowImportDialog(false);
                    setImportStatus(null);
                    setImportProgress([]);
                    setPastedMarkdown('');
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Mode Tabs - Hidden during/after import to show progress */}
            {importProgress.length === 0 && (
              <div className="flex gap-2 mb-4 border-b">
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    importMode === 'paste'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setImportMode('paste')}
                  disabled={isImporting}
                >
                  Paste Text
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    importMode === 'file'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setImportMode('file')}
                  disabled={isImporting}
                >
                  Upload File
                </button>
              </div>
            )}

            <div className="space-y-4 flex-1 overflow-y-auto">
              {/* Progress List - Prominently displayed when active */}
              {importProgress.length > 0 && (
                <div className="space-y-3 p-4 bg-muted/40 rounded-lg border border-muted">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold">Import Progress</p>
                    {importProgress.every(p => p.status === 'success' || p.status === 'error') && (
                      <span className="text-xs text-muted-foreground">
                        {importProgress.filter(p => p.status === 'success').length}/{importProgress.length} completed
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {importProgress.map((item, index) => (
                      <div key={index} className="flex items-center gap-3 text-sm py-1">
                        {item.status === 'pending' && (
                          <div className="h-5 w-5 rounded-full border-2 border-muted flex-shrink-0" />
                        )}
                        {item.status === 'loading' && (
                          <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-blue-500" />
                        )}
                        {item.status === 'success' && (
                          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                        )}
                        {item.status === 'error' && (
                          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
                        )}
                        <span className={`flex-1 ${item.status === 'success' ? 'text-foreground font-medium' : item.status === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Messages */}
              {importStatus && importProgress.length > 0 && (
                <div className={`flex items-start gap-2 p-3 rounded-md ${
                  importStatus.type === 'success' ? 'bg-green-50 text-green-900 border border-green-200' :
                  importStatus.type === 'error' ? 'bg-red-50 text-red-900 border border-red-200' :
                  'bg-blue-50 text-blue-900 border border-blue-200'
                }`}>
                  {importStatus.type === 'success' && <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />}
                  {importStatus.type === 'error' && <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
                  {importStatus.type === 'info' && <Upload className="h-5 w-5 flex-shrink-0 mt-0.5 animate-pulse" />}
                  <p className="text-sm whitespace-pre-wrap">{importStatus.message}</p>
                </div>
              )}

              {/* Hide input forms when progress is shown */}
              {importProgress.length === 0 && (
                importMode === 'paste' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Please refer to the instructions below.
                    </p>
                    <textarea
                      className="w-full h-80 rounded border px-3 py-2 text-sm bg-background font-mono resize-none"
                      placeholder="Paste your markdown here..."
                      value={pastedMarkdown}
                      onChange={(e) => setPastedMarkdown(e.target.value)}
                      disabled={isImporting}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Upload a markdown file. Please refer to the instructions below for the required format.
                    </p>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".md,.markdown,.txt"
                        onChange={handleImportFile}
                        disabled={isImporting}
                        className="hidden"
                        id="import-file-input"
                      />
                      <label htmlFor="import-file-input">
                        <Button
                          asChild
                          variant="outline"
                          disabled={isImporting}
                          className="w-full cursor-pointer"
                        >
                          <span className="flex items-center justify-center gap-2">
                            <Upload className="h-4 w-4" />
                            {isImporting ? 'Importing...' : 'Choose Markdown File'}
                          </span>
                        </Button>
                      </label>
                    </div>

                    {/* Hidden input for one-click DO import */}
                    <input
                      ref={oneClickFileInputRef}
                      type="file"
                      accept=".md,.markdown,.txt"
                      onChange={handleOneClickFile}
                      className="hidden"
                      id="one-click-import-file-input"
                    />
                  </div>
                )
              )}

              {/* Hide format instructions when progress is shown */}
              {importProgress.length === 0 && (
                <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-500 dark:border-blue-700 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="h-8 w-8 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">Markdown Format Instructions</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                          onClick={() => {
                      const instructions = `Please format my RCDO (Rallying Cry, Defining Objectives, and Strategic Initiatives) data according to the following markdown structure:

## STRUCTURE OVERVIEW

1. **Document Title** (H1): Main heading for your planning period
   Example: # H1 2026 Rallying Cry, Defining Objectives & Strategic Initiatives

2. **Rallying Cry Section**:
   - Use ## header: ## Rallying Cry — [Period]
   - Place rallying cry in blockquote with bold formatting: > **Your rallying cry text**
   - Followed by a horizontal rule: ---

3. **Defining Objectives** (repeat for each DO):
   - Use ## header with format: ## DO #[number] — [Title]
   - Optional: Add owner in parentheses: ## DO #1 — Title (Owner: Jane Doe)
   - Follow with **Definition** section containing description
   - Add **Primary Success Metric** section with bullet point(s)
   - Include ### Strategic Initiatives subsection
   - List initiatives as numbered items: 1. **Initiative Title**
     - Optional: Add owner: 1. **Initiative Title (Owner: John Smith)**
     - Sub-bullets for initiative details (use * or -)
   - End each DO with horizontal rule: ---

## COMPLETE EXAMPLE

# H1 2026 Rallying Cry, Defining Objectives & Strategic Initiatives

## Rallying Cry — H1 2026

> **Fuel customer growth and retention through disciplined execution**

---

## DO #1 — Improve Operational Efficiency (Owner: Jane Doe)

**Definition**

Building and strengthening foundations to provide clarity and resources to enable individual success and cross-functional collaboration that drive improved business outcomes consistently.

**Primary Success Metric**

* OpEx management and achievement of SI-level metrics.

### Strategic Initiatives

1. **Process Standardization & Optimization (Owner: John Smith)**

   * Create and roll out templated SOPs for critical roles and processes
   * Identify and address 3–5 of the most critical process gaps

2. **Drive Resource Efficiency**

   * Successfully execute the H1 rightshoring/techshoring plan
   * Ensure the right talent is in the right roles

---

## DO #2 — Improve Customer Retention

**Definition**

We aim to predict, prevent, and intervene on customer risk to improve customer retention and drive increased revenue.

**Primary Success Metric**

* Leading indicators of churn (customer health, adoption score, etc.)

### Strategic Initiatives

1. **Product-Related Churn Taskforce**

   * Improve usage data availability
   * Establish a triage/prioritization process

2. **Integrations Taskforce**

   * Focus on integration-related drivers of churn

---

## KEY FORMATTING RULES

- Use em dash (—) or en dash (–) or hyphen (-) after DO numbers
- Keep consistent indentation for sub-bullets (3 spaces)
- Bold important section headers: **Definition**, **Primary Success Metric**
- Bold initiative titles within numbered lists: 1. **Title**
- Use blockquote (>) only for the rallying cry
- Separate each DO with horizontal rule (---)
- Owner attribution is optional and uses format: (Owner: Name)
- Owner names match against user email, first name, last name, or full name
- If owner not specified or not found, the importing user is assigned`;
                      
                      navigator.clipboard.writeText(instructions);
                      toast({
                        title: "Copied!",
                        description: "Format instructions copied to clipboard",
                      });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Instructions
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-blue-800 dark:text-blue-200">Copy the instructions above and provide them to your favorite LLM along with your RCDO content.</p>
                        <div className="text-xs space-y-1.5 pl-3 border-l-2 border-blue-400 dark:border-blue-600">
                          <p className="font-medium text-blue-900 dark:text-blue-100">Quick Reference:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2 text-blue-800 dark:text-blue-200">
                            <li>Rallying Cry: <code className="text-xs bg-white dark:bg-blue-900 px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700">&gt; **Text**</code></li>
                            <li>Defining Objectives: <code className="text-xs bg-white dark:bg-blue-900 px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700">## DO #1 — Title</code></li>
                            <li>Strategic Initiatives: <code className="text-xs bg-white dark:bg-blue-900 px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700">1. **Initiative**</code></li>
                            <li>Sections: <code className="text-xs bg-white dark:bg-blue-900 px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700">**Definition**</code>, <code className="text-xs bg-white dark:bg-blue-900 px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700">**Primary Success Metric**</code></li>
                            <li>Owners (optional): <code className="text-xs bg-white dark:bg-blue-900 px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700">(Owner: Name)</code></li>
                          </ul>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-2 italic">
                            Owner names match against user email, first name, last name, or full name. If not specified or not found, the importing user is used.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              {/* Show different buttons based on state */}
              {isImporting ? (
                <Button variant="outline" disabled>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </Button>
              ) : importProgress.length > 0 ? (
                <Button
                  onClick={() => {
                    setShowImportDialog(false);
                    setImportStatus(null);
                    setImportProgress([]);
                    setPastedMarkdown('');
                  }}
                  className={importProgress.every(p => p.status === 'success') ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  {importProgress.every(p => p.status === 'success' || p.status === 'error') ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Done
                    </>
                  ) : (
                    'Close'
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportStatus(null);
                      setPastedMarkdown('');
                    }}
                  >
                    Cancel
                  </Button>
                  {importMode === 'paste' && (
                    <Button
                      onClick={handleImportPasted}
                      disabled={!pastedMarkdown.trim()}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Import
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}