import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Target, Layers, FileText, CheckSquare, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface NavigationItem {
  id: string;
  title: string;
  type: 'rce' | 'do' | 'si' | 'task';
  children?: NavigationItem[];
  isExpanded?: boolean;
  isActive?: boolean;
}

interface DetailPageNavigationProps {
  rallyingCryId: string;
  currentDOId?: string;
  currentSIId?: string;
  currentTaskId?: string;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 308; // Increased by 20% from 256

// Static cache to persist navigation across component remounts
const navigationCache = new Map<string, {
  navTree: NavigationItem | null;
  timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function DetailPageNavigation({
  rallyingCryId,
  currentDOId,
  currentSIId,
  currentTaskId,
  mobileOpen: controlledMobileOpen,
  onMobileOpenChange,
}: DetailPageNavigationProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [navTree, setNavTree] = useState<NavigationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('detail-navigation-sidebar-width');
    const savedWidth = saved ? parseInt(saved, 10) : null;
    // If no saved width or if it's the old default (256), use new default (308)
    if (!savedWidth || savedWidth === 256) {
      return SIDEBAR_DEFAULT_WIDTH;
    }
    return savedWidth;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  
  // Update localStorage if it has the old default width
  useEffect(() => {
    const saved = localStorage.getItem('detail-navigation-sidebar-width');
    const savedWidth = saved ? parseInt(saved, 10) : null;
    if (savedWidth === 256) {
      localStorage.setItem('detail-navigation-sidebar-width', SIDEBAR_DEFAULT_WIDTH.toString());
      setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    }
  }, []);
  
  const mobileOpen = controlledMobileOpen !== undefined ? controlledMobileOpen : internalMobileOpen;
  const setMobileOpen = (open: boolean) => {
    if (onMobileOpenChange) {
      onMobileOpenChange(open);
    } else {
      setInternalMobileOpen(open);
    }
  };
  const sidebarRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number>(0);
  const dragStartWidth = useRef<number>(0);

  // Load navigation tree once and cache it
  useEffect(() => {
    const fetchNavigationTree = async () => {
      if (!rallyingCryId) {
        setLoading(false);
        setNavTree(null);
        return;
      }

      // Check cache first
      const cached = navigationCache.get(rallyingCryId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setNavTree(cached.navTree);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch Rallying Cry
        const { data: rc, error: rcError } = await supabase
          .from('rc_rallying_cries')
          .select('id, title')
          .eq('id', rallyingCryId)
          .single();

        if (rcError || !rc) {
          console.error('Error fetching Rallying Cry:', rcError);
          setLoading(false);
          setNavTree(null);
          navigationCache.set(rallyingCryId, { navTree: null, timestamp: Date.now() });
          return;
        }

        // Fetch ALL DOs for this Rallying Cry (exhaustive)
        const { data: dos } = await supabase
          .from('rc_defining_objectives')
          .select('id, title')
          .eq('rallying_cry_id', rallyingCryId)
          .order('display_order', { ascending: true });

        // Fetch ALL SIs for ALL DOs in this Rallying Cry (exhaustive)
        const doIds = (dos || []).map(d => d.id);
        const { data: sis } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, defining_objective_id')
          .in('defining_objective_id', doIds.length > 0 ? doIds : ['00000000-0000-0000-0000-000000000000'])
          .order('display_order', { ascending: true });

        // Fetch ALL tasks for ALL SIs (exhaustive)
        const siIds = (sis || []).map(s => s.id);
        const { data: tasks } = await supabase
          .from('rc_tasks')
          .select('id, title, strategic_initiative_id')
          .in('strategic_initiative_id', siIds.length > 0 ? siIds : ['00000000-0000-0000-0000-000000000000'])
          .order('display_order', { ascending: true });

        // Build exhaustive navigation tree - show ALL DOs and ALL SIs
        const doItems = (dos || []).map(doItem => {
          const siItems = (sis || [])
            .filter(si => si.defining_objective_id === doItem.id)
            .map(si => {
              const taskItems = (tasks || [])
                .filter(task => (task as any).strategic_initiative_id === si.id)
                .map(task => ({
                  id: task.id,
                  title: task.title,
                  type: 'task' as const,
                  isActive: task.id === currentTaskId,
                }));

              return {
                id: si.id,
                title: si.title,
                type: 'si' as const,
                isActive: si.id === currentSIId,
                isExpanded: si.id === currentSIId || taskItems.some(t => t.isActive),
                children: taskItems.length > 0 ? taskItems : undefined,
              };
            });

          return {
            id: doItem.id,
            title: doItem.title,
            type: 'do' as const,
            isActive: doItem.id === currentDOId,
            isExpanded: doItem.id === currentDOId || siItems.some(si => si.id === currentSIId),
            children: siItems.length > 0 ? siItems : undefined,
          };
        });

        const tree: NavigationItem = {
          id: rc.id,
          title: rc.title,
          type: 'rce',
          isExpanded: true,
          children: doItems.length > 0 ? doItems : undefined,
        };

        setNavTree(tree);
        navigationCache.set(rallyingCryId, { navTree: tree, timestamp: Date.now() });
      } catch (error) {
        console.error('Error fetching navigation tree:', error);
        setNavTree(null);
        navigationCache.set(rallyingCryId, { navTree: null, timestamp: Date.now() });
      } finally {
        setLoading(false);
      }
    };

    fetchNavigationTree();
  }, [rallyingCryId]); // Only refetch if rallying cry changes

  // Update active and expanded states without refetching (static navigation)
  // Use a ref to avoid unnecessary updates when values haven't changed
  const prevActiveRef = useRef({ currentDOId, currentSIId, currentTaskId });
  const navTreeRef = useRef(navTree);
  
  // Keep ref in sync with navTree
  useEffect(() => {
    navTreeRef.current = navTree;
  }, [navTree]);
  
  useEffect(() => {
    if (!navTreeRef.current) return;

    // Quick check: if active IDs haven't changed, skip update
    const activeChanged = 
      prevActiveRef.current.currentDOId !== currentDOId ||
      prevActiveRef.current.currentSIId !== currentSIId ||
      prevActiveRef.current.currentTaskId !== currentTaskId;

    if (!activeChanged) return;

    // Update ref
    prevActiveRef.current = { currentDOId, currentSIId, currentTaskId };

    const updateActiveStates = (node: NavigationItem): NavigationItem => {
      const newIsActive = 
        (node.type === 'do' && node.id === currentDOId) ||
        (node.type === 'si' && node.id === currentSIId) ||
        (node.type === 'task' && node.id === currentTaskId);

      const currentExpanded = node.isExpanded ?? false;
      let shouldExpand = currentExpanded;

      // RC is always expanded
      if (node.type === 'rce') {
        shouldExpand = true;
      } else if (node.type === 'do') {
        shouldExpand = currentExpanded || node.id === currentDOId || 
          (node.children?.some(si => si.id === currentSIId) ?? false);
      } else if (node.type === 'si') {
        shouldExpand = currentExpanded || node.id === currentSIId || 
          (node.children?.some(task => task.id === currentTaskId) ?? false);
      }

      // Only create new object if values actually changed
      if (node.isActive === newIsActive && node.isExpanded === shouldExpand) {
        // Check children recursively
        if (node.children) {
          const updatedChildren = node.children.map(updateActiveStates);
          // Check if any child changed
          const childrenChanged = updatedChildren.some((child, idx) => 
            child !== node.children![idx]
          );
          if (childrenChanged) {
            return { ...node, children: updatedChildren };
          }
        }
        return node; // No changes at all, return same reference
      }

      // Create new object with updated values
      const updatedNode = {
        ...node,
        isActive: newIsActive,
        isExpanded: shouldExpand,
      };

      if (node.children) {
        updatedNode.children = node.children.map(updateActiveStates);
      }

      return updatedNode;
    };

    // Use functional update to avoid dependency on navTree
    setNavTree(prev => {
      if (!prev) return null;
      const updated = updateActiveStates(prev);
      // Only update state if tree actually changed (reference equality check)
      return updated !== prev ? updated : prev;
    });
  }, [currentDOId, currentSIId, currentTaskId]);

  const toggleExpand = useCallback((item: NavigationItem) => {
    // Don't allow toggling RC level
    if (item.type === 'rce') return;
    
    const updateItem = (node: NavigationItem | null): NavigationItem | null => {
      if (!node) return null;
      if (node.id === item.id) {
        return { ...node, isExpanded: !node.isExpanded };
      }
      if (node.children) {
        return {
          ...node,
          children: node.children.map(updateItem).filter(Boolean) as NavigationItem[],
        };
      }
      return node;
    };
    setNavTree(prev => updateItem(prev));
  }, []);

  const handleNavigate = useCallback((item: NavigationItem) => {
    // Just navigate - the useEffect will handle active state updates based on URL params
    switch (item.type) {
      case 'rce':
        navigate('/rcdo/canvas');
        break;
      case 'do':
        navigate(`/rcdo/detail/do/${item.id}`);
        break;
      case 'si':
        navigate(`/rcdo/detail/si/${item.id}`);
        break;
      case 'task':
        navigate(`/rcdo/detail/si/${currentSIId || ''}?task=${item.id}`);
        break;
    }
  }, [navigate, currentSIId]);

  const getIcon = (type: NavigationItem['type']) => {
    switch (type) {
      case 'rce':
        return <Target className="h-4 w-4" />;
      case 'do':
        return <Layers className="h-4 w-4" />;
      case 'si':
        return <FileText className="h-4 w-4" />;
      case 'task':
        return <CheckSquare className="h-4 w-4" />;
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
  }, [sidebarWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartX.current;
    const newWidth = Math.max(
      SIDEBAR_MIN_WIDTH,
      Math.min(SIDEBAR_MAX_WIDTH, dragStartWidth.current + deltaX)
    );
    
    setSidebarWidth(newWidth);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      localStorage.setItem('detail-navigation-sidebar-width', sidebarWidth.toString());
    }
  }, [isDragging, sidebarWidth]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const renderItem = useCallback((item: NavigationItem, level: number = 0): JSX.Element => {
    if (!item || !item.id || !item.title) {
      return <div key={`error-${level}`} className="text-xs text-muted-foreground p-2">Invalid item</div>;
    }

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = item.isExpanded ?? false;
    const isRC = item.type === 'rce';
    const isDO = item.type === 'do';
    const showChevron = hasChildren && !isRC; // Don't show chevron for RC level

    return (
      <div key={item.id}>
        <div
          className={cn(
            'flex items-start gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors',
            'hover:bg-accent min-h-[44px]',
            item.isActive && 'bg-accent font-semibold',
            (isRC || isDO) && 'font-bold',
            level > 0 && 'ml-4'
          )}
          style={{ paddingLeft: `${8 + level * 12}px` }} // Reduced padding: 8 instead of 12, 12 instead of 16
          onClick={() => {
            if (isRC) {
              // RC is always clickable and navigates
              handleNavigate(item);
              if (isMobile) {
                setMobileOpen(false);
              }
            } else if (hasChildren) {
              // Items with children toggle expand on click
              toggleExpand(item);
            } else {
              // Items without children navigate
              handleNavigate(item);
              if (isMobile) {
                setMobileOpen(false);
              }
            }
          }}
        >
          {showChevron && (
            <button
              className="h-4 w-4 flex items-center justify-center flex-shrink-0 mt-0.5"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(item);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          {!showChevron && <div className="h-4 w-4 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <span 
              className={cn(
                'break-words',
                isRC || isDO ? 'text-base font-bold' : 'text-sm'
              )}
            >
              {item.title}
            </span>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {item.children!.map(child => renderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  }, [toggleExpand, handleNavigate, isMobile, setMobileOpen]);

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#B89A6B] rounded-md flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-sm font-medium text-foreground leading-tight flex items-center">Navigation</h3>
        </div>
      </div>
      <div className="p-4 pr-6 flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading navigation...</div>
        ) : !navTree ? (
          <div className="text-sm text-muted-foreground">
            {!rallyingCryId
              ? 'Missing navigation parameters' 
              : 'No navigation data available'}
          </div>
        ) : (
          <div className="space-y-1">
            {renderItem(navTree)}
          </div>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[480px] p-0">
          {sidebarContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div 
      ref={sidebarRef}
      className="bg-background flex flex-col flex-shrink-0 relative group rounded-lg border border-sidebar-border shadow-[0_4px_6px_-1px_rgb(0_0_0_/_0.1),_0_2px_4px_-2px_rgb(0_0_0_/_0.1)] mt-4 ml-4 mb-4 h-full"
      style={{ width: sidebarWidth }}
    >
      <div
        className={cn(
          "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors",
          "flex items-center justify-center",
          isDragging && "bg-primary/40"
        )}
        onMouseDown={handleMouseDown}
      >
        <div className={cn(
          "w-0.5 h-8 bg-border rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
          isDragging && "opacity-100 bg-primary"
        )} />
      </div>
      
      {sidebarContent}
    </div>
  );
}

