import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Trash2, Check, X, Plus, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import CommentsDialog from "./CommentsDialog";
import AddTopicsDrawer from "./AddTopicsDrawer";
import { startOfWeek, endOfWeek, format, getWeek, addDays } from "date-fns";
import { htmlToPlainText } from "@/lib/htmlUtils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface MeetingTopicsProps {
  items: any[];
  meetingId: string;
  teamId: string;
  onUpdate: () => void;
  onAddTopic?: () => void;
  hasAgendaItems?: boolean;
}

export interface MeetingTopicsRef {
  startCreating: () => void;
}

interface SortableTopicRowProps {
  item: any;
  members: any[];
  onToggleComplete: (itemId: string, currentStatus: boolean) => void;
  onDelete: (itemId: string) => void;
  onChangeAssignment: (itemId: string, newUserId: string | null) => void;
  onUpdateOutcome: (itemId: string, newOutcome: string) => void;
  onOpenComments: (id: string, title: string) => void;
}

const SortableTopicRow = ({ 
  item, 
  members, 
  onToggleComplete, 
  onDelete, 
  onChangeAssignment, 
  onUpdateOutcome, 
  onOpenComments 
}: SortableTopicRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="px-4 py-3 grid grid-cols-[40px_40px_2fr_200px_2fr_80px] gap-4 items-center border-t hover:bg-muted/30 transition-colors"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      
      <Checkbox
        checked={item.is_completed}
        onCheckedChange={() => onToggleComplete(item.id, item.is_completed)}
      />
      
      <div className={`font-medium ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
        {htmlToPlainText(item.title)}
      </div>

      <div>
        <Select 
          value={item.assigned_to || "none"} 
          onValueChange={(value) => onChangeAssignment(item.id, value === "none" ? null : value)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Assign to...">
              {item.assigned_to_profile ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={item.assigned_to_profile.avatar_url} />
                    <AvatarFallback className="text-xs">
                      {item.assigned_to_profile.full_name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">
                    {(() => {
                      const names = item.assigned_to_profile.full_name?.split(" ") || [];
                      const firstName = names[0] || "";
                      const lastInitial = names.length > 1 ? names[names.length - 1].charAt(0) + "." : "";
                      return `${firstName} ${lastInitial}`.trim();
                    })()}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="none">Unassigned</SelectItem>
            {members.map((member) => {
              const names = member.profiles?.full_name?.split(" ") || [];
              const firstName = names[0] || "";
              const lastInitial = names.length > 1 ? names[names.length - 1].charAt(0) + "." : "";
              const displayName = `${firstName} ${lastInitial}`.trim();
              
              return (
                <SelectItem key={member.user_id} value={member.user_id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={member.profiles?.avatar_url} />
                      <AvatarFallback className="text-xs">
                        {member.profiles?.full_name?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span>{displayName}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <Input
        placeholder="Desired outcome..."
        defaultValue={htmlToPlainText(item.outcome || "")}
        onBlur={(e) => onUpdateOutcome(item.id, e.target.value)}
        className="h-8 text-sm"
      />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onOpenComments(item.id, item.title)}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
};

const MeetingTopics = forwardRef<MeetingTopicsRef, MeetingTopicsProps>(({ items, meetingId, teamId, onUpdate, onAddTopic, hasAgendaItems = true }, ref) => {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<{ id: string; title: string } | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    if (teamId) {
      fetchMembers();
    }
  }, [teamId]);

  useImperativeHandle(ref, () => ({
    startCreating,
  }));

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        profiles:user_id(id, full_name, avatar_url, red_percentage, blue_percentage, green_percentage, yellow_percentage)
      `)
      .eq("team_id", teamId);
    
    setMembers(data || []);
  };

  const startCreating = () => {
    setIsDrawerOpen(true);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent, weekItems: any[]) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = weekItems.findIndex((item) => item.id === active.id);
    const newIndex = weekItems.findIndex((item) => item.id === over.id);

    const reorderedItems = arrayMove(weekItems, oldIndex, newIndex);

    // Update order_index for all affected items in the database
    try {
      for (let i = 0; i < reorderedItems.length; i++) {
        const item = reorderedItems[i];
        await supabase
          .from("meeting_items")
          .update({ order_index: i })
          .eq("id", item.id);
      }

      toast({
        title: "Topics reordered",
        description: "The topic order has been updated",
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to reorder topics",
        variant: "destructive",
      });
    }
  };


  const handleToggleComplete = async (itemId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ is_completed: !currentStatus })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
      return;
    }

    onUpdate();
  };

  const handleDelete = async (itemId: string) => {
    const { error } = await supabase
      .from("meeting_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Topic deleted",
      description: "The topic has been removed from the meeting.",
    });

    onUpdate();
  };

  const handleChangeAssignment = async (itemId: string, newUserId: string | null) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ assigned_to: newUserId })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update assignment",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Assignment updated",
      description: "Topic has been reassigned",
    });

    onUpdate();
  };


  const handleUpdateOutcome = async (itemId: string, newOutcome: string) => {
    const { error } = await supabase
      .from("meeting_items")
      .update({ outcome: newOutcome })
      .eq("id", itemId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update outcome",
        variant: "destructive",
      });
    }
  };

  // Group items by week
  const groupedByWeek: Record<string, { weekStart: Date; items: any[] }> = items.reduce((acc, item) => {
    const createdDate = new Date(item.created_at);
    const weekStart = startOfWeek(createdDate, { weekStartsOn: 1 }); // Monday
    const weekKey = weekStart.toISOString();
    
    if (!acc[weekKey]) {
      acc[weekKey] = {
        weekStart,
        items: [],
      };
    }
    
    acc[weekKey].items.push(item);
    return acc;
  }, {} as Record<string, { weekStart: Date; items: any[] }>);

  // Sort weeks descending (newest first)
  const sortedWeeks = Object.entries(groupedByWeek).sort(
    ([keyA], [keyB]) => new Date(keyB).getTime() - new Date(keyA).getTime()
  );

  const getWeekHeader = (weekStart: Date) => {
    // Use Monday-Friday for business weeks
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 }); // Monday start
    const fridayEnd = addDays(weekStart, 4); // Monday + 4 days = Friday
    const weekNumber = getWeek(weekStart);
    const startStr = format(weekStart, "MMM d");
    const endStr = format(fridayEnd, "MMM d");
    return `Week ${weekNumber} (${startStr} - ${endStr})`;
  };

  return (
    <>
      <div className="space-y-4">
        {sortedWeeks.map(([weekKey, { weekStart, items: weekItems }]) => (
          <div key={weekKey} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {getWeekHeader(weekStart)}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 grid grid-cols-[40px_40px_2fr_200px_2fr_80px] gap-4 text-sm font-medium text-muted-foreground">
                <div></div>
                <div></div>
                <div>Topic</div>
                <div>Who</div>
                <div>Desired Outcome</div>
                <div></div>
              </div>
              
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, weekItems)}
              >
                <SortableContext
                  items={weekItems.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {weekItems.map((item) => (
                    <SortableTopicRow
                      key={item.id}
                      item={item}
                      members={members}
                      onToggleComplete={handleToggleComplete}
                      onDelete={handleDelete}
                      onChangeAssignment={handleChangeAssignment}
                      onUpdateOutcome={handleUpdateOutcome}
                      onOpenComments={(id, title) => setSelectedItem({ id, title })}
                    />
                  ))}
                </SortableContext>
              </DndContext>

            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">
            <p className="text-sm">
              {hasAgendaItems 
                ? "No topics yet. Click \"Add Topic\" to create one." 
                : "Users will be able to create topics once the agenda for this recurring meeting has been set."
              }
            </p>
          </div>
        )}
      </div>

      {selectedItem && (
        <CommentsDialog
          itemId={selectedItem.id}
          itemTitle={selectedItem.title}
          open={!!selectedItem}
          onOpenChange={(open) => !open && setSelectedItem(null)}
        />
      )}

      <AddTopicsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        meetingId={meetingId}
        teamId={teamId}
        onSave={onUpdate}
        existingTopics={items}
      />
    </>
  );
});

MeetingTopics.displayName = "MeetingTopics";

export default MeetingTopics;
