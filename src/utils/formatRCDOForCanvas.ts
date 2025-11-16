/**
 * Format RCDO for Canvas
 * Converts parsed RCDO data into ReactFlow nodes and edges
 */

import type { Node, Edge } from 'reactflow';
import { MarkerType } from 'reactflow';
import type { ParsedRCDO } from './markdownRCDOParser';

type NodeKind = "strategy" | "do" | "sai" | "rally";

type NodeData = {
  title: string;
  status?: "draft" | "final";
  ownerId?: string;
  hypothesis?: string;
  parentDoId?: string;
  bgColor?: string;
  size?: { w: number; h: number };
  saiItems?: Array<{
    id: string;
    title: string;
    ownerId?: string;
    ownerName?: string;
    ownerAvatarUrl?: string;
    metric?: string;
    description?: string;
  }>;
  rallyCandidates?: string[];
  rallySelectedIndex?: number;
  rallyFinalized?: boolean;
};

const ROOT_ID = "rally-1";

interface CanvasLayout {
  nodes: Node<NodeData>[];
  edges: Edge[];
}

/**
 * Converts parsed RCDO data into canvas nodes and edges
 */
export function formatRCDOForCanvas(data: ParsedRCDO): CanvasLayout {
  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];

  // 1. Create Rallying Cry node (at top center)
  const baseX = 400;
  const baseY = 80;
  
  nodes.push({
    id: ROOT_ID,
    type: "rally",
    position: { x: baseX, y: baseY },
    data: {
      title: "",
      rallyCandidates: [data.rallyingCry],
      rallySelectedIndex: 0,
      rallyFinalized: true,
      size: { w: 280, h: 100 },
    },
  });

  // 2. Create DO nodes (positioned below RC in a row)
  const startY = baseY + 180;
  const doCount = data.definingObjectives.length;
  
  // Calculate horizontal spacing to distribute DOs evenly
  const gapX = 320;
  const totalWidth = (doCount - 1) * gapX;
  const startX = baseX - totalWidth / 2;

  data.definingObjectives.forEach((do_, index) => {
    const doId = `do-${index + 1}`;
    const posX = startX + (index * gapX);

    // Convert SI data to embedded saiItems format
    const saiItems = do_.strategicInitiatives.map((si, siIndex) => ({
      id: `si-${doId}-${siIndex + 1}`,
      title: si.title,
      ownerId: undefined,
      description: si.bullets.length > 0 
        ? si.bullets.map(b => `• ${b}`).join('\n')
        : si.description,
      metric: '', // Can be populated if SI has specific metrics
    }));

    nodes.push({
      id: doId,
      type: "do",
      position: { x: posX, y: startY },
      data: {
        title: do_.title,
        status: "draft",
        hypothesis: do_.definition,
        saiItems: saiItems,
        size: { w: 260, h: 110 },
      },
    });

    // Create edge from RC to DO
    edges.push({
      id: `e-rc-${doId}`,
      source: ROOT_ID,
      target: doId,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  });

  return { nodes, edges };
}

/**
 * Helper to find non-overlapping position for a node
 */
function findNonOverlappingPosition(
  existingNodes: Node<NodeData>[],
  type: NodeKind,
  startX: number,
  startY: number
): { x: number; y: number } {
  const DEFAULT_NODE_DIMENSIONS: Record<NodeKind, { w: number; h: number }> = {
    strategy: { w: 180, h: 64 },
    do: { w: 260, h: 110 },
    sai: { w: 160, h: 48 },
    rally: { w: 280, h: 100 },
  };

  function rectForNode(n: Node<NodeData>) {
    const data = (n.data as NodeData) || {};
    const kind = (n.type as NodeKind) || "do";
    const w = data.size?.w || DEFAULT_NODE_DIMENSIONS[kind].w;
    const h = data.size?.h || DEFAULT_NODE_DIMENSIONS[kind].h;
    return { x: n.position.x, y: n.position.y, w, h };
  }

  function overlaps(a: ReturnType<typeof rectForNode>, b: ReturnType<typeof rectForNode>) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  let x = startX;
  let y = startY;
  let attempts = 0;
  const maxAttempts = 500;
  const { w, h } = DEFAULT_NODE_DIMENSIONS[type];

  while (attempts < maxAttempts) {
    const testRect = { x, y, w, h };
    const collides = existingNodes.some((n) => overlaps(testRect, rectForNode(n)));
    
    if (!collides) {
      return { x, y };
    }

    x += 40;
    y += 40;
    attempts++;
  }

  return { x: startX, y: startY };
}

