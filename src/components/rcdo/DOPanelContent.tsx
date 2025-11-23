import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MoreVertical, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import FancyAvatar from '@/components/ui/fancy-avatar';
import RichTextEditor from '@/components/ui/rich-text-editor-lazy';
import type { Tables } from '@/integrations/supabase/types';
import type { Node } from 'reactflow';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

// Import NodeData type from StrategyCanvas
type NodeData = {
  title: string;
  status?: "draft" | "final";
  ownerId?: string;
  hypothesis?: string;
  primarySuccessMetric?: string;
  parentDoId?: string;
  bgColor?: string;
  size?: { w: number; h: number };
  titleCandidates?: string[];
  saiItems?: Array<{
    id: string;
    title: string;
    ownerId?: string;
    participantIds?: string[];
    ownerName?: string;
    ownerAvatarUrl?: string;
    metric?: string;
    description?: string;
    dbId?: string;
  }>;
  rallyCandidates?: string[];
  rallySelectedIndex?: number;
  rallyFinalized?: boolean;
};

interface DOPanelContentProps {
  selectedNode: Node<NodeData>;
  doLockedStatus: Map<string, { locked: boolean; dbId?: string }>;
  profilesMap: Record<string, Tables<'profiles'>>;
  profiles: Tables<'profiles'>[];
  nodes: Node<NodeData>[];
  setNodes: (nodes: Node<NodeData>[] | ((prev: Node<NodeData>[]) => Node<NodeData>[])) => void;
  setSelectedNode: (node: Node<NodeData> | null) => void;
  advancedOptionsOpen: boolean;
  setAdvancedOptionsOpen: (open: boolean) => void;
  duplicateSelectedDo: () => void;
  deleteSelectedDo: () => void;
  addSaiToSelectedDo: () => void;
  setFocusedSI: (si: { doId: string; siId: string } | null) => void;
  navigate: (path: string) => void;
  closePanel: () => void;
}

