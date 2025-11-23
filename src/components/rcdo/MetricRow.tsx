import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Edit2, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import type { DOMetric } from '@/types/rcdo';
import { cn } from '@/lib/utils';

interface MetricRowProps {
  metric: DOMetric;
  onUpdate: (metricId: string, updates: { current_numeric?: number }) => Promise<void>;
  isLocked?: boolean;
}

export function MetricRow({ metric, onUpdate, isLocked = false }: MetricRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(metric.current_numeric?.toString() || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (isSaving) return;

    try {
      setIsSaving(true);
      const numericValue = currentValue ? parseFloat(currentValue) : null;
      await onUpdate(metric.id, { current_numeric: numericValue || undefined });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setCurrentValue(metric.current_numeric?.toString() || '');
    setIsEditing(false);
  };

  // Calculate progress percentage
  const getProgress = () => {
    if (!metric.current_numeric || !metric.target_numeric) return null;

    const current = metric.current_numeric;
    const target = metric.target_numeric;

    if (metric.direction === 'up') {
      return Math.min(100, Math.max(0, (current / target) * 100));
    } else {
      // For "down" metrics, less is better
      if (current <= target) return 100;
      return Math.max(0, 100 - ((current - target) / target) * 100);
    }
  };

  const progress = getProgress();

  // Determine status color
  const getStatusColor = () => {
    if (progress === null) return 'text-gray-500';
    if (progress >= 80) return 'text-green-600';
    if (progress >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex items-center gap-4 p-4 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900">
      {/* Metric Name & Type */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {metric.name}
          </span>
          <Badge
            variant="outline"
            className={metric.type === 'leading' ? 'border-[#C97D60]' : 'border-[#6B9A8F]'}
          >
            {metric.type === 'leading' ? 'Leading' : 'Lagging'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {metric.direction === 'up' ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span>Target: {metric.direction}</span>
          {metric.last_updated_at && (
            <span className="ml-2">
              Updated {format(new Date(metric.last_updated_at), 'MMM d, yyyy')}
            </span>
          )}
        </div>
      </div>

      {/* Current Value */}
      <div className="w-32">
        {isEditing && !isLocked ? (
          <Input
            type="number"
            step="0.01"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            placeholder="Current"
            className="h-8"
            autoFocus
          />
        ) : (
          <div className="text-right">
            <div className={cn('text-lg font-semibold', getStatusColor())}>
              {metric.current_numeric !== null ? metric.current_numeric.toFixed(2) : '—'}
            </div>
            <div className="text-xs text-gray-500">{metric.unit}</div>
          </div>
        )}
      </div>

      {/* Target Value */}
      <div className="w-24 text-right">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {metric.target_numeric !== null ? metric.target_numeric.toFixed(2) : '—'}
        </div>
        <div className="text-xs text-gray-500">{metric.unit}</div>
      </div>

      {/* Progress */}
      <div className="w-20 text-right">
        {progress !== null && (
          <span className={cn('text-sm font-semibold', getStatusColor())}>
            {progress.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="w-20 flex justify-end gap-1">
        {isEditing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSave}
              disabled={isSaving}
              className="h-8 w-8 p-0"
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              disabled={isSaving}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsEditing(true)}
            disabled={isLocked}
            className="h-8 w-8 p-0"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

