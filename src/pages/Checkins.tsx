import { useEffect, useState, useCallback } from 'react';
import GridBackground from '@/components/ui/grid-background';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { MyCheckinFeedSidebar } from '@/components/rcdo/MyCheckinFeedSidebar';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';

interface ItemBase { id: string; title: string; kind: 'do' | 'si' }

export default function CheckinsPage() {
  const [loading, setLoading] = useState(true);
  const [myDOs, setMyDOs] = useState<ItemBase[]>([]);
  const [mySIs, setMySIs] = useState<ItemBase[]>([]);

  // Workspace local state persisted in localStorage
  type WorkspaceState = {
    milestones: string[];
    todos: { id: string; text: string; done: boolean }[];
    dependencies: string[];
  };
  const [workspace, setWorkspace] = useState<Record<string, WorkspaceState>>({});

  const storageKey = 'my-workspace-v1';

  // Load DOs and SIs for current user
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) {
          setMyDOs([]);
          setMySIs([]);
          return;
        }

        // Owned DOs
        const { data: ownerDOs } = await supabase
          .from('rc_defining_objectives')
          .select('id, title')
          .eq('owner_user_id', userId)
          .order('title', { ascending: true });

        // Owned SIs
        const { data: ownerSIs } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title')
          .eq('owner_user_id', userId)
          .order('title', { ascending: true });

        // Participant SIs
        const { data: participantContains, error: containsErr } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, participant_user_ids')
          .contains('participant_user_ids', [userId])
          .order('title', { ascending: true });
        const participantSIs = containsErr ? [] : (participantContains || []);

        setMyDOs((ownerDOs || []).map((d) => ({ id: d.id, title: d.title, kind: 'do' })));
        // De-dup SIs by id
        const siSeen = new Set<string>();
        const combinedSIs = [ ...(ownerSIs || []), ...participantSIs ];
        const finalSIs: ItemBase[] = [];
        for (const s of combinedSIs) {
          if (!siSeen.has(s.id)) { siSeen.add(s.id); finalSIs.push({ id: s.id, title: s.title, kind: 'si' }); }
        }
        setMySIs(finalSIs);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load persisted workspace
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setWorkspace(JSON.parse(raw));
    } catch (_) {}
  }, []);

  // Persist workspace
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    } catch (_) {}
  }, [workspace]);

  const ensureState = useCallback((id: string) => {
    setWorkspace((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: { milestones: [], todos: [], dependencies: [] } };
    });
  }, []);

  const addListItem = (id: string, field: keyof WorkspaceState, value: string) => {
    setWorkspace((prev) => {
      const next = { ...prev };
      const st = next[id] || { milestones: [], todos: [], dependencies: [] };
      if (field === 'todos') {
        st.todos = [...st.todos, { id: Math.random().toString(36).slice(2,7), text: value, done: false }];
      } else if (field === 'milestones') {
        st.milestones = [...st.milestones, value];
      } else {
        st.dependencies = [...st.dependencies, value];
      }
      next[id] = st;
      return next;
    });
  };

  const toggleTodo = (id: string, todoId: string) => {
    setWorkspace((prev) => {
      const next = { ...prev };
      const st = next[id];
      if (!st) return prev;
      st.todos = st.todos.map((t) => t.id === todoId ? { ...t, done: !t.done } : t);
      return next;
    });
  };

  const removeItem = (id: string, field: keyof WorkspaceState, indexOrTodoId: number | string) => {
    setWorkspace((prev) => {
      const next = { ...prev };
      const st = next[id];
      if (!st) return prev;
      if (field === 'todos') {
        st.todos = st.todos.filter((t) => t.id !== indexOrTodoId);
      } else if (field === 'milestones') {
        st.milestones = st.milestones.filter((_, i) => i !== indexOrTodoId);
      } else {
        st.dependencies = st.dependencies.filter((_, i) => i !== indexOrTodoId);
      }
      return next;
    });
  };

  const SectionList = ({
    id,
    title,
    field,
    placeholder
  }: { id: string; title: string; field: keyof WorkspaceState; placeholder: string }) => {
    const st = workspace[id] || { milestones: [], todos: [], dependencies: [] };
    const [val, setVal] = useState('');
    const onAdd = () => { if (!val.trim()) return; addListItem(id, field, val.trim()); setVal(''); };

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">{title}</div>
        </div>
        {field === 'todos' ? (
          <div className="space-y-2">
            {st.todos.length === 0 && (
              <div className="text-xs text-muted-foreground">No to-dos yet.</div>
            )}
            {st.todos.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={t.done} onChange={() => toggleTodo(id, t.id)} />
                <span className={`text-sm flex-1 ${t.done ? 'line-through text-muted-foreground' : ''}`}>{t.text}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(id, 'todos', t.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} className="h-8" />
              <Button size="sm" onClick={onAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {field === 'milestones' && st.milestones.length === 0 && (
              <div className="text-xs text-muted-foreground">No milestones yet.</div>
            )}
            {field === 'dependencies' && st.dependencies.length === 0 && (
              <div className="text-xs text-muted-foreground">No dependencies yet.</div>
            )}
            {(field === 'milestones' ? st.milestones : st.dependencies).map((text, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-sm flex-1">{text}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(id, field, idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} className="h-8" />
              <Button size="sm" onClick={onAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinParent, setCheckinParent] = useState<{ id: string; title: string; kind: 'do' | 'initiative' } | null>(null);

  const openCheckin = (item: ItemBase) => {
    ensureState(item.id);
    setCheckinParent({ id: item.id, title: item.title, kind: item.kind === 'do' ? 'do' : 'initiative' });
    setCheckinOpen(true);
  };

  if (loading) {
    return (
      <GridBackground>
        <main className="container mx-auto px-4 py-6 sm:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-36 w-full" />
              ))}
            </div>
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </div>
        </main>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* My Workspace */}
          <section className="space-y-6">
            <h2 className="text-xl font-semibold">My Workspace</h2>

            {/* My DOs */}
            {myDOs.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">My Defining Objectives</h3>
                {myDOs.map((d) => (
                  <Card key={d.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">DO</Badge>
                        <div className="font-semibold">{d.title}</div>
                      </div>
                      <Button size="sm" onClick={() => openCheckin(d)}>
                        <MessageSquare className="h-3.5 w-3.5 mr-1" /> Check-In
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <SectionList id={d.id} title="Milestones this cycle" field="milestones" placeholder="Add milestone" />
                      <SectionList id={d.id} title="To-do list" field="todos" placeholder="Add to-do" />
                      <SectionList id={d.id} title="Dependencies" field="dependencies" placeholder="Add dependency" />
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* My SIs */}
            {mySIs.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">My Strategic Initiatives</h3>
                {mySIs.map((s) => (
                  <Card key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">SI</Badge>
                        <div className="font-semibold">{s.title}</div>
                      </div>
                      <Button size="sm" onClick={() => openCheckin(s)}>
                        <MessageSquare className="h-3.5 w-3.5 mr-1" /> Check-In
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <SectionList id={s.id} title="Milestones this cycle" field="milestones" placeholder="Add milestone" />
                      <SectionList id={s.id} title="To-do list" field="todos" placeholder="Add to-do" />
                      <SectionList id={s.id} title="Dependencies" field="dependencies" placeholder="Add dependency" />
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {myDOs.length === 0 && mySIs.length === 0 && (
              <Card className="p-6">
                <div className="text-sm text-muted-foreground">You don’t have any DOs or SIs yet.</div>
              </Card>
            )}
          </section>

          {/* Sidebar: My check-in updates (same format as RCDO, filtered to me) */}
          <aside className="hidden lg:block h-full border-l border-gray-200 bg-gray-50 shadow-md overflow-y-auto p-3">
            <MyCheckinFeedSidebar />
          </aside>
        </div>
      </main>

      {checkinParent && (
        <CheckInDialog
          isOpen={checkinOpen}
          onClose={() => setCheckinOpen(false)}
          parentType={checkinParent.kind}
          parentId={checkinParent.id}
          parentName={checkinParent.title}
          onSuccess={() => setCheckinOpen(false)}
        />
      )}
    </GridBackground>
  );
}
