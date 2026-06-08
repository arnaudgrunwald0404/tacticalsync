import React, { useState, useEffect } from 'react';
import {
  Loader2, Unlink, CheckCircle2, XCircle, ExternalLink, Plug,
  ChevronDown, Briefcase, Database, Globe, Server, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { IntegrationPreset, McpIntegrationRow } from '@/types/mcp-integration';

// ── Icon resolver (keeps presets serializable) ───────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase, Database, Globe, Server, Zap, Plug,
};

function IntegrationIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Plug;
  return <Icon className={className} />;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface McpIntegrationPanelProps {
  preset: IntegrationPreset;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function McpIntegrationPanel({ preset }: McpIntegrationPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<McpIntegrationRow | null>(null);

  // Form state
  const [baseUrl, setBaseUrl] = useState(preset.defaultBaseUrl ?? '');
  const [authValue, setAuthValue] = useState('');
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showEndpoints, setShowEndpoints] = useState(true);

  // ── Load existing connection state ─────────────────────────────────────────

  useEffect(() => {
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('cos_mcp_integrations')
        .select('*')
        .eq('integration_key', preset.key)
        .maybeSingle();

      if (data) {
        const r = data as McpIntegrationRow;
        setRow(r);
        setBaseUrl(r.base_url || preset.defaultBaseUrl || '');
        // Don't populate authValue — we never send it back to the client after save
      }
      setLoading(false);
    }
    load();
  }, [preset.key, preset.defaultBaseUrl]);

  // ── Test connection ────────────────────────────────────────────────────────

  const handleTest = async () => {
    if (!baseUrl.trim()) {
      toast({ title: 'Base URL required', variant: 'destructive' });
      return;
    }
    if (!authValue.trim() && !row?.is_connected) {
      toast({ title: `${preset.auth.headerName ?? 'API key'} required`, variant: 'destructive' });
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-mcp-integration', {
        body: {
          integration_key: preset.key,
          base_url: baseUrl.trim().replace(/\/+$/, ''),
          auth_value: authValue.trim() || undefined,
          auth_header_name: preset.auth.headerName ?? 'Authorization',
          test_endpoint: preset.testEndpoint ?? '/',
        },
      });

      if (error) throw error;

      const result = data as { status: 'ok' | 'error'; error?: string; preview?: unknown };

      if (result.status === 'ok') {
        toast({ title: `${preset.name} connected` });
        setRow(prev => ({
          ...(prev ?? {
            id: '', user_id: '', integration_key: preset.key,
            auth_value: null, config: {}, created_at: '', updated_at: '',
          }),
          base_url: baseUrl.trim(),
          is_connected: true,
          last_test_at: new Date().toISOString(),
          last_test_status: 'ok' as const,
          last_test_error: null,
        }));
        setAuthValue(''); // Clear after successful save
      } else {
        toast({
          title: 'Connection failed',
          description: result.error ?? 'Unknown error',
          variant: 'destructive',
        });
        setRow(prev => prev ? {
          ...prev,
          is_connected: false,
          last_test_at: new Date().toISOString(),
          last_test_status: 'error' as const,
          last_test_error: result.error ?? null,
        } : null);
      }
    } catch (err) {
      toast({
        title: 'Test failed',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('test-mcp-integration', {
        body: {
          action: 'disconnect',
          integration_key: preset.key,
        },
      });
      if (error) throw error;

      toast({ title: `${preset.name} disconnected` });
      setRow(prev => prev ? {
        ...prev,
        auth_value: null,
        is_connected: false,
        last_test_at: null,
        last_test_status: null,
        last_test_error: null,
      } : null);
      setAuthValue('');
    } catch (err) {
      toast({ title: 'Disconnect failed', description: String(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return null;

  const isConnected = row?.is_connected === true;
  const lastTestFailed = row?.last_test_status === 'error';

  return (
    <div className="space-y-6">
      {/* Connection card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IntegrationIcon name={preset.iconName} className="h-4 w-4" />
            Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected ? (
            <>
              <div className="flex items-center gap-3">
                <Badge className="bg-emerald-50 text-emerald-700 border-0 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
                <span className="text-sm text-muted-foreground truncate">{row?.base_url}</span>
              </div>
              {row?.last_test_at && (
                <p className="text-xs text-muted-foreground">
                  Last tested {new Date(row.last_test_at).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2 pt-1 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="gap-1.5">
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Test again
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{preset.description}</p>

              {lastTestFailed && row?.last_test_error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-destructive">{row.last_test_error}</p>
                </div>
              )}

              <div className="space-y-3 max-w-lg">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Base URL</label>
                  <Input
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    placeholder={preset.defaultBaseUrl || 'https://your-instance.netlify.app'}
                    className="h-9 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    {preset.auth.headerName ?? 'API Key'}
                  </label>
                  <Input
                    type="password"
                    value={authValue}
                    onChange={e => setAuthValue(e.target.value)}
                    placeholder={preset.auth.envVarHint ? `Value of ${preset.auth.envVarHint}` : 'Enter API key'}
                    className="h-9 text-sm font-mono"
                  />
                  {preset.auth.envVarHint && (
                    <p className="text-[11px] text-muted-foreground">
                      The value of your <code className="bg-muted px-1 rounded text-[10px]">{preset.auth.envVarHint}</code> environment variable.
                    </p>
                  )}
                </div>
                <Button size="sm" onClick={handleTest} disabled={testing} className="gap-1.5">
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                  Connect &amp; test
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Endpoints reference */}
      {preset.endpoints && preset.endpoints.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <button
              onClick={() => setShowEndpoints(e => !e)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-base">Available endpoints</CardTitle>
              <ChevronDown className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                showEndpoints && 'rotate-180',
              )} />
            </button>
          </CardHeader>
          {showEndpoints && (
            <CardContent className="pt-4">
              <div className="space-y-2">
                {preset.endpoints.map(ep => (
                  <div
                    key={ep.path}
                    className="flex items-start gap-3 rounded-lg border border-border/50 p-3"
                  >
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px] font-mono flex-shrink-0 mt-0.5',
                        ep.method === 'GET' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                      )}
                    >
                      {ep.method}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ep.label}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{ep.path}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ep.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              {preset.docsUrl && (
                <a
                  href={preset.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3"
                >
                  Full documentation <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
