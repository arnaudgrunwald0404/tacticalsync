import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Pencil, X, EyeOff, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseLocalDate } from '@/lib/dateUtils';
import { format } from 'date-fns';

// Idea #11: admin-authored, org-wide (company-wide, direct_report-only)
// recurring talking points injected into every manager's 1:1 prep.
// See PLAN_idea11_org_wide_talking_points.md §5.2.

interface OrgTalkingPointRow {
  id: string;
  title: string;
  body: string;
  starts_on: string;
  ends_on: string;
  active: boolean;
  created_at: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  title: '',
  body: '',
  startsOn: todayIso(),
  endsOn: todayIso(),
});

export default function OrgTalkingPointsPanel() {
  const { toast } = useToast();
  const [points, setPoints] = useState<OrgTalkingPointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const loadPoints = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cos_org_talking_points' as never)
        .select('id, title, body, starts_on, ends_on, active, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPoints((data ?? []) as unknown as OrgTalkingPointRow[]);
    } catch (err) {
      console.error('Failed to load org talking points:', err);
      toast({ title: 'Error', description: 'Failed to load talking points.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPoints(); }, [loadPoints]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const startCreate = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (p: OrgTalkingPointRow) => {
    setForm({ title: p.title, body: p.body, startsOn: p.starts_on, endsOn: p.ends_on });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) {
      toast({ title: 'Missing fields', description: 'Title and body are required.', variant: 'destructive' });
      return;
    }
    if (form.endsOn < form.startsOn) {
      toast({ title: 'Invalid dates', description: 'End date must be on or after the start date.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('cos_org_talking_points' as never)
          .update({ title, body, starts_on: form.startsOn, ends_on: form.endsOn } as never)
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Talking point updated' });
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error('Not authenticated');
        const { error } = await supabase
          .from('cos_org_talking_points' as never)
          .insert({
            title,
            body,
            starts_on: form.startsOn,
            ends_on: form.endsOn,
            created_by: userData.user.id,
          } as never);
        if (error) throw error;
        toast({ title: 'Talking point created' });
      }
      resetForm();
      await loadPoints();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Deactivate = active=false, never a hard delete, so historical talking
  // points stay auditable (matches cos_relationship_topics.status /
  // cos_meeting_actions.status's soft-lifecycle precedent).
  const toggleActive = async (p: OrgTalkingPointRow) => {
    try {
      const { error } = await supabase
        .from('cos_org_talking_points' as never)
        .update({ active: !p.active } as never)
        .eq('id', p.id);
      if (error) throw error;
      setPoints(prev => prev.map(row => (row.id === p.id ? { ...row, active: !p.active } : row)));
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const isCurrentlyActive = (p: OrgTalkingPointRow) => {
    const today = todayIso();
    return p.active && p.starts_on <= today && p.ends_on >= today;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Existing talking points</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Injected into every direct report's 1:1 prep while their window is active.
            </p>
          </div>
          {!showForm && (
            <Button size="sm" onClick={startCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              New talking point
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />Loading…
            </div>
          ) : points.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6">No talking points yet — create one to push it into every manager's 1:1 prep.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {points.map(p => (
                <div key={p.id} className="flex items-start gap-3 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[14px]">{p.title}</span>
                      {isCurrentlyActive(p) ? (
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground mt-1 whitespace-pre-wrap">{p.body}</p>
                    <p className="text-[12px] text-muted-foreground mt-1.5">
                      {format(parseLocalDate(p.starts_on), 'MMM d, yyyy')} – {format(parseLocalDate(p.ends_on), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(p)}>
                      {p.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? 'Edit talking point' : 'New talking point'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="tp-title">Title</Label>
              <Input
                id="tp-title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Engagement survey"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="tp-body">Body</Label>
              <Textarea
                id="tp-body"
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="e.g. Ask each direct report whether they've completed the engagement survey and if they have any concerns about it."
                className="mt-1.5"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tp-start">Start date</Label>
                <Input
                  id="tp-start"
                  type="date"
                  value={form.startsOn}
                  onChange={e => setForm(f => ({ ...f, startsOn: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="tp-end">End date</Label>
                <Input
                  id="tp-end"
                  type="date"
                  value={form.endsOn}
                  onChange={e => setForm(f => ({ ...f, endsOn: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                {editingId ? 'Save changes' : 'Create talking point'}
              </Button>
              <Button variant="ghost" onClick={resetForm} disabled={saving}>
                <X className="h-4 w-4 mr-1.5" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
