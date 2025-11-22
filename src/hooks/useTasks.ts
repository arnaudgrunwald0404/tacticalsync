import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  Task,
  TaskWithRelations,
  CreateTaskForm,
  UpdateTaskForm,
} from '@/types/rcdo';

// ============================================================================
// useTasks - Fetch tasks, optionally filtered by SI
// ============================================================================
export function useTasks(siId?: string) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('rc_tasks')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name),
          strategic_initiative:rc_strategic_initiatives!strategic_initiative_id(
            id,
            title,
            description,
            owner_user_id,
            defining_objective_id
          )
        `)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (siId) {
        query = query.eq('strategic_initiative_id', siId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setTasks((data || []) as TaskWithRelations[]);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch tasks';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [siId, toast]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks };
}

// ============================================================================
// useTaskDetails - Fetch single task with relations
// ============================================================================
export function useTaskDetails(taskId: string | undefined) {
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTask = useCallback(async () => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('rc_tasks')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name),
          strategic_initiative:rc_strategic_initiatives!strategic_initiative_id(
            id,
            title,
            description,
            owner_user_id,
            defining_objective_id,
            defining_objective:rc_defining_objectives!defining_objective_id(
              id,
              title,
              rallying_cry_id
            )
          )
        `)
        .eq('id', taskId)
        .single();

      if (fetchError) throw fetchError;

      setTask(data as TaskWithRelations);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch task';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [taskId, toast]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  return { task, loading, error, refetch: fetchTask };
}

// ============================================================================
// useMyTasks - Fetch tasks assigned to current user
// ============================================================================
export function useMyTasks() {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchMyTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setTasks([]);
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('rc_tasks')
        .select(`
          *,
          owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name),
          strategic_initiative:rc_strategic_initiatives!strategic_initiative_id(
            id,
            title,
            description,
            owner_user_id,
            defining_objective_id
          )
        `)
        .eq('owner_user_id', user.id)
        .order('target_delivery_date', { ascending: true, nullsLast: true })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setTasks((data || []) as TaskWithRelations[]);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch my tasks';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMyTasks();
  }, [fetchMyTasks]);

  return { tasks, loading, error, refetch: fetchMyTasks };
}

// ============================================================================
// useTasksBySI - Fetch all tasks for a specific SI
// ============================================================================
export function useTasksBySI(siId: string | undefined) {
  return useTasks(siId);
}

// ============================================================================
// createTask - Create a new task
// ============================================================================
export async function createTask(data: CreateTaskForm): Promise<Task> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: task, error } = await supabase
    .from('rc_tasks')
    .insert({
      ...data,
      created_by: user.id,
      status: data.status || 'not_assigned',
    })
    .select()
    .single();

  if (error) throw error;
  return task as Task;
}

// ============================================================================
// updateTask - Update a task
// ============================================================================
export async function updateTask(taskId: string, data: UpdateTaskForm): Promise<Task> {
  // Auto-set actual_delivery_date when status is changed to completed
  const updateData = { ...data };
  if (data.status === 'completed' && !data.actual_delivery_date) {
    updateData.actual_delivery_date = new Date().toISOString().split('T')[0];
  }
  
  const { data: task, error } = await supabase
    .from('rc_tasks')
    .update(updateData)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return task as Task;
}

// ============================================================================
// deleteTask - Delete a task
// ============================================================================
export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('rc_tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw error;
}

