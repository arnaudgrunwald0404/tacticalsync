import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import RichTextEditor from '@/components/ui/rich-text-editor-lazy';
import type { CreateInitiativeForm } from '@/types/rcdo';
import { MultiSelectParticipants } from '@/components/ui/multi-select-participants';

interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string;
}

interface InitiativeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  definingObjectiveId: string;
  onSuccess?: () => void;
}

export function InitiativeDialog({
  isOpen,
  onClose,
  definingObjectiveId,
  onSuccess,
}: InitiativeDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    owner_user_id: string;
    participant_user_ids: string[];
    start_date: string;
    end_date: string;
  }>({
    title: '',
    description: '',
    owner_user_id: '',
    participant_user_ids: [],
    start_date: '',
    end_date: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name, email')
        .order('first_name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const getUserDisplayName = (user: UserProfile) => {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    if (user.full_name) {
      return user.full_name;
    }
    return user.email;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Title is required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.owner_user_id) {
      toast({
        title: 'Validation Error',
        description: 'Owner is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const createData: CreateInitiativeForm = {
        defining_objective_id: definingObjectiveId,
        title: formData.title.trim(),
        description: formData.description || undefined,
        owner_user_id: formData.owner_user_id,
        participant_user_ids: formData.participant_user_ids.length > 0 ? formData.participant_user_ids : undefined,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
      };

      const { data: auth } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('rc_strategic_initiatives')
        .insert({
          defining_objective_id: createData.defining_objective_id,
          title: createData.title,
          description: createData.description || null,
          owner_user_id: createData.owner_user_id,
          participant_user_ids: createData.participant_user_ids || [],
          start_date: createData.start_date || null,
          end_date: createData.end_date || null,
          status: 'not_started',
          created_by: auth?.user?.id || null,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Strategic initiative created successfully',
      });

      handleClose();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create initiative',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      owner_user_id: '',
      participant_user_ids: [],
      start_date: '',
      end_date: '',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Strategic Initiative</DialogTitle>
          <DialogDescription>
            Add a strategic initiative that will drive this objective forward.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Launch mobile app redesign"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                disabled={loading}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <RichTextEditor
                content={formData.description}
                onChange={(content) =>
                  setFormData({ ...formData, description: content })
                }
                placeholder="Describe what this initiative entails and why it's important..."
                minHeight="96px"
              />
            </div>

            {/* Owner */}
            <div className="space-y-2">
              <Label htmlFor="owner">
                Owner <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.owner_user_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, owner_user_id: value })
                }
                disabled={loading || loadingUsers}
                required
              >
                <SelectTrigger id="owner">
                  <SelectValue placeholder="Select an owner..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {getUserDisplayName(user)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Other Participants */}
            <div className="space-y-2">
              <Label htmlFor="participants">Other Participants</Label>
              <MultiSelectParticipants
                profiles={users.map(u => ({
                  id: u.id,
                  full_name: getUserDisplayName(u),
                  avatar_name: u.first_name || u.full_name || u.email,
                  first_name: u.first_name,
                  email: u.email,
                }))}
                selectedIds={formData.participant_user_ids}
                onSelectionChange={(ids) =>
                  setFormData({ ...formData, participant_user_ids: ids })
                }
                placeholder="Select participants to help accomplish this goal..."
                disabled={loading || loadingUsers}
                excludeIds={formData.owner_user_id ? [formData.owner_user_id] : []}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Initiative
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

