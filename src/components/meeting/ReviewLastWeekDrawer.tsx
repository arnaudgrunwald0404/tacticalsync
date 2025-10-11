import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CheckCircle2, Clock, XCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { htmlToPlainText } from "@/lib/htmlUtils";

interface ReviewLastWeekDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  previousMeetingId: string;
  currentUserId: string;
  isAdmin: boolean;
}

interface TopicWithStatus {
  id: string;
  title: string;
  outcome: string;
  assigned_to: string;
  assigned_to_profile: any;
  status?: 'done' | 'in_progress' | 'blocked' | 'not_started';
  updated_by?: string;
}

const ReviewLastWeekDrawer = ({ 
  isOpen, 
  onClose, 
  previousMeetingId,
  currentUserId,
  isAdmin 
}: ReviewLastWeekDrawerProps) => {
  const { toast } = useToast();
  const [topics, setTopics] = useState<TopicWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && previousMeetingId) {
      fetchPreviousMeetingTopics();
    }
  }, [isOpen, previousMeetingId]);

  const fetchPreviousMeetingTopics = async () => {
    setLoading(true);
    try {
      // Fetch topics from previous meeting
      const { data: topicsData, error: topicsError } = await supabase
        .from("meeting_items")
        .select(`
          id,
          title,
          outcome,
          assigned_to,
          assigned_to_profile:assigned_to(
            full_name, 
            first_name, 
            last_name, 
            email, 
            avatar_url, 
            avatar_name
          )
        `)
        .eq("meeting_id", previousMeetingId)
        .eq("type", "topic")
        .order("order_index");

      if (topicsError) throw topicsError;

      // Fetch status for each topic
      const topicIds = topicsData?.map(t => t.id) || [];
      const { data: statusData, error: statusError } = await supabase
        .from("topic_status")
        .select("*")
        .in("topic_id", topicIds);

      if (statusError) throw statusError;

      // Merge topics with their status
      const topicsWithStatus = topicsData?.map(topic => {
        const status = statusData?.find(s => s.topic_id === topic.id);
        return {
          ...topic,
          status: status?.status,
          updated_by: status?.updated_by
        };
      }) || [];

      setTopics(topicsWithStatus);
    } catch (error: any) {
      console.error("Error fetching previous meeting topics:", error);
      toast({
        title: "Error",
        description: "Failed to load previous meeting topics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canUpdateStatus = (topic: TopicWithStatus) => {
    return isAdmin || topic.assigned_to === currentUserId;
  };

  const handleStatusUpdate = async (topicId: string, newStatus: 'done' | 'in_progress' | 'blocked' | 'not_started') => {
    try {
      const { data, error } = await supabase
        .from("topic_status")
        .upsert({
          topic_id: topicId,
          status: newStatus,
          updated_by: currentUserId,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'topic_id'
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setTopics(prevTopics =>
        prevTopics.map(topic =>
          topic.id === topicId
            ? { ...topic, status: newStatus, updated_by: currentUserId }
            : topic
        )
      );

      toast({
        title: "Status updated",
        description: "Topic status has been updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update topic status",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status?: string, isActive?: boolean) => {
    const baseClass = "h-6 w-6 cursor-pointer transition-all";
    
    switch (status) {
      case 'done':
        return <CheckCircle2 className={cn(baseClass, isActive ? "text-white" : "text-gray-400")} />;
      case 'in_progress':
        return <Clock className={cn(baseClass, isActive ? "text-white" : "text-gray-400")} />;
      case 'blocked':
        return <XCircle className={cn(baseClass, isActive ? "text-white" : "text-gray-400")} />;
      case 'not_started':
        return <Circle className={cn(baseClass, isActive ? "text-white" : "text-gray-400")} />;
      default:
        return null;
    }
  };

  const getStatusColor = (currentStatus?: string, thisStatus?: string) => {
    if (currentStatus !== thisStatus) return "bg-gray-100 hover:bg-gray-200";
    
    switch (thisStatus) {
      case 'done':
        return "bg-green-500";
      case 'in_progress':
        return "bg-orange-500";
      case 'blocked':
        return "bg-gray-700";
      case 'not_started':
        return "bg-red-500";
      default:
        return "bg-gray-100";
    }
  };

  const getDisplayName = (profile: any) => {
    if (!profile) return "Unassigned";
    
    const firstName = profile.first_name || "";
    const lastName = profile.last_name || "";
    const email = profile.email || "";
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else {
      return email;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[75vw] sm:w-[50vw] sm:max-w-none overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Review Last Week's Topics</SheetTitle>
          <SheetDescription>
            Update the status of topics from the previous meeting
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : topics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No topics found in the previous meeting
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Topic</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Owner</th>
                    <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((topic, index) => {
                    const canUpdate = canUpdateStatus(topic);
                    const displayName = getDisplayName(topic.assigned_to_profile);
                    
                    return (
                      <tr key={topic.id} className={cn(
                        "border-t",
                        index % 2 === 0 ? "bg-white" : "bg-gray-50"
                      )}>
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium text-sm">{htmlToPlainText(topic.title)}</div>
                            {topic.outcome && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Outcome: {htmlToPlainText(topic.outcome)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {topic.assigned_to_profile && (
                            <div className="flex items-center gap-2">
                              {topic.assigned_to_profile.avatar_name ? (
                                <FancyAvatar 
                                  name={topic.assigned_to_profile.avatar_name} 
                                  displayName={displayName}
                                  size="sm" 
                                />
                              ) : (
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={topic.assigned_to_profile.avatar_url} />
                                  <AvatarFallback className="text-xs">
                                    {displayName.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <span className="text-sm">{displayName}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {/* Done */}
                            <button
                              onClick={() => canUpdate && handleStatusUpdate(topic.id, 'done')}
                              disabled={!canUpdate}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                getStatusColor(topic.status, 'done'),
                                !canUpdate && "cursor-not-allowed opacity-50"
                              )}
                              title="Done"
                            >
                              {getStatusIcon('done', topic.status === 'done')}
                            </button>

                            {/* In Progress */}
                            <button
                              onClick={() => canUpdate && handleStatusUpdate(topic.id, 'in_progress')}
                              disabled={!canUpdate}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                getStatusColor(topic.status, 'in_progress'),
                                !canUpdate && "cursor-not-allowed opacity-50"
                              )}
                              title="In Progress"
                            >
                              {getStatusIcon('in_progress', topic.status === 'in_progress')}
                            </button>

                            {/* Blocked */}
                            <button
                              onClick={() => canUpdate && handleStatusUpdate(topic.id, 'blocked')}
                              disabled={!canUpdate}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                getStatusColor(topic.status, 'blocked'),
                                !canUpdate && "cursor-not-allowed opacity-50"
                              )}
                              title="Blocked"
                            >
                              {getStatusIcon('blocked', topic.status === 'blocked')}
                            </button>

                            {/* Not Started */}
                            <button
                              onClick={() => canUpdate && handleStatusUpdate(topic.id, 'not_started')}
                              disabled={!canUpdate}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                getStatusColor(topic.status, 'not_started'),
                                !canUpdate && "cursor-not-allowed opacity-50"
                              )}
                              title="Not Started"
                            >
                              {getStatusIcon('not_started', topic.status === 'not_started')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ReviewLastWeekDrawer;

