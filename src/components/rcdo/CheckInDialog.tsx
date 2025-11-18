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
import type { CheckinParentType } from '@/types/rcdo';
import { format } from 'date-fns';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';

interface CheckInDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentType: CheckinParentType;
  parentId: string;
  parentName: string;
  onSuccess?: () => void;
}

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  avatar_name: string | null;
}

const colorOptions = [
  { value: '2', label: 'Very Happy', color: 'bg-emerald-500', sentiment: 2 },
  { value: '1', label: 'Happy', color: 'bg-green-500', sentiment: 1 },
  { value: '0', label: 'Neutral', color: 'bg-gray-500', sentiment: 0 },
  { value: '-1', label: 'Unhappy', color: 'bg-orange-500', sentiment: -1 },
  { value: '-2', label: 'Very Unhappy', color: 'bg-red-500', sentiment: -2 },
];

export function CheckInDialog({
  isOpen,
  onClose,
  parentType,
  parentId,
  parentName,
  onSuccess,
}: CheckInDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<{
    reporterId: string;
    checkinDate: string;
    comment: string;
    results: string;
    colorCode: string;
  }>({
    reporterId: '',
    checkinDate: format(new Date(), 'yyyy-MM-dd'),
    comment: '',
    results: '',
    colorCode: '0',
  });

  // Load profiles and current user
  useEffect(() => {
    const loadData = async () => {
      setProfilesLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          setFormData(prev => ({ ...prev, reporterId: user.id }));
        }

        const { data: profilesData, error } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, avatar_url, avatar_name')
          .order('full_name', { ascending: true });

        if (error) throw error;
        setProfiles(profilesData || []);
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to load profiles',
          variant: 'destructive',
        });
      } finally {
        setProfilesLoading(false);
      }
    };

    if (isOpen) {
      loadData();
    }
  }, [isOpen, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.reporterId) {
      toast({
        title: 'Validation Error',
        description: 'Reporter is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const selectedColor = colorOptions.find(c => c.value === formData.colorCode);
      const sentiment = selectedColor?.sentiment ?? 0;

      const { error } = await supabase
        .from('rc_checkins')
        .insert({
          parent_type: parentType,
          parent_id: parentId,
          date: formData.checkinDate,
          summary: formData.comment.trim() || null,
          next_steps: formData.results.trim() || null,
          sentiment: sentiment,
          created_by: formData.reporterId,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Check-in created successfully',
      });

      handleClose();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create check-in',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      reporterId: currentUserId || '',
      checkinDate: format(new Date(), 'yyyy-MM-dd'),
      comment: '',
      results: '',
      colorCode: '0',
    });
    onClose();
  };

  const selectedReporter = profiles.find(p => p.id === formData.reporterId);
  const reporterName = getFullNameForAvatar(
    selectedReporter?.first_name,
    selectedReporter?.last_name,
    selectedReporter?.full_name
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Check-In</DialogTitle>
          <DialogDescription>
            Add a check-in update for {parentType === 'do' ? 'Defining Objective' : 'Strategic Initiative'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Parent Name (read-only) */}
            <div className="space-y-2">
              <Label>Name of {parentType === 'do' ? 'DO' : 'SI'}</Label>
              <div className="px-3 py-2 rounded-md border bg-muted text-sm font-medium">
                {parentName}
              </div>
            </div>

            {/* Reporter */}
            <div className="space-y-2">
              <Label htmlFor="reporter">
                Name of Reporter <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.reporterId}
                onValueChange={(value) =>
                  setFormData({ ...formData, reporterId: value })
                }
                disabled={loading || profilesLoading}
                required
              >
                <SelectTrigger id="reporter">
                  <SelectValue>
                    {selectedReporter && (
                      <div className="flex items-center gap-2">
                        {selectedReporter.avatar_url ? (
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={selectedReporter.avatar_url} />
                            <AvatarFallback>{reporterName}</AvatarFallback>
                          </Avatar>
                        ) : (
                          <FancyAvatar 
                            name={selectedReporter.avatar_name || reporterName} 
                            size={20} 
                          />
                        )}
                        <span>{reporterName}</span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => {
                    const name = getFullNameForAvatar(
                      profile.first_name,
                      profile.last_name,
                      profile.full_name
                    );
                    return (
                      <SelectItem key={profile.id} value={profile.id}>
                        <div className="flex items-center gap-2">
                          {profile.avatar_url ? (
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={profile.avatar_url} />
                              <AvatarFallback>{name}</AvatarFallback>
                            </Avatar>
                          ) : (
                            <FancyAvatar 
                              name={profile.avatar_name || name} 
                              size={20} 
                            />
                          )}
                          <span>{name}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Check-in Date */}
            <div className="space-y-2">
              <Label htmlFor="checkinDate">
                Check-in Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="checkinDate"
                type="date"
                value={formData.checkinDate}
                onChange={(e) =>
                  setFormData({ ...formData, checkinDate: e.target.value })
                }
                disabled={loading}
                required
              />
            </div>

            {/* Comment Update */}
            <div className="space-y-2">
              <Label htmlFor="comment">Comment Update</Label>
              <Textarea
                id="comment"
                placeholder="Add your comments about progress, challenges, or updates..."
                value={formData.comment}
                onChange={(e) =>
                  setFormData({ ...formData, comment: e.target.value })
                }
                disabled={loading}
                rows={4}
              />
            </div>

            {/* Results Update */}
            <div className="space-y-2">
              <Label htmlFor="results">Results Update</Label>
              <Textarea
                id="results"
                placeholder="Describe results, outcomes, or next steps..."
                value={formData.results}
                onChange={(e) =>
                  setFormData({ ...formData, results: e.target.value })
                }
                disabled={loading}
                rows={4}
              />
            </div>

            {/* Color Code */}
            <div className="space-y-2">
              <Label htmlFor="colorCode">Color Code</Label>
              <Select
                value={formData.colorCode}
                onValueChange={(value) =>
                  setFormData({ ...formData, colorCode: value })
                }
                disabled={loading}
              >
                <SelectTrigger id="colorCode">
                  <SelectValue>
                    {colorOptions.find(c => c.value === formData.colorCode)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <div className={`h-4 w-4 rounded-full ${option.color}`} />
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  ))}
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
            <Button type="submit" disabled={loading || profilesLoading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Check-In
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

