import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, X, Timer, GripVertical, Sparkles } from "lucide-react";
import SaveButton from "@/components/ui/SaveButton";
import EditButton from "@/components/ui/EditButton";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { htmlToPlainText, htmlToFormattedDisplayItems } from "@/lib/htmlUtils";
import { formatNameWithInitial } from "@/lib/nameUtils";
import { useDebouncedAutosave } from "@/hooks/useDebouncedAutosave";
import { AgendaItem, AgendaItemWithProfile } from "@/types/agenda";
import { TeamMember } from "@/types/common";
import { MeetingDataActions } from "@/types/meeting";
import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useHotkeys } from "react-hotkeys-hook";
import RichTextEditor from "@/components/ui/rich-text-editor";

interface AgendaSidebarProps {
  items: AgendaItemWithProfile[];
  isAdmin: boolean;
  isEditingAgenda: boolean;
  editingItems: AgendaItem[];
  actions: MeetingDataActions;
  teamMembers: TeamMember[];
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  systemTemplates?: any[];
  adoptingTemplate?: boolean;
  adoptSystemTemplate?: (template: any) => Promise<void>;
  startAddingManually?: () => void;
}

export function AgendaSidebar({
  items,
  isAdmin,
  isEditingAgenda,
  editingItems,
  actions,
  teamMembers,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  systemTemplates = [],
  adoptingTemplate = false,
  adoptSystemTemplate,
  startAddingManually,
}: AgendaSidebarProps) {
  const displayItems = isEditingAgenda ? editingItems : items;
  console.log('AgendaSidebar state:', { isEditingAgenda, editingItems, items, displayItems });
  const [expandedNotes, setExpandedNotes] = useState<string[]>([]);
  const [notesContent, setNotesContent] = useState<Record<string, string>>({});
  const [timerStarted, setTimerStarted] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Debounced autosave for notes
  const { debouncedSave, immediateSave } = useDebouncedAutosave({
    delay: 2000,
    onSave: (itemId, content) => {
      console.log('Autosaving notes for item:', itemId, 'content:', content);
      const plainText = htmlToPlainText(content);
      actions.handleUpdateNotes(itemId, plainText);
    }
  });

  const shouldShowNotes = (item: AgendaItemWithProfile) => {
    // Don't show notes when creating from scratch (item has a temp id)
    if (item.id.startsWith('temp-')) return false;
    return isEditingAgenda || expandedNotes.includes(item.id);
  };

  const handleNotesToggle = (itemId: string) => {
    setExpandedNotes(prev => {
      const isCurrentlyExpanded = prev.includes(itemId);
      
      if (isCurrentlyExpanded) {
        // Save notes immediately when closing
        const currentContent = notesContent[itemId];
        if (currentContent !== undefined) {
          immediateSave(itemId, currentContent);
        }
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  };

  // Auto-collapse empty notes after save
  useEffect(() => {
    if (!isEditingAgenda) {
      setExpandedNotes(prev => 
        prev.filter(id => {
          const item = items.find(i => i.id === id);
          return item?.notes;
        })
      );
    }
  }, [isEditingAgenda, items]);

  // Initialize notes content when notes are opened
  useEffect(() => {
    expandedNotes.forEach(itemId => {
      const item = items.find(i => i.id === itemId);
      if (item) {
        setNotesContent(prev => ({
          ...prev,
          [itemId]: item.notes || ""
        }));
      }
    });
  }, [expandedNotes, items]);

  const toggleTimer = () => {
    if (timerStarted) {
      setTimerStarted(false);
      setElapsedTime(0);
    } else {
      setTimerStarted(true);
      setElapsedTime(0);
    }
  };

  // Format elapsed time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerStarted) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerStarted]);

  // Keyboard shortcuts
  useHotkeys('mod+s', (e) => {
    e.preventDefault();
    if (isEditingAgenda) onSaveEdit();
  }, [isEditingAgenda, onSaveEdit]);

  useHotkeys('mod+e', (e) => {
    e.preventDefault();
    if (!isEditingAgenda && isAdmin) onStartEdit();
  }, [isEditingAgenda, isAdmin, onStartEdit]);

  const handleDragEnd = useCallback((result: any) => {
    if (!result.destination || !isEditingAgenda) return;

    const items = Array.from(editingItems);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update order_index for all items
    items.forEach((item, index) => {
      item.order_index = index;
    });

    actions.updateEditingItems(items);
  }, [editingItems, isEditingAgenda, actions]);

  return (
    <div className="w-full md:w-80 fixed top-[137px] bottom-0 left-10 group">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between pt-16 pb-4 px-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-xl pl-4 flex items-center" data-testid="agenda-section">
            Agenda
          </h2>
          {!isEditingAgenda && isAdmin && (
            <EditButton
              variant="ghost"
              size="sm"
              className="p-1 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onStartEdit}
            />
          )}
          {isAdmin && isEditingAgenda && (
            <div className="flex items-center gap-2 ml-2">
              <SaveButton
                size="sm"
                variant="ghost"
                className="p-1 h-7 hover:bg-muted/50"
                onClick={async () => {
                  await onSaveEdit();
                  actions.setEditing(false);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-7 hover:bg-muted/50 flex items-center gap-1"
                onClick={() => onCancelEdit()}
              >
                <X className="h-4 w-4" />
                <span className="text-sm">Cancel</span>
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Sidebar Content */}
      <div className="px-4 space-y-2 overflow-y-auto h-[calc(100%-57px)]">
        {items.length === 0 && !isEditingAgenda ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a template or create your own agenda.
            </p>
            
            {/* Template Cards */}
            <div className="space-y-3">
              {systemTemplates.map((template) => (
                <div 
                  key={template.id} 
                  className="border rounded-lg p-3 bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start gap-3 mb-2">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium mb-0.5">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    </div>
                  </div>
                  <div className="space-y-1 mb-3">
                    {(template.items || [])
                      .sort((a: any, b: any) => a.order_index - b.order_index)
                      .map((item: any) => (
                        <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                          <span>• {item.title}</span>
                          {item.duration_minutes && (
                            <span className="text-primary font-medium">{item.duration_minutes} min</span>
                          )}
                        </div>
                    ))}
                  </div>
                  <Button 
                    onClick={() => adoptSystemTemplate?.(template)} 
                    disabled={adoptingTemplate}
                    className="w-full"
                    size="sm"
                  >
                    {adoptingTemplate ? "Adopting..." : "Use This Template"}
                  </Button>
                </div>
              ))}
            </div>

            {/* Manual Creation Option */}
            <div className="text-center pt-2">
              <p className="text-xs text-muted-foreground mb-2">
                Or if you'd rather add agenda items manually:
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={startAddingManually}
              >
                Start From Scratch
              </Button>
            </div>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="agenda-items">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-1.5"
                >
                  {displayItems.map((item: AgendaItemWithProfile, index) => (
                    <Draggable
                      key={item.id}
                      draggableId={item.id}
                      index={index}
                      isDragDisabled={!isEditingAgenda}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`border rounded-lg p-3 bg-background transition-colors relative group ${
                            snapshot.isDragging ? 'shadow-lg border-primary' : 'hover:border-primary/50'
                          }`}
                        >
                          {/* per-header pen now handles edit entry; row-level pen removed */}
                          <div className="flex items-start gap-3">
                            {isEditingAgenda && (
                              <div
                                {...provided.dragHandleProps}
                                className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                              >
                                <GripVertical className="h-4 w-4" />
                              </div>
                            )}
                            {!isEditingAgenda && (
                              <Checkbox
                                checked={item.is_completed}
                                onCheckedChange={() => actions.handleToggleComplete(item.id, item.is_completed)}
                                className="mt-0.5"
                              />
                            )}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              {/* Row 1: Title and Delete */}
                              <div className="flex items-center gap-3">
                                {isEditingAgenda ? (
                                  <>
                                    <div className="flex-1">
                                      <Textarea
                                        value={htmlToPlainText(item.title || "")}
                                        onChange={(e) => actions.updateEditingItem(index, 'title', e.target.value)}
                                        placeholder="Agenda item"
                                        className="min-h-[32px] resize-none  overflow-hidden text-sm font-medium p-1.5 focus-visible:ring-0"
                                        rows={1}
                                        onInput={(e) => {
                                          const target = e.target as HTMLTextAreaElement;
                                          target.style.height = 'auto';
                                          target.style.height = target.scrollHeight + 'px';
                                        }}
                                      />
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                                      onClick={() => {
                                        const updatedItems = editingItems.filter((_, i) => i !== index);
                                        actions.updateEditingItems(updatedItems);
                                      }}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <div className="flex-1">
                                    {(() => {
                                      const formattedHtml = htmlToFormattedDisplayItems(item.title).map(p => p.content).join('');
                                      const plainFallback = htmlToPlainText(item.title);
                                      const hasFormattedContent = (formattedHtml || '').replace(/<[^>]*>/g, '').trim().length > 0;
                                      if (hasFormattedContent) {
                                        return (
                                          <p 
                                            className={`text-sm font-medium ${item.is_completed ? 'line-through text-muted-foreground' : ''}`}
                                            dangerouslySetInnerHTML={{ __html: formattedHtml }}
                                          />
                                        );
                                      }
                                      return (
                                        <p className={`text-sm font-medium ${item.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                                          {plainFallback || (item.title || '')}
                                        </p>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>

                              {/* Row 2: Assignee and Duration */}
                              {isEditingAgenda ? (
                                <div className="grid grid-cols-[1fr_100px] gap-3">
                                  <select
                                    value={item.assigned_to || ""}
                                    onChange={(e) => actions.updateEditingItem(index, 'assigned_to', e.target.value || null)}
                                    className="h-8 text-sm rounded-md border border-input bg-transparent px-3 w-full"
                                  >
                                    <option value="">All</option>
                                    {teamMembers.map((member) => (
                                      <option key={member.id} value={member.user_id}>
                                        {formatNameWithInitial(
                                          member.profiles.first_name,
                                          member.profiles.last_name,
                                          member.profiles.email
                                        )}
                                      </option>
                                    ))}
                                  </select>

                                  <input
                                    type="number"
                                    value={item.time_minutes || ""}
                                    onChange={(e) => actions.updateEditingItem(index, 'time_minutes', e.target.value ? parseInt(e.target.value) : null)}
                                    placeholder="...mins"
                                    className="h-8 text-sm rounded-md border border-input bg-transparent px-3 w-full"
                                    min="0"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  {item.assigned_to_profile ? (
                                    <div className="flex items-center gap-2">
                                      {item.assigned_to_profile.avatar_name ? (
                                        <FancyAvatar 
                                          name={item.assigned_to_profile.avatar_name}
                                          displayName={formatNameWithInitial(
                                            item.assigned_to_profile.first_name,
                                            item.assigned_to_profile.last_name,
                                            item.assigned_to_profile.email
                                          )}
                                          size="sm"
                                        />
                                      ) : (
                                        <Avatar className="h-6 w-6 rounded-full">
                                          <AvatarImage src={item.assigned_to_profile.avatar_url} />
                                          <AvatarFallback className="text-xs">
                                            {(item.assigned_to_profile.first_name || item.assigned_to_profile.email || '?').charAt(0).toUpperCase()}
                                          </AvatarFallback>
                                        </Avatar>
                                      )}
                                      <span className="text-sm text-muted-foreground">
                                        {formatNameWithInitial(
                                          item.assigned_to_profile.first_name,
                                          item.assigned_to_profile.last_name,
                                          item.assigned_to_profile.email
                                        )}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">All</span>
                                  )}

                                  {item.time_minutes && (
                                    <>
                                      <span className="text-sm text-muted-foreground">•</span>
                                      <span className="text-sm text-muted-foreground">{item.time_minutes} min</span>
                                    </>
                                  )}

                                  {!isEditingAgenda && (
                                    <button
                                      onClick={() => handleNotesToggle(item.id)}
                                      className={`p-2 rounded-md transition-colors ${
                                        !item.notes || item.notes.trim() === '' 
                                          ? 'text-muted-foreground hover:bg-muted/10' 
                                          : expandedNotes.includes(item.id) 
                                            ? 'text-primary bg-primary/10' 
                                            : 'text-primary hover:bg-primary/10'
                                      }`}
                                    >
                                      <MessageSquare className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Notes Section */}
                              {!isEditingAgenda && shouldShowNotes(item) && (
                                <div className="mt-2 pt-2 border-t">
                                  <RichTextEditor
                                    content={notesContent[item.id] || item.notes || ""}
                                    onChange={(content) => {
                                      console.log('Notes onChange for item:', item.id, 'content:', content);
                                      // Track content changes locally
                                      setNotesContent(prev => ({
                                        ...prev,
                                        [item.id]: content
                                      }));
                                      // Trigger debounced autosave
                                      debouncedSave(item.id, content);
                                    }}
                                    onBlur={(content) => {
                                      console.log('Notes onBlur for item:', item.id, 'content:', content);
                                      // Save immediately on blur
                                      immediateSave(item.id, content);
                                    }}
                                    placeholder="Add notes..."
                                    className="text-sm border-none focus-visible:ring-0"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {isEditingAgenda && (
                    <Button
                      onClick={() => {
                        const newItem = {
                          id: `temp-${Date.now()}`,
                          title: "",
                          is_completed: false,
                          assigned_to: null,
                          notes: null,
                          order_index: displayItems.length,
                          time_minutes: null,
                          desired_outcomes: null,
                          activities: null,
                        };
                        actions.updateEditingItems([...displayItems, newItem]);
                      }}
                      className="w-full mt-4"
                      variant="outline"
                      size="sm"
                    >
                      Add New Item
                    </Button>
                  )}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
    </div>
  );
}