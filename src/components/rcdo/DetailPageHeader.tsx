import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lock, Unlock, MessageSquare, MoreVertical, TrendingUp, AlertTriangle, TrendingDown, Table2, BarChart3, Pencil, Calendar } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { calculateDOHealth, getHealthColor } from '@/lib/rcdoScoring';
import { parseLocalDate } from '@/lib/dateUtils';

type ProfileEntry = {
  id: string;
  full_name?: string | null;
  avatar_name?: string | null;
  avatar_url?: string | null;
};

export interface DetailPageHeaderProps {
  // Common fields
  title: string;
  description?: string | null;
  owner?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    avatar_name?: string | null;
  } | null;
  isLocked: boolean;
  isOwner: boolean;
  currentUserId: string | null;

  // DO-specific
  type: 'do' | 'si';
  doId?: string;
  metrics?: Array<{ id: string; type: string; name?: string }>;
  status?: string;

  // Actions
  onLock?: () => void;
  onUnlock?: () => void;
  onCheckIn?: () => void;
  canLock?: boolean;
  canEdit?: boolean;

  // SI-specific actions
  viewMode?: 'table' | 'gantt';
  onViewModeChange?: (mode: 'table' | 'gantt') => void;
  activeTab?: string;
  onTabChange?: (value: string) => void;
  tasksCount?: number;
  checkinsCount?: number;
  acceptsSubSis?: boolean;
  subSiCount?: number;

  // Additional content (for selected items in header)
  additionalContent?: React.ReactNode;

  // Inline editing
  editableTitle?: string;
  onTitleChange?: (value: string) => Promise<void>;
  onDescriptionChange?: (value: string) => Promise<void>;
  onOwnerChange?: (userId: string) => Promise<void>;
  profiles?: ProfileEntry[];

  // SI dates (shown inline with owner)
  startDate?: string | null;
  endDate?: string | null;
  onStartDateChange?: (value: string) => Promise<void>;
  onEndDateChange?: (value: string) => Promise<void>;
  dateError?: string | null;

  // SI kebab actions
  onBreakIntoSubSIs?: () => void;
}