export function DOPanelContent({
  selectedNode,
  doLockedStatus,
  profilesMap,
  profiles,
  nodes,
  setNodes,
  setSelectedNode,
  advancedOptionsOpen,
  setAdvancedOptionsOpen,
  duplicateSelectedDo,
  deleteSelectedDo,
  addSaiToSelectedDo,
  setFocusedSI,
  navigate,
  closePanel,
}: DOPanelContentProps) {
  const navigateHook = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Check if DO is locked
  const doStatus = doLockedStatus.get(selectedNode.id);
  const isLocked = doStatus?.locked ?? false;
  const dbId = doStatus?.dbId;
  
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  const owner = selectedNode.data.ownerId ? profilesMap[selectedNode.data.ownerId] : undefined;
  const ownerDisplayName = owner?.full_name || 'Unknown';

  const handleUpdate = (patch: Partial<NodeData>) => {
    if (isLocked) return;
    const next = nodes.map(n => 
      n.id === selectedNode.id 
        ? { ...n, data: { ...n.data, ...patch } } 
        : n
    );
    setNodes(next);
    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ...patch } });
  };

  const handleOwnerChange = async (val: string) => {
    if (isLocked) return;
    handleUpdate({ ownerId: val || undefined });

    // Persist to DB if DO is linked to a DB row
    try {
      if (dbId && val) {
        const { error } = await supabase
          .from('rc_defining_objectives')
          .update({ owner_user_id: val })
          .eq('id', dbId);
        if (error) {
          console.warn('[DOPanel] Failed to persist DO owner change', error);
          toast({ title: 'Update failed', description: 'Could not save owner change', variant: 'destructive' });
        }
      }
    } catch (e) {
      console.warn('[DOPanel] Error updating DO owner in DB', e);
    }
  };

  const handleSIClick = (siId: string) => {
    setFocusedSI({ doId: selectedNode.id, siId });
  };

  const panelContent = (
    <>
      <div className="mb-3">
        <span className="text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-slate-600 text-white">Defining Objective</span>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{selectedNode.data.title || "Untitled DO"}</h3>
          {isLocked && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border">locked</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {dbId && (
            <button
              className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]"
              aria-label="Open in full page"
              onClick={() => {
                navigateHook(`/rcdo/detail/do/${dbId}`);
                if (isMobile) closePanel();
              }}
              title="Open in full page"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={duplicateSelectedDo}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onClick={deleteSelectedDo}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="h-10 w-10 inline-flex items-center justify-center rounded hover:bg-accent min-h-[44px] min-w-[44px]" aria-label="Close" onClick={closePanel}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {/* 1. Title */}
        <div>
          <label className={`text-sm font-medium ${!selectedNode.data.title || selectedNode.data.title.trim() === '' ? 'text-red-600 dark:text-red-400' : ''}`}>Name</label>
          <input 
            className="w-full rounded border px-2 py-1 text-sm bg-background mt-1" 
            value={selectedNode.data.title || ""} 
            onChange={(e) => { if (isLocked) return; handleUpdate({ title: e.target.value }); }} 
            disabled={isLocked}
            placeholder="Name this DO"
          />
        </div>
        
        {/* 2. Definition & Hypothesis */}
        <div>
          <label className={`text-sm font-medium ${!selectedNode.data.hypothesis || selectedNode.data.hypothesis.trim().replace(/<[^>]*>/g, '').trim() === '' ? 'text-red-600 dark:text-red-400' : ''}`}>Definition & Hypothesis</label>
          <div className="mt-1">
            <RichTextEditor
              content={selectedNode.data.hypothesis || ""}
              onChange={(content) => { if (isLocked) return; handleUpdate({ hypothesis: content }); }}
              placeholder="If we do X, then Y will happen because Z..."
              minHeight="96px"
            />
          </div>
        </div>
        
        {/* 3. Primary Success Metric */}
        <div>
          <label className={`text-sm font-medium ${!selectedNode.data.primarySuccessMetric || selectedNode.data.primarySuccessMetric.trim() === '' ? 'text-red-600 dark:text-red-400' : ''}`}>Primary Success Metric</label>
          <textarea 
            className="mt-1 w-full rounded border px-2 py-2 text-sm bg-background resize-none" 
            rows={3}
            placeholder="e.g., OpEx management and achievement of SI-level metrics" 
            value={selectedNode.data.primarySuccessMetric || ""} 
            onChange={(e) => { if (isLocked) return; handleUpdate({ primarySuccessMetric: e.target.value }); }}
            disabled={isLocked}
            style={{ 
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              whiteSpace: 'pre-wrap'
            }}
          />
        </div>
        
        {/* 4. Owner */}
        <div>
          {(() => {
            const owner = selectedNode.data.ownerId ? profilesMap[selectedNode.data.ownerId] : null;
            const displayName = owner?.full_name || '';
            const isUnknown = !selectedNode.data.ownerId || !owner || !displayName || displayName.trim().toLowerCase() === 'unknown';
            return (
              <label className={`text-sm font-medium ${isUnknown ? 'text-red-600 dark:text-red-400' : ''}`}>Owner</label>
            );
          })()}
          <div className="mt-1">
            <Select
              value={selectedNode.data.ownerId || ""}
              disabled={isLocked}
              onValueChange={handleOwnerChange}
            >
              <SelectTrigger className="flex-1" disabled={isLocked}>
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
              <SelectContent className="z-[60]">
                {profiles.length === 0 ? (
                  <div className="py-2 px-2 text-sm text-muted-foreground text-center">
                    No profiles available
                  </div>
                ) : (
                  profiles.map((p) => {
                    const displayName = p.full_name || '';
                    const isUnknown = !displayName || displayName.trim().toLowerCase() === 'unknown';
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px]">
                            {isUnknown ? (
                              <span className="font-semibold">?</span>
                            ) : (
                              <FancyAvatar name={p.avatar_name || displayName} displayName={displayName} avatarUrl={p.avatar_url} size="sm" />
                            )}
                          </span>
                          <span>{isUnknown ? 'Unknown' : displayName}</span>
                        </span>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* 5. Strategic Initiatives */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Strategic Initiatives</label>
            {!isLocked && (
              <Button
                size="sm"
                variant="outline"
                onClick={addSaiToSelectedDo}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {selectedNode.data.saiItems && selectedNode.data.saiItems.length > 0 ? (
              selectedNode.data.saiItems.map((si) => (
                <button
                  key={si.id}
                  onClick={() => handleSIClick(si.id)}
                  className="w-full text-left p-2 rounded border hover:bg-accent transition-colors"
                  disabled={isLocked}
                >
                  <div className="text-sm font-medium">{si.title || "Untitled SI"}</div>
                  {si.metric && (
                    <div className="text-xs text-muted-foreground mt-1">{si.metric}</div>
                  )}
                </button>
              ))
            ) : (
              <div className="text-sm text-muted-foreground py-2">No strategic initiatives yet</div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  // Mobile: Use Sheet (bottom sheet)
  if (isMobile) {
    return (
      <div>
        {panelContent}
      </div>
    );
  }

  // Desktop: Content is rendered in parent's fixed panel
  return <div>{panelContent}</div>;
}

