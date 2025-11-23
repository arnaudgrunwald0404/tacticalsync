import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, Target, Layers, FileText, CheckSquare, Menu, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface NavigationItem {
  id: string;
  title: string;
  type: 'rce' | 'do' | 'si' | 'task';
  children?: NavigationItem[];
  isExpanded?: boolean;
  isActive?: boolean;
}

interface SINavigationSidebarProps {
  currentSIId: string;
  currentDOId?: string;
  currentRallyingCryId?: string;
  currentTaskId?: string;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  showMobileTrigger?: boolean;
}

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 256; // w-64 = 16rem = 256px

export function SINavigationSidebar({
  currentSIId,
  currentDOId,
  currentRallyingCryId,
  currentTaskId,
  mobileOpen: controlledMobileOpen,
  onMobileOpenChange,
  showMobileTrigger = false,
}: SINavigationSidebarProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [navTree, setNavTree] = useState<NavigationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('si-navigation-sidebar-width');
    return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  
  // Use controlled state if provided, otherwise use internal state
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

  // Fetch navigation tree only when Rallying Cry changes
  useEffect(() => {
    const fetchNavigationTree = async () => {
      if (!currentRallyingCryId) {
        setLoading(false);
        setNavTree(null);
        return;
      }

      try {
        setLoading(true);

        // Fetch Rallying Cry
        const { data: rc, error: rcError } = await supabase
          .from('rc_rallying_cries')
          .select('id, title')
          .eq('id', currentRallyingCryId)
          .single();

        if (rcError) {
          console.error('Error fetching Rallying Cry:', rcError);
          setLoading(false);
          setNavTree(null);
          return;
        }

        if (!rc) {
          console.warn('Rallying Cry not found:', currentRallyingCryId);
          setLoading(false);
          setNavTree(null);
          return;
        }

        // Fetch all DOs for this Rallying Cry
        const { data: dos } = await supabase
          .from('rc_defining_objectives')
          .select('id, title')
          .eq('rallying_cry_id', currentRallyingCryId)
          .order('display_order', { ascending: true });

        // Fetch all SIs for all DOs in this Rallying Cry
        const doIds = (dos || []).map(d => d.id);
        const { data: sis } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, defining_objective_id')
          .in('defining_objective_id', doIds.length > 0 ? doIds : ['00000000-0000-0000-0000-000000000000'])
          .order('display_order', { ascending: true });

        // Fetch all tasks for all SIs
        const siIds = (sis || []).map(s => s.id);
        const { data: tasks } = await supabase
          .from('rc_tasks')
          .select('id, title, strategic_initiative_id')
          .in('strategic_initiative_id', siIds.length > 0 ? siIds : ['00000000-0000-0000-0000-000000000000'])
          .order('display_order', { ascending: true });

        // Build navigation tree - always show all DOs
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

              const siIsActive = si.id === currentSIId;
              const siHasActiveTask = taskItems.some(t => t.isActive);
              const siShouldExpand = siIsActive || siHasActiveTask;

              return {
                id: si.id,
                title: si.title,
                type: 'si' as const,
                isActive: siIsActive,
                isExpanded: siShouldExpand,
                children: taskItems.length > 0 ? taskItems : undefined,
              };
            });

          const doIsActive = doItem.id === currentDOId;
          const doHasActiveSI = siItems.some(si => si.isActive);
          const doShouldExpand = doIsActive || doHasActiveSI;

          return {
            id: doItem.id,
            title: doItem.title,
            type: 'do' as const,
            isActive: doIsActive,
            isExpanded: doShouldExpand,
            children: siItems.length > 0 ? siItems : undefined,
          };
        });

        setNavTree({
          id: rc.id,
          title: rc.title,
          type: 'rce',
          isExpanded: true,
          children: doItems.length > 0 ? doItems : undefined,
        });
      } catch (error) {
        console.error('Error fetching navigation tree:', error);
        setNavTree(null);
      } finally {
        setLoading(false);
      }
    };

    fetchNavigationTree();
  }, [currentRallyingCryId]);

  // Update active and expanded states without refetching
  useEffect(() => {
    if (!navTree) return;

    const updateActiveStates = (node: NavigationItem): NavigationItem => {
      const updatedNode = { ...node };
      
      // Update active state
      updatedNode.isActive = 
        (node.type === 'do' && node.id === currentDOId) ||
        (node.type === 'si' && node.id === currentSIId) ||
        (node.type === 'task' && node.id === currentTaskId);

      // Update expanded state: preserve current state, but ensure active items are expanded
      const currentExpanded = node.isExpanded ?? false;
      let shouldExpand = currentExpanded;

      if (node.type === 'do') {
        // Expand DO if it's active or contains the active SI
        shouldExpand = currentExpanded || node.id === currentDOId || 
          (node.children?.some(si => si.id === currentSIId) ?? false);
      } else if (node.type === 'si') {
        // Expand SI if it's active or contains the active task
        shouldExpand = currentExpanded || node.id === currentSIId || 
          (node.children?.some(task => task.id === currentTaskId) ?? false);
      }

      updatedNode.isExpanded = shouldExpand;

      // Recursively update children
      if (node.children) {
        updatedNode.children = node.children.map(updateActiveStates);
      }

      return updatedNode;
    };

    setNavTree(prev => {
      if (!prev) return null;
      return updateActiveStates(prev);
    });
  }, [currentDOId, currentSIId, currentTaskId]);

  const toggleExpand = (item: NavigationItem) => {
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
  };

  const handleNavigate = (item: NavigationItem) => {
    switch (item.type) {
      case 'rce':
        // Navigate to cycle/canvas view
        navigate('/rcdo/canvas');
        break;
      case 'do':
        navigate(`/rcdo/detail/do/${item.id}`);
        break;
      case 'si':
        navigate(`/rcdo/detail/si/${item.id}`);
        break;
      case 'task':
        // For tasks, navigate to SI detail page and could scroll to task
        // For now, just navigate to SI
        navigate(`/rcdo/detail/si/${currentSIId}`);
        break;
    }
  };

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

  // Drag handlers for resizing sidebar
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
      localStorage.setItem('si-navigation-sidebar-width', sidebarWidth.toString());
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

  const renderItem = (item: NavigationItem, level: number = 0): JSX.Element => {
    if (!item || !item.id || !item.title) {
      return <div key={`error-${level}`} className="text-xs text-muted-foreground p-2">Invalid item</div>;
    }

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = item.isExpanded ?? false;

    return (
      <div key={item.id}>
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors',
            'hover:bg-accent min-h-[44px]', // Ensure touch-friendly height
            item.isActive && 'bg-accent font-semibold',
            level > 0 && 'ml-4'
          )}
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item);
            }
            handleNavigate(item);
            // Close mobile sheet after navigation
            if (isMobile) {
              setMobileOpen(false);
            }
          }}
        >
          {hasChildren && (
            <button
              className="h-4 w-4 flex items-center justify-center"
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
          {!hasChildren && <div className="h-4 w-4" />}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getIcon(item.type)}
            <span className="text-sm truncate" title={item.title}>
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
  };

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-yellow-400 rounded-md flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-yellow-900" />
          </div>
          <h3 className="text-sm font-medium text-foreground leading-tight flex items-center">Navigation</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Icons can be added here */}
        </div>
      </div>
      <div className="p-4 pr-6 min-h-[200px]">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading navigation...</div>
        ) : !navTree ? (
          <div className="text-sm text-muted-foreground">
            {!currentRallyingCryId
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

  // Mobile: Use Sheet component
  if (isMobile) {
    return (
      <>
        {showMobileTrigger && (
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 p-0"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0">
              {sidebarContent}
            </SheetContent>
          </Sheet>
        )}
        {!showMobileTrigger && (
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0">
              {sidebarContent}
            </SheetContent>
          </Sheet>
        )}
      </>
    );
  }

  // Desktop: Regular sidebar with drag handle
  return (
    <div 
      ref={sidebarRef}
      className="bg-background overflow-y-auto flex-shrink-0 relative group rounded-lg border border-sidebar-border shadow-[0_4px_6px_-1px_rgb(0_0_0_/_0.1),_0_2px_4px_-2px_rgb(0_0_0_/_0.1)] my-4 ml-4 min-h-[400px]"
      style={{ width: sidebarWidth }}
    >
      {/* Drag handle - only on desktop */}
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

