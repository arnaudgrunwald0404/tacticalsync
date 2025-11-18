import { useState } from 'react';
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
import type { CreateMetricForm, MetricType, MetricDirection } from '@/types/rcdo';

interface MetricDialogProps {
  isOpen: boolean;
  onClose: () => void;
  definingObjectiveId: string;
  onSuccess?: () => void;
}

export function MetricDialog({
  isOpen,
  onClose,
  definingObjectiveId,
  onSuccess,
}: MetricDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState<{
    name: string;
    type: MetricType;
    unit: string;
    target_numeric: string;
    direction: MetricDirection;
  }>({
    name: '',
    type: 'leading',
    unit: '',
    target_numeric: '',
    direction: 'up',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Metric name is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const createData: CreateMetricForm = {
        defining_objective_id: definingObjectiveId,
        name: formData.name.trim(),
        type: formData.type,
        unit: formData.unit.trim() || undefined,
        target_numeric: formData.target_numeric ? parseFloat(formData.target_numeric) : undefined,
        direction: formData.direction,
      };

      const { error } = await supabase
        .from('rc_do_metrics')
        .insert({
          defining_objective_id: createData.defining_objective_id,
          name: createData.name,
          type: createData.type,
          unit: createData.unit || null,
          target_numeric: createData.target_numeric || null,
          direction: createData.direction,
          source: 'manual',
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Metric created successfully',
      });

      handleClose();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create metric',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      type: 'leading',
      unit: '',
      target_numeric: '',
      direction: 'up',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Metric</DialogTitle>
          <DialogDescription>
            Add a leading or lagging metric to track progress on this objective.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Metric Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Weekly Active Users"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                disabled={loading}
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="type">
                Type <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.type}
                onValueChange={(value: MetricType) =>
                  setFormData({ ...formData, type: value })
                }
                disabled={loading}
                required
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leading">
                    Leading (predictive indicator)
                  </SelectItem>
                  <SelectItem value="lagging">
                    Lagging (outcome measure)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Unit and Target */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  placeholder="e.g., users, %, $"
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value })
                  }
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target">Target Value</Label>
                <Input
                  id="target"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 10000"
                  value={formData.target_numeric}
                  onChange={(e) =>
                    setFormData({ ...formData, target_numeric: e.target.value })
                  }
                  disabled={loading}
                />
              </div>
            </div>

            {/* Direction */}
            <div className="space-y-2">
              <Label htmlFor="direction">
                Direction <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.direction}
                onValueChange={(value: MetricDirection) =>
                  setFormData({ ...formData, direction: value })
                }
                disabled={loading}
                required
              >
                <SelectTrigger id="direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="up">
                    Up (higher is better)
                  </SelectItem>
                  <SelectItem value="down">
                    Down (lower is better)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 text-sm text-gray-700 dark:text-gray-300">
              <p className="font-semibold mb-1">💡 Tip:</p>
              <p>
                <strong>Leading metrics</strong> are predictive (e.g., "# of feature releases").{' '}
                <strong>Lagging metrics</strong> are outcomes (e.g., "customer satisfaction score").
              </p>
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
              Create Metric
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


