import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, MoreVertical, ExternalLink, Plus, Lock, Unlock, Pencil } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { OwnerCombobox } from '@/components/ui/owner-combobox';
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
    benchmark?: string;
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
  onLockDO?: () => void;
  onUnlockDO?: () => void;
  canLock?: boolean;
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
  onLockDO,
  onUnlockDO,
  canLock,
}: DOPanelContentProps) {
  const navigateHook = useNavigate();
  const [panelSearchParams] = useSearchParams();
  const cycleParam = panelSearchParams.get('cycle');
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(selectedNode.data.title || '');
  
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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-slate-600 text-white">Defining Objective</span>
          {dbId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap border transition-colors focus:outline-none ${isLocked ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'}`}>
                  {isLocked ? 'Locked' : 'Draft'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {!isLocked && onLockDO && (
                  <DropdownMenuItem onClick={onLockDO}>
                    <Lock className="h-3.5 w-3.5 mr-2" />
                    Lock this DO
                  </DropdownMenuItem>
                )}
                {isLocked && canLock && onUnlockDO && (
                  <DropdownMenuItem onClick={onUnlockDO}>
                    <Unlock className="h-3.5 w-3.5 mr-2" />
                    Unlock this DO
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex items-center gap-1">
          {dbId && (
            <button
              className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent"
              aria-label="Open in full page"
              onClick={() => {
                navigateHook(`/rcdo/detail/do/${dbId}${cycleParam ? `?cycle=${cycleParam}` : ''}`);
                if (isMobile) closePanel();
              }}
              title="Open in full page"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
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
      <div className="flex items-center gap-2 mb-4 group/title">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            autoFocus
            className="text-base font-semibold bg-transparent border-b-2 border-blue-500 focus:outline-none flex-1 min-w-0"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft.trim() && titleDraft !== selectedNode.data.title) {
                handleUpdate({ title: titleDraft.trim() });
              } else {
                setTitleDraft(selectedNode.data.title || '');
              }
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (titleDraft.trim() && titleDraft !== selectedNode.data.title) handleUpdate({ title: titleDraft.trim() });
                setEditingTitle(false);
              }
              if (e.key === 'Escape') {
                setTitleDraft(selectedNode.data.title || '');
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <>
            <h3 className="text-base font-semibold">{selectedNode.data.title || 'Untitled DO'}</h3>
            {isLocked && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border">locked</span>
            )}
            {!isLocked && (
              <button
                type="button"
                onClick={() => { setTitleDraft(selectedNode.data.title || ''); setEditingTitle(true); }}
                className="opacity-0 group-hover/title:opacity-100 p-1 rounded hover:bg-accent text-muted-foreground transition-opacity shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>
      <div className="space-y-3">
        {/* 1. Owner */}
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
            <OwnerCombobox
              profiles={profiles}
              selectedId={selectedNode.data.ownerId}
              onSelectionChange={(id) => handleOwnerChange(id || "")}
              disabled={isLocked}
              placeholder="Select owner"
            />
          </div>
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
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
          />
        </div>
        
        {/* 5. Strategic Initiatives */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Strategic Initiatives</label>
            {!isLocked && (
              <button
                onClick={addSaiToSelectedDo}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
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

