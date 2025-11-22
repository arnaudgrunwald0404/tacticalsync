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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { CreateTaskForm, UpdateTaskForm, TaskStatus, StrategicInitiative } from '@/types/rcdo';
import { createTask, updateTask } from '@/hooks/useTasks';

interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string;
}

interface TaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  strategicInitiativeId?: string; // Pre-fill SI if creating from SI context
  taskId?: string; // If editing existing task
  onSuccess?: () => void;
}

export function TaskDialog({
  isOpen,
  onClose,
  strategicInitiativeId,
  taskId,
  onSuccess,
}: TaskDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingSIs, setLoadingSIs] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [strategicInitiatives, setStrategicInitiatives] = useState<StrategicInitiative[]>([]);
  
  const [formData, setFormData] = useState<{
    title: string;
    completion_criteria: string;
    owner_user_id: string;
    strategic_initiative_id: string;
    start_date: string;
    target_delivery_date: string;
    actual_delivery_date: string;
    notes: string;
    status: TaskStatus;
  }>({
    title: '',
    completion_criteria: '',
    owner_user_id: '',
    strategic_initiative_id: strategicInitiativeId || '',
    start_date: '',
    target_delivery_date: '',
    actual_delivery_date: '',
    notes: '',
    status: 'not_assigned',
  });

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      fetchStrategicInitiatives();
      if (taskId) {
        fetchTask();
      } else {
        // Reset form for new task
        setFormData({
          title: '',
          completion_criteria: '',
          owner_user_id: '',
          strategic_initiative_id: strategicInitiativeId || '',
          start_date: '',
          target_delivery_date: '',
          actual_delivery_date: '',
          notes: '',
          status: 'not_assigned',
        });
      }
    }
  }, [isOpen, taskId, strategicInitiativeId]);

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

  const fetchStrategicInitiatives = async () => {
    setLoadingSIs(true);
    try {
      const { data, error } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, defining_objective_id')
        .order('title', { ascending: true });

      if (error) throw error;
      setStrategicInitiatives(data || []);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to load strategic initiatives',
        variant: 'destructive',
      });
    } finally {
      setLoadingSIs(false);
    }
  };

  const fetchTask = async () => {
    if (!taskId) return;
    try {
      const { data, error } = await supabase
        .from('rc_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error) throw error;

      setFormData({
        title: data.title || '',
        completion_criteria: data.completion_criteria || '',
        owner_user_id: data.owner_user_id || '',
        strategic_initiative_id: data.strategic_initiative_id || '',
        start_date: data.start_date || '',
        target_delivery_date: data.target_delivery_date || '',
        actual_delivery_date: data.actual_delivery_date || '',
        notes: data.notes || '',
        status: data.status || 'not_assigned',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: 'Failed to load task',
        variant: 'destructive',
      });
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

    if (!formData.strategic_initiative_id) {
      toast({
        title: 'Validation Error',
        description: 'Strategic Initiative is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      if (taskId) {
        // Update existing task
        const updateData: UpdateTaskForm = {
          title: formData.title.trim(),
          completion_criteria: formData.completion_criteria || undefined,
          owner_user_id: formData.owner_user_id,
          start_date: formData.start_date || undefined,
          target_delivery_date: formData.target_delivery_date || undefined,
          actual_delivery_date: formData.actual_delivery_date || undefined,
          notes: formData.notes || undefined,
          status: formData.status,
        };
        await updateTask(taskId, updateData);
        toast({
          title: 'Success',
          description: 'Task updated successfully',
        });
      } else {
        // Create new task
        const createData: CreateTaskForm = {
          strategic_initiative_id: formData.strategic_initiative_id,
          title: formData.title.trim(),
          completion_criteria: formData.completion_criteria || undefined,
          owner_user_id: formData.owner_user_id,
          start_date: formData.start_date || undefined,
          target_delivery_date: formData.target_delivery_date || undefined,
          actual_delivery_date: formData.actual_delivery_date || undefined,
          notes: formData.notes || undefined,
          status: formData.status,
        };
        await createTask(createData);
        toast({
          title: 'Success',
          description: 'Task created successfully',
        });
      }

      handleClose();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || `Failed to ${taskId ? 'update' : 'create'} task`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      completion_criteria: '',
      owner_user_id: '',
      strategic_initiative_id: strategicInitiativeId || '',
      start_date: '',
      target_delivery_date: '',
      actual_delivery_date: '',
      notes: '',
      status: 'not_assigned',
    });
    onClose();
  };

  const statusOptions: { value: TaskStatus; label: string }[] = [
    { value: 'not_assigned', label: 'Not Assigned' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'task_changed_canceled', label: 'Task Changed/Canceled' },
    { value: 'delayed', label: 'Delayed' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{taskId ? 'Edit Task' : 'Create Task'}</DialogTitle>
          <DialogDescription>
            {taskId ? 'Update task details' : 'Add a task to track work for this strategic initiative.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">
                Task <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Complete user research interviews"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                disabled={loading}
                required
              />
            </div>

            {/* Completion Criteria */}
            <div className="space-y-2">
              <Label htmlFor="completion_criteria">Task Completion Criteria</Label>
              <Textarea
                id="completion_criteria"
                placeholder="Define what needs to be done to consider this task complete..."
                value={formData.completion_criteria}
                onChange={(e) =>
                  setFormData({ ...formData, completion_criteria: e.target.value })
                }
                disabled={loading}
                rows={3}
              />
            </div>

            {/* Strategic Initiative */}
            <div className="space-y-2">
              <Label htmlFor="strategic_initiative">
                Strategic Initiative <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.strategic_initiative_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, strategic_initiative_id: value })
                }
                disabled={loading || loadingSIs || !!strategicInitiativeId}
                required
              >
                <SelectTrigger id="strategic_initiative">
                  <SelectValue placeholder="Select a strategic initiative..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingSIs ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    strategicInitiatives.map((si) => (
                      <SelectItem key={si.id} value={si.id}>
                        {si.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Owner */}
            <div className="space-y-2">
              <Label htmlFor="owner">
                Task Owner <span className="text-red-500">*</span>
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

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: TaskStatus) =>
                  setFormData({ ...formData, status: value })
                }
                disabled={loading}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-3 gap-4">
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
                <Label htmlFor="target_delivery_date">Target Delivery Date</Label>
                <Input
                  id="target_delivery_date"
                  type="date"
                  value={formData.target_delivery_date}
                  onChange={(e) =>
                    setFormData({ ...formData, target_delivery_date: e.target.value })
                  }
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actual_delivery_date">Actual Delivery Date</Label>
                <Input
                  id="actual_delivery_date"
                  type="date"
                  value={formData.actual_delivery_date}
                  onChange={(e) =>
                    setFormData({ ...formData, actual_delivery_date: e.target.value })
                  }
                  disabled={loading}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes or context..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                disabled={loading}
                rows={3}
              />
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
              {taskId ? 'Update Task' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

