import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { htmlToPlainText } from "@/lib/htmlUtils";

interface CommentsDialogProps {
  itemId: string;
  itemTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CommentsDialog = ({ itemId, itemTitle, open, onOpenChange }: CommentsDialogProps) => {
  const { toast } = useToast();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && itemId) {
      fetchComments();
    }
  }, [open, itemId]);

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from("comments")
        .select(`
          *,
          profiles!fk_comments_created_by_profiles(id, full_name, first_name, last_name, email, avatar_url, avatar_name)
        `)
        .eq("item_id", itemId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setComments(data || []);
    } catch (error: unknown) {
      console.error("Error fetching comments:", error);
    }
  };

  const getDisplayName = (profile: any) => {
    if (!profile) return "Unknown";
    const firstName = profile.first_name || "";
    const lastName = profile.last_name || "";
    const email = profile.email || "";
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else if (email) {
      // Extract the part before @ in email address
      return email.split('@')[0];
    }
    return "Unknown";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim()) return;

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to comment",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("comments").insert({
        item_id: itemId,
        user_id: user.id,
        content: newComment.trim(),
      });

      if (error) throw error;

      setNewComment("");
      fetchComments();

      toast({
        title: "Comment posted",
        description: "Your comment has been added",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Discussion</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {htmlToPlainText(itemTitle)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No comments yet. Start the discussion!</p>
            </div>
          ) : (
            comments.map((comment) => {
              const displayName = getDisplayName(comment.profiles);
              return (
                <div key={comment.id} className="flex gap-3">
                  {comment.profiles?.avatar_name ? (
                    <FancyAvatar 
                      name={comment.profiles.avatar_name} 
                      displayName={displayName}
                      size="sm"
                      className="flex-shrink-0"
                    />
                  ) : (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={comment.profiles?.avatar_url} />
                      <AvatarFallback>
                        {displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-sm">
                        {displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[80px]"
          />
          <Button type="submit" disabled={loading || !newComment.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CommentsDialog;