export function DetailPageHeader({
  title,
  description,
  owner,
  isLocked,
  isOwner,
  currentUserId,
  type,
  doId,
  metrics = [],
  status,
  onLock,
  onUnlock,
  onCheckIn,
  canLock = false,
  canEdit = false,
  viewMode,
  onViewModeChange,
  activeTab,
  onTabChange,
  tasksCount = 0,
  checkinsCount = 0,
  acceptsSubSis = false,
  subSiCount = 0,
  additionalContent,
  editableTitle,
  onTitleChange,
  onDescriptionChange,
  onOwnerChange,
  profiles = [],
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  dateError,
  onBreakIntoSubSIs,
}: DetailPageHeaderProps) {
  const ownerName = getFullNameForAvatar(
    owner?.first_name,
    owner?.last_name,
    owner?.full_name
  );

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(editableTitle ?? title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(description ?? '');
  const [editingOwner, setEditingOwner] = useState(false);

  useEffect(() => { setTitleDraft(editableTitle ?? title); }, [editableTitle, title]);
  useEffect(() => { setDescDraft(description ?? ''); }, [description]);

  // Non-editable prefix shown before the title input (e.g. "3.0 ")
  const editableStart = editableTitle != null ? title.indexOf(editableTitle) : -1;
  const displayPrefix = editableStart > 0 ? title.slice(0, editableStart) : '';

  // Calculate health for DOs
  let healthResult: { health: 'on_track' | 'at_risk' | 'off_track' | 'done' } = { health: 'on_track' };
  if (type === 'do' && doId) {
    healthResult = calculateDOHealth(doId, metrics as unknown as Parameters<typeof calculateDOHealth>[1]);
  }
  const isDefaultState = status === 'draft' || (type === 'do' && metrics.length === 0);
  // healthColor computed for future use
  const _healthColor = isDefaultState ? 'text-[#5B6E7A]' : getHealthColor(healthResult.health);

  const healthIcons = {
    on_track: TrendingUp,
    at_risk: AlertTriangle,
    off_track: TrendingDown,
    done: TrendingUp,
  };

  const HealthIcon = healthIcons[healthResult.health];

  return (
    <Card className="p-6 mb-6">
      {/* Title */}
      <div className="flex items-center gap-2 mb-3 group/title">
        {editingTitle ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {displayPrefix && (
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 shrink-0">
                {displayPrefix}
              </span>
            )}
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={async () => {
                if (titleDraft !== (editableTitle ?? title)) {
                  await onTitleChange?.(titleDraft);
                }
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (titleDraft !== (editableTitle ?? title)) onTitleChange?.(titleDraft);
                  setEditingTitle(false);
                }
                if (e.key === 'Escape') {
                  setTitleDraft(editableTitle ?? title);
                  setEditingTitle(false);
                }
              }}
              autoFocus
              className="text-3xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-blue-500 focus:outline-none flex-1 min-w-0"
            />
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {title}
            </h1>
            {isLocked && (
              <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            )}
            {!isLocked && canEdit && onTitleChange && (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="opacity-0 group-hover/title:opacity-100 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity shrink-0"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Description */}
      <div className="group/desc mb-3">
        {editingDesc ? (
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={async () => {
              if (descDraft !== (description ?? '')) {
                await onDescriptionChange?.(descDraft);
              }
              setEditingDesc(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDescDraft(description ?? '');
                setEditingDesc(false);
              }
            }}
            autoFocus
            rows={3}
            className="w-full text-gray-700 dark:text-gray-300 bg-transparent border-b-2 border-blue-500 focus:outline-none resize-none"
          />
        ) : (
          <div className="flex items-start gap-2">
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap flex-1">
              {(() => {
                const text = description ? description.replace(/<[^>]*>/g, '').trim() : '';
                if (text) return text;
                return onDescriptionChange
                  ? <span className="text-gray-400 italic text-sm">Add a description...</span>
                  : null;
              })()}
            </p>
            {!isLocked && canEdit && onDescriptionChange && (
              <button
                type="button"
                onClick={() => setEditingDesc(true)}
                className="opacity-0 group-hover/desc:opacity-100 mt-0.5 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Owner + Dates row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 text-sm group/owner">
          {editingOwner ? (
            <Select
              value={owner?.id ?? ''}
              open
              onOpenChange={(open) => { if (!open) setEditingOwner(false); }}
              onValueChange={async (val) => {
                await onOwnerChange?.(val);
                setEditingOwner(false);
              }}
            >
              <SelectTrigger className="h-8 w-auto min-w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <FancyAvatar
                        name={p.avatar_name || p.full_name}
                        displayName={p.full_name}
                        avatarUrl={p.avatar_url}
                        size="sm"
                      />
                      <span>{p.full_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              {owner ? (
                <>
                  <FancyAvatar
                    name={owner.avatar_name || ownerName}
                    displayName={ownerName}
                    avatarUrl={owner.avatar_url}
                    size="sm"
                  />
                  <span className="text-gray-700 dark:text-gray-300">{ownerName}</span>
                </>
              ) : (
                onOwnerChange && (
                  <span className="text-gray-400 italic text-sm">No owner assigned</span>
                )
              )}
              {!isLocked && canEdit && onOwnerChange && (
                <button
                  type="button"
                  onClick={() => setEditingOwner(true)}
                  className="opacity-0 group-hover/owner:opacity-100 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Dates — SI only */}
        {type === 'si' && (startDate || endDate || onStartDateChange || onEndDateChange) && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {isLocked || !onStartDateChange ? (
                <span>
                  {startDate
                    ? parseLocalDate(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : <span className="italic text-gray-400">No start date</span>}
                </span>
              ) : (
                <input
                  type="date"
                  value={startDate || ''}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className="h-7 text-sm text-gray-600 dark:text-gray-400 bg-transparent border border-gray-200 dark:border-gray-700 rounded px-1.5 focus:outline-none focus:border-blue-400 w-[140px]"
                  placeholder="Start date"
                />
              )}
              <span className="text-gray-300">→</span>
              {isLocked || !onEndDateChange ? (
                <span>
                  {endDate
                    ? parseLocalDate(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : <span className="italic text-gray-400">No end date</span>}
                </span>
              ) : (
                <input
                  type="date"
                  value={endDate || ''}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className="h-7 text-sm text-gray-600 dark:text-gray-400 bg-transparent border border-gray-200 dark:border-gray-700 rounded px-1.5 focus:outline-none focus:border-blue-400 w-[140px]"
                  placeholder="End date"
                />
              )}
            </div>
            {dateError && (
              <p className="text-xs text-red-500">{dateError}</p>
            )}
          </div>
        )}
      </div>

      {/* Action buttons + status badge row — below owner */}
      <div className="flex items-center gap-2 mt-3">
        {isOwner && !isLocked && onCheckIn && (
          <Button variant="outline" size="sm" onClick={onCheckIn}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Check-In
          </Button>
        )}
        {canLock && !isLocked && onLock && (
          <span
            role="button"
            tabIndex={0}
            onClick={onLock}
            onKeyDown={(e) => e.key === 'Enter' && onLock()}
            className="inline-flex items-center border border-transparent rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap bg-[#5B6E7A] text-white cursor-pointer hover:bg-[#4A5D68] transition-colors"
          >
            LOCK
          </span>
        )}
        {type === 'do' && (
          <Badge
            className={
              isDefaultState
                ? 'bg-[#5B6E7A]'
                : healthResult.health === 'on_track'
                ? 'bg-[#6B9A8F]'
                : healthResult.health === 'at_risk'
                ? 'bg-[#B89A6B]'
                : healthResult.health === 'off_track'
                ? 'bg-[#8B6F47]'
                : 'bg-[#6B9A8F]'
            }
          >
            <HealthIcon className="h-3 w-3 mr-1" />
            {healthResult.health.replace('_', ' ').toUpperCase()}
          </Badge>
        )}
        {type === 'si' && status && (
          <Badge className={
            status === 'draft' ? 'bg-[#5B6E7A]' :
            status === 'initialized' ? 'bg-cyan-500' :
            status === 'on_track' ? 'bg-green-500' :
            status === 'delayed' ? 'bg-yellow-500' :
            status === 'cancelled' ? 'bg-red-500' :
            'bg-gray-500'
          }>
            {status.replace('_', ' ').toUpperCase()}
          </Badge>
        )}
        {isLocked && canLock && onUnlock && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onUnlock}>
                <Unlock className="h-4 w-4 mr-2" />
                Unlock
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {type === 'si' && !isLocked && canEdit && onBreakIntoSubSIs && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onBreakIntoSubSIs}>
                Sub-initiatives: {acceptsSubSis ? 'ON' : 'OFF'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Additional content (e.g., selected initiative or task details) */}
      {additionalContent && (
        <div className="mt-4 pt-4 border-t">
          {additionalContent}
        </div>
      )}

      {/* SI-specific: Tabs for Tasks, Check-ins, and Details */}
      {type === 'si' && activeTab && onTabChange && (
        <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Tabs value={activeTab} onValueChange={onTabChange}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="tasks" className="flex-1 sm:flex-initial">
                {acceptsSubSis ? `Sub-initiatives (${subSiCount})` : `Tasks (${tasksCount})`}
              </TabsTrigger>
              <TabsTrigger value="checkins" className="flex-1 sm:flex-initial">
                Check-ins ({checkinsCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {viewMode && onViewModeChange && activeTab === 'tasks' && (
            <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => onViewModeChange('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-[#5B6E7A] text-white'
                    : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('gantt')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
                  viewMode === 'gantt'
                    ? 'bg-[#5B6E7A] text-white'
                    : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Gantt
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
