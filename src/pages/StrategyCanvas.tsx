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
import { Plus, MoreVertical, X, ArrowLeft, LogOut, Settings, User, ChevronDown } from "lucide-react";
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

// Types
type NodeKind = "strategy" | "do" | "sai" | "rally";

type NodeData = {
  title: string;
  status?: "draft" | "final";
  ownerId?: string; // owner user ID for DOs
  hypothesis?: string; // DO hypothesis (rich text)
  parentDoId?: string; // only for legacy SI nodes (no longer used)
  bgColor?: string; // node background color
  size?: { w: number; h: number }; // optional fixed size per node
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

function DoNode({ id, data }: NodeProps<NodeData>) {
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
      className={`rounded-lg border shadow p-3 min-w-[160px] flex flex-col ${status === "final" ? "border-green-500" : "border-muted"}`}
      style={{ backgroundColor: data.bgColor || "#ffffff", width: data.size?.w, minHeight: data.size?.h }}
    >
      <div className="flex items-start justify-between gap-2 flex-shrink-0">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-foreground/80 whitespace-nowrap">Defining Objective</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded bg-muted/60 whitespace-nowrap`}>{status}</span>
      </div>
      <div className="flex items-start gap-2 mt-2">
        {owner && (
          <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] flex-shrink-0 mt-0.5">
            <FancyAvatar 
              name={owner.avatar_name || owner.full_name} 
              displayName={owner.full_name} 
              size="sm" 
            />
          </span>
        )}
        <textarea
          ref={textareaRef}
          className="flex-1 w-full bg-transparent outline-none text-xs font-semibold resize-none overflow-hidden leading-tight"
          defaultValue={data.title}
          placeholder="Name this DO"
          onBlur={(e) => {
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
        <div className="mt-2 flex flex-col gap-1.5 flex-shrink-0">
          {items.map((it) => (
            <button
              key={it.id}
              className="group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-background hover:bg-accent w-full"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("rcdo:open-si", { detail: { doId: id, siId: it.id } }));
              }}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] flex-shrink-0">
                {(() => {
                  const prof = it.ownerId ? profilesMap[it.ownerId] : undefined;
                  if (prof?.avatar_name || prof?.full_name) {
                    return <FancyAvatar name={prof.avatar_name || prof.full_name} displayName={prof.full_name} size="sm" />;
                  }
                  const letter = (it.ownerName?.charAt(0).toUpperCase() || "?");
                  return <span className="text-[10px] leading-none">{letter}</span>;
                })()}
              </span>
              <span className="text-[11px] leading-tight break-words text-left flex-1">{it.title || "Untitled SI"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const bg = data.bgColor || "#ffffff";
  const headline = data.rallyCandidates?.[0] || data.title || "Double‑click to edit candidates";
  return (
    <div className="rounded-lg border shadow p-3 min-w-[220px] flex flex-col" style={{ backgroundColor: bg, width: data.size?.w, height: data.size?.h }}>
      <div className="flex items-start justify-between gap-2 flex-shrink-0">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-foreground/80 whitespace-nowrap">Rallying Cry</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${finalized ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
          {finalized ? "final" : "ideating"}
        </span>
      </div>
      <div className="mt-2 text-sm font-semibold leading-tight text-foreground break-words overflow-hidden">
        {headline}
      </div>
    </div>
  );
}

const nodeTypes = {
  strategy: StrategyNode,
  do: DoNode,
  // si nodes are legacy; kept for compatibility but not created anymore
  sai: SaiNode,
  rally: RallyNode,
};

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
              <label className="block text-sm font-medium">Label (optional)</label>
              <input
                className="w-full rounded border px-2 py-1 text-sm bg-background"
                value={selectedNode?.data.title || ""}
                onChange={(e) => {
                  const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, title: e.target.value } } : n);
                  setNodes(next);
                  setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, title: e.target.value } });
                }}
                placeholder="Optional label for the RC box"
              />

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
                      {i > 0 && !selectedNode.data.rallyFinalized && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const arr = [...(selectedNode.data.rallyCandidates || [])];
                            const [picked] = arr.splice(i, 1);
                            arr.unshift(picked);
                            const next = nodes.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, rallyCandidates: arr } } : n);
                            setNodes(next);
                            setSelectedNode({ ...selectedNode!, data: { ...selectedNode!.data, rallyCandidates: arr } });
                          }}
                        >
                          Top
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
                  placeholder="Name this DO"
                />

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
                    <SelectTrigger className="w-full h-9">
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

                {/* Hypothesis Field */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Hypothesis (Optional)</label>
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
                      <label className="text-sm font-medium">Metric</label>
                      <input className="mt-1 w-full rounded border px-2 py-1 text-sm bg-background" placeholder="e.g., % conversion, NPS, etc." value={si.metric || ""} onChange={(e)=>update({ metric: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <div className="mt-1">
                        <RichTextEditor
                          content={si.description || ""}
                          onChange={(content) => update({ description: content })}
                          placeholder="What is this initiative?"
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
    </div>
  );
}