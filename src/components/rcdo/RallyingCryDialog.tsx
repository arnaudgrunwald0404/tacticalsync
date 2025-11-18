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
import { Textarea } from '@/components/ui/textarea';
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
import type { CreateRallyingCryForm } from '@/types/rcdo';

interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string;
}

interface RallyingCryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cycleId: string;
  onSuccess?: () => void;
}

export function RallyingCryDialog({
  isOpen,
  onClose,
  cycleId,
  onSuccess,
}: RallyingCryDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  
  const [formData, setFormData] = useState<{
    title: string;
    narrative: string;
    owner_user_id: string;
  }>({
    title: '',
    narrative: '',
    owner_user_id: '',
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
      const createData: CreateRallyingCryForm = {
        cycle_id: cycleId,
        title: formData.title.trim(),
        narrative: formData.narrative.trim() || undefined,
        owner_user_id: formData.owner_user_id,
      };

      const { error } = await supabase
        .from('rc_rallying_cries')
        .insert({
          cycle_id: createData.cycle_id,
          title: createData.title,
          narrative: createData.narrative || null,
          owner_user_id: createData.owner_user_id,
          status: 'draft',
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Rallying cry created successfully',
      });

      handleClose();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create rallying cry',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      narrative: '',
      owner_user_id: '',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Rallying Cry</DialogTitle>
          <DialogDescription>
            Define your organization's main strategic goal for this 6-month cycle.
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
                placeholder="e.g., Become the #1 platform for team collaboration"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                disabled={loading}
                required
              />
            </div>

            {/* Narrative */}
            <div className="space-y-2">
              <Label htmlFor="narrative">Narrative (Optional)</Label>
              <Textarea
                id="narrative"
                placeholder="Describe the vision, context, and why this rallying cry matters..."
                value={formData.narrative}
                onChange={(e) =>
                  setFormData({ ...formData, narrative: e.target.value })
                }
                disabled={loading}
                rows={4}
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
              Create Rallying Cry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


