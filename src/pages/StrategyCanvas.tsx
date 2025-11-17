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
} from "reactflow";
import "reactflow/dist/style.css";
import { Plus, MoreVertical, X, ArrowLeft, LogOut, Settings, User, ChevronDown, ChevronUp, Upload, AlertCircle, CheckCircle2, Loader2, Copy, Info, FileText } from "lucide-react";
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
    // legacy fields (rendered if ownerId missing)
    ownerName?: string;
    ownerAvatarUrl?: string;
    metric?: string;
    description?: string;
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

// Create a factory function that accepts profilesMap
const createDoNode = (profilesMap: Record<string, any>) => {
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
          ? "border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30" 
          : "border-blue-400 dark:border-blue-600 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20"
      }`}
      style={{ 
        backgroundColor: data.bgColor, 
        width: data.size?.w, 
        minHeight: data.size?.h,
        boxShadow: status === "final" ? "0 4px 20px rgba(34, 197, 94, 0.15)" : "0 4px 20px rgba(59, 130, 246, 0.15)"
      }}
    >
      {/* Decorative corner accent */}
      <div className={`absolute top-0 right-0 w-20 h-20 ${
        status === "final" ? "bg-green-500/10" : "bg-blue-500/10"
      } rounded-bl-full`} />
      
      <div className="flex items-start justify-between gap-2 flex-shrink-0 relative z-10">
        <span className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap ${
          status === "final"
            ? "bg-green-500 text-white"
            : "bg-blue-500 text-white"
        }`}>Defining Objective</span>
        <span className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap ${
          status === "final"
            ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
            : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
        }`}>{status}</span>
      </div>
      <div className="flex items-start gap-2 mt-3 relative z-10">
        <span className={`inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 text-[10px] flex-shrink-0 mt-0.5 ${
          status === "final"
            ? "bg-white border-green-500 dark:bg-green-900/20 dark:border-green-400"
            : "bg-white border-blue-500 dark:bg-blue-900/20 dark:border-blue-400"
        }`}>
          {owner ? (
            <FancyAvatar 
              name={owner.avatar_name || owner.full_name} 
              displayName={owner.full_name} 
              size="sm" 
            />
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">?</span>
          )}
        </span>
        <textarea
          ref={textareaRef}
          className={`flex-1 w-full bg-transparent outline-none text-sm font-bold resize-none overflow-hidden leading-tight ${
            status === "final"
              ? "text-green-900 dark:text-green-100"
              : "text-blue-900 dark:text-blue-100"
          }`}
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
              className={`group flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-medium w-full transition-all hover:scale-[1.02] ${
                status === "final"
                  ? "bg-white/80 border-green-300 hover:bg-white hover:border-green-500 dark:bg-green-900/10 dark:border-green-700 dark:hover:bg-green-900/20"
                  : "bg-white/80 border-blue-300 hover:bg-white hover:border-blue-500 dark:bg-blue-900/10 dark:border-blue-700 dark:hover:bg-blue-900/20"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("rcdo:open-si", { detail: { doId: id, siId: it.id } }));
              }}
            >
              <span className={`inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border text-[10px] flex-shrink-0 ${
                status === "final"
                  ? "bg-green-50 border-green-400 dark:bg-green-900/30 dark:border-green-600"
                  : "bg-blue-50 border-blue-400 dark:bg-blue-900/30 dark:border-blue-600"
              }`}>
                {(() => {
                  const prof = it.ownerId ? profilesMap[it.ownerId] : undefined;
                  if (prof?.avatar_name || prof?.full_name) {
                    return <FancyAvatar name={prof.avatar_name || prof.full_name} displayName={prof.full_name} size="sm" />;
                  }
                  const letter = (it.ownerName?.charAt(0).toUpperCase() || "?");
                  return <span className="text-[10px] leading-none font-semibold">{letter}</span>;
                })()}
              </span>
              <span className={`text-[11px] leading-tight break-words text-left flex-1 ${
                status === "final"
                  ? "text-green-900 dark:text-green-100"
                  : "text-blue-900 dark:text-blue-100"
              }`}>{it.title || "Untitled SI"}</span>
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
          {finalized ? "final" : "ideating"}
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
  const providerRef = useRef<WebsocketProvider | null>(null);
  const updatingFromRemoteNodes = useRef(false);
  const updatingFromRemoteEdges = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

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
  
  // Create node types with access to profilesMap
  const nodeTypes = useMemo(() => ({
    strategy: StrategyNode,
    do: createDoNode(profilesMap),
    sai: SaiNode,
    rally: RallyNode,
  }), [profilesMap]);
  
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

  // Header state (logo/tabs/avatar)
  const activeTab = location.pathname.includes('/dashboard/rcdo') ? 'rcdo' : 'main';
  const [headerProfile, setHeaderProfile] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, full_name, avatar_name, avatar_url, email')
          .eq('id', user.id)
          .maybeSingle();
        if (profileData) setHeaderProfile(profileData);
      }
    })();
  }, []);
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };
  const handleTabChange = (value: string) => {
    if (value === 'main') navigate('/dashboard/main');
    else if (value === 'rcdo') navigate('/dashboard/rcdo');
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

  // Load initial canvas from Supabase (if present)
  useEffect(() => {
    if (!cycleId) return;
    
    (async () => {
      const { data, error } = await supabase
        .from('rc_canvas_states')
        .select('nodes, edges')
        .eq('room', roomName)
        .maybeSingle();
      if (!error && data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
        setNodes(data.nodes as any);
        setEdges(data.edges as any);
      }
    })();
  }, [cycleId, roomName]);

  // Load platform profiles (logged in or invited)
  useEffect(() => {
    supabase.from('profiles').select('id, full_name, avatar_name, avatar_url').then(({ data, error }) => {
      if (!error && data) setProfiles(data as any);
    });
  }, []);

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
  const processMarkdownImport = useCallback(async (markdownText: string, skipWarning = false) => {
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

      setImportStatus({ 
        type: 'success', 
        message: `Successfully imported: ${parsedData.definingObjectives.length} DOs with ${parsedData.definingObjectives.reduce((sum, d) => sum + d.strategicInitiatives.length, 0)} Strategic Initiatives` 
      });

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
                <TabsTrigger value="main" className="px-6">Meetings</TabsTrigger>
                <TabsTrigger value="rcdo" className="px-6">RCDO</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Right: Avatar + name clickable */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 cursor-pointer rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground ring-1 ring-sky-300/70 ring-offset-2 ring-offset-white shadow-sm hover:shadow-md transition-colors transition-shadow" role="button" aria-label="Open account menu">
                  <FancyAvatar
                    name={(headerProfile?.avatar_name && headerProfile.avatar_name.trim())
                      || `${(headerProfile?.first_name || '')} ${(headerProfile?.last_name || '')}`.trim()
                      || (headerProfile?.full_name || '')
                      || (headerProfile?.email || 'User')}
                    displayName={`${(headerProfile?.first_name || '')} ${(headerProfile?.last_name || '')}`.trim() || (headerProfile?.email?.split('@')[0] || 'U')}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <div className="flex flex-col items-start min-w-0 overflow-hidden">
                    <span className="text-sm leading-none truncate max-w-full">
                      {`${headerProfile?.first_name || headerProfile?.email || ''} ${headerProfile?.last_name || ''}`.trim()}
                    </span>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Canvas toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-background">
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => navigate('/dashboard/rcdo')}
          className="flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Strategies
        </Button>
        <div className="h-5 w-px bg-muted" />
        <Button size="sm" onClick={addDo} className="flex items-center gap-1"><Plus className="h-4 w-4" /> Add DO</Button>
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => {
            setShowImportDialog(true);
            setImportProgress([]);
            setImportStatus(null);
            setPastedMarkdown('');
          }} 
          className="flex items-center gap-1"
        >
          <Upload className="h-4 w-4" /> Import from File
        </Button>
        <div className="ml-auto text-xs text-muted-foreground pr-2">Top box is the Rallying Cry. Start with 4 DOs; SIs support only one DO.</div>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
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
              <h3 className="text-base font-semibold">Edit DO</h3>
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
                <label className="block text-sm font-medium">
                  {selectedNode.data.status === "final" ? "Name" : "Name Candidates"}
                </label>
                
                {selectedNode.data.status === "final" ? (
                  // Final mode: just show the locked title
                  <input
                    className="w-full rounded border px-2 py-1 text-sm bg-background"
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
                  <div className="space-y-2">
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

                <div className="flex items-center gap-2">
                  <label className="text-sm">Status</label>
                  <select
                    className="rounded border bg-background px-2 py-1 text-sm"
                    value={selectedNode.data.status || "draft"}
                    onChange={(e) => {
                      if (!selectedNode) return;
                      const value = e.target.value as "draft" | "final";
                      const next = nodes.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, status: value } } : n);
                      setNodes(next);
                      setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, status: value } });
                    }}
                  >
                    <option value="draft">draft</option>
                    <option value="final">final</option>
                  </select>
                </div>

                {/* Owner Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Owner</label>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-muted text-xs flex-shrink-0">
                      {(() => {
                        const owner = selectedNode.data.ownerId ? profilesMap[selectedNode.data.ownerId] : undefined;
                        if (owner) return <FancyAvatar name={owner.avatar_name || owner.full_name} displayName={owner.full_name} size="sm" />;
                        return <span className="text-xs">?</span>;
                      })()}
                    </span>
                    <Select
                      value={selectedNode.data.ownerId || ""}
                      onValueChange={(val) => {
                        if (!selectedNode) return;
                        const next = nodes.map((n) => 
                          n.id === selectedNode.id ? { ...n, data: { ...n.data, ownerId: val || undefined } } : n
                        );
                        setNodes(next);
                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ownerId: val || undefined } });
                      }}
                    >
                      <SelectTrigger className="flex-1 h-9">
                        <SelectValue placeholder="Select owner">
                          {selectedNode.data.ownerId && (() => {
                            const owner = profilesMap[selectedNode.data.ownerId];
                            return owner ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                                  <FancyAvatar 
                                    name={owner.avatar_name || owner.full_name} 
                                    displayName={owner.full_name} 
                                    size="sm" 
                                  />
                                </span>
                                <span className="text-sm">{owner.full_name}</span>
                              </div>
                            ) : null;
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                                <FancyAvatar 
                                  name={p.avatar_name || p.full_name} 
                                  displayName={p.full_name} 
                                  size="sm" 
                                />
                              </span>
                              <span>{p.full_name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Hypothesis Field */}
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

                {/* Primary Success Metric Field */}
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

                <div className="pt-4 space-y-2">
                  <div className="text-sm font-medium">Strategic Initiatives</div>
                  <div className="space-y-2 max-h-48 overflow-auto pr-1">
                    {(selectedNode?.data.saiItems || []).map((it) => (
                      <button
                        key={it.id}
                        className="w-full flex items-center gap-2 rounded border px-2 py-1 text-xs bg-background hover:bg-accent"
                        onClick={() => setFocusedSI({ doId: selectedNode!.id, siId: it.id })}
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                          {it.ownerAvatarUrl ? (
                            <img src={it.ownerAvatarUrl} className="h-full w-full object-cover" />
                          ) : (
                            (it.ownerName?.charAt(0).toUpperCase() || "?")
                          )}
                        </span>
                        <span className="flex-1 truncate text-left">{it.title || "Untitled SI"}</span>
                      </button>
                    ))}
                  </div>
                  <div className="pt-2">
                    <Button size="sm" className="w-full" onClick={addSaiToSelectedDo}>+ Add SI under this DO</Button>
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
      {focusedSI && (
        <>
          {/* Only show an overlay if the DO panel is NOT open */}
          {selectedNode?.type !== "do" && (
            <div className="fixed inset-0 z-[55] bg-black/30" onClick={() => setFocusedSI(null)} />
          )}
          <div
            className={
              // If DO panel is open (right: 380px), place SI panel immediately to its left; otherwise dock to the right edge
              `fixed top-0 h-full w-[420px] bg-background border-l shadow-2xl p-4 flex flex-col overflow-y-auto z-[60] ` +
              (selectedNode?.type === "do" ? "right-[380px]" : "right-0")
            }
          >
            {(() => {
              const doNode = nodes.find(n => n.id === focusedSI.doId);
              const si = doNode?.data.saiItems?.find(x => x.id === focusedSI.siId);
              if (!doNode || !si) return <div className="text-sm">Not found</div>;
              const update = (patch: Partial<typeof si>) => {
                const next = nodes.map(n => n.id === doNode.id ? { ...n, data: { ...n.data, saiItems: (n.data.saiItems||[]).map(x => x.id===si.id ? { ...x, ...patch } : x) } } : n);
                setNodes(next);
              };
              const duplicateSI = () => {
                const newId = `si-${Math.random().toString(36).slice(2,7)}`;
                const next = nodes.map(n => n.id === doNode.id ? { ...n, data: { ...n.data, saiItems: [...(n.data.saiItems||[]), { ...si, id: newId, title: `${si.title || "Untitled SI"} (copy)` }] } } : n);
                setNodes(next);
                setFocusedSI({ doId: doNode.id, siId: newId });
              };
              const deleteSI = () => {
                const next = nodes.map(n => n.id === doNode.id ? { ...n, data: { ...n.data, saiItems: (n.data.saiItems||[]).filter(x => x.id !== si.id) } } : n);
                setNodes(next);
                setFocusedSI(null);
              };
              return (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{si.title || "Untitled Initiative"}</h3>
                    <div className="flex items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="More actions">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={duplicateSI}>Duplicate</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={deleteSI}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <button className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent" aria-label="Close" onClick={() => setFocusedSI(null)}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="text-sm font-medium">Name</label>
                      <input className="mt-1 w-full rounded border px-2 py-1 text-sm bg-background" value={si.title} onChange={(e)=>update({ title: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Owner</label>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-muted text-xs">
                          {(() => {
                            const prof = si.ownerId ? profilesMap[si.ownerId] : undefined;
                            if (prof) return <FancyAvatar name={prof.avatar_name || prof.full_name} displayName={prof.full_name} size="sm" />;
                            return <span className="text-xs">?</span>;
                          })()}
                        </span>
                        <Select
                          value={si.ownerId || ""}
                          onValueChange={(val) => update({ ownerId: val || undefined })}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select owner" />
                          </SelectTrigger>
                          <SelectContent>
                            {profiles.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                <span className="inline-flex items-center gap-2">
                                  <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                                    <FancyAvatar name={p.avatar_name || p.full_name} displayName={p.full_name} size="sm" />
                                  </span>
                                  <span>{p.full_name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Primary Success Metric</label>
                      <textarea 
                        className="mt-1 w-full rounded border px-2 py-2 text-sm bg-background resize-none" 
                        rows={3}
                        placeholder="e.g., % conversion, NPS, etc." 
                        value={si.metric || ""} 
                        onChange={(e)=>update({ metric: e.target.value })}
                        style={{ 
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          whiteSpace: 'pre-wrap'
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <div className="mt-1">
                        <RichTextEditor
                          content={si.description || ""}
                          onChange={(content) => update({ description: content })}
                          placeholder="What is this initiative?"
                          minHeight="96px"
                        />
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}

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