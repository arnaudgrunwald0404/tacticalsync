import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Brain, Loader2, Send, Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface QueryResult {
  question: string;
  answer: string;
  context_size?: { preps: number; topics: number; actions: number };
  timestamp: Date;
}

interface RelationshipQueryDialogProps {
  open: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
}

// ── Suggested questions ────────────────────────────────────────────────────────

function getSuggestedQuestions(firstName: string): string[] {
  return [
    `What commitments has ${firstName} made in the last month?`,
    `What topics keep coming up in our 1:1s?`,
    `When did we last discuss career growth?`,
    `What action items are still unresolved?`,
    `How has ${firstName}'s workload changed over time?`,
    `What decisions have we made together recently?`,
  ];
}

// ── Simple markdown rendering ──────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-sm font-semibold mt-3 mb-1 text-foreground">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-xs font-semibold mt-2 mb-1 text-foreground">
          {line.slice(4)}
        </h4>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 ml-2">
          <span className="text-primary mt-0.5 flex-shrink-0 text-xs">•</span>
          <span className="text-xs text-muted-foreground leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />);
    } else {
      elements.push(
        <p key={i} className="text-xs text-muted-foreground leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RelationshipQueryDialog({
  open, onClose, memberId, memberName,
}: RelationshipQueryDialogProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QueryResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const firstName = memberName.split(' ')[0];

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Scroll to bottom on new results
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [results]);

  const submitQuery = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;

    setQuestion('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/query-relationship-history`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team_member_id: memberId,
          question: q.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        if (res.status === 429) {
          toast({ title: 'Rate limit', description: 'Max 10 relationship queries per day', variant: 'destructive' });
          return;
        }
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as {
        answer: string;
        context_size?: { preps: number; topics: number; actions: number };
      };

      setResults(prev => [...prev, {
        question: q.trim(),
        answer: data.answer,
        context_size: data.context_size,
        timestamp: new Date(),
      }]);

    } catch (err) {
      toast({
        title: 'Query failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [memberId, loading, toast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitQuery(question);
    }
  }, [question, submitQuery]);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">
          Ask about {memberName}
        </DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Ask about {firstName}</h2>
            <p className="text-[10px] text-muted-foreground">
              Query your full 1:1 history — prep notes, topics, action items
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-[200px]">
          {results.length === 0 && !loading && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ask anything about your relationship with {firstName}. Some ideas:
              </p>
              <div className="flex flex-wrap gap-2">
                {getSuggestedQuestions(firstName).map((q, i) => (
                  <button
                    key={i}
                    onClick={() => submitQuery(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted transition-colors text-left"
                  >
                    <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.map((result, i) => (
            <div key={i} className="space-y-2">
              {/* Question */}
              <div className="flex justify-end">
                <div className="bg-primary text-primary-foreground rounded-lg rounded-br-sm px-3 py-2 max-w-[80%]">
                  <p className="text-xs">{result.question}</p>
                </div>
              </div>

              {/* Answer */}
              <div className="bg-muted/50 rounded-lg rounded-bl-sm px-4 py-3 border border-border">
                {renderMarkdown(result.answer)}
                {result.context_size && (
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">
                      {result.context_size.preps} preps
                    </Badge>
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">
                      {result.context_size.topics} topics
                    </Badge>
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">
                      {result.context_size.actions} actions
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs">Searching relationship history...</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask about ${firstName}...`}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
              disabled={loading}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={!question.trim() || loading}
              onClick={() => submitQuery(question)}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
