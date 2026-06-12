import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Unlink, CheckCircle2, XCircle, Plug, Plus,
  RefreshCw, ExternalLink, Key,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface StackOneAccount {
  id: string;
  provider: string;
  provider_name?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

type PanelState = 'loading' | 'setup' | 'connected';

export default function StackOnePanel() {
  const { toast } = useToast();
  const [state, setState] = useState<PanelState>('loading');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<StackOneAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [hubToken, setHubToken] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  const loadState = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('cos_mcp_integrations')
      .select('is_connected')
      .eq('integration_key', 'stackone')
      .maybeSingle();

    if (data?.is_connected) {
      setState('connected');
      fetchAccounts();
    } else {
      setState('setup');
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('stackone-proxy', {
        body: { action: 'list_accounts' },
      });
      if (error) throw error;
      if (data?.status === 'ok') {
        setAccounts(data.accounts ?? []);
      } else if (data?.error === 'not_configured') {
        setState('setup');
      }
    } catch (err) {
      console.warn('Failed to fetch accounts:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      toast({ title: 'API key required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('stackone-proxy', {
        body: { action: 'save_key', api_key: apiKey.trim() },
      });
      if (error) throw error;
      if (data?.status === 'ok') {
        toast({ title: 'StackOne connected' });
        setApiKey('');
        setState('connected');
        fetchAccounts();
      } else {
        toast({
          title: 'Connection failed',
          description: data?.error ?? 'Invalid API key',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('stackone-proxy', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;
      toast({ title: 'StackOne disconnected' });
      setState('setup');
      setAccounts([]);
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleAddConnector = async () => {
    setCreatingSession(true);
    try {
      const { data, error } = await supabase.functions.invoke('stackone-proxy', {
        body: { action: 'create_session' },
      });
      if (error) throw error;
      if (data?.status === 'ok' && data.session?.token) {
        setHubToken(data.session.token);
        setHubOpen(true);
      } else {
        toast({
          title: 'Failed to start connector setup',
          description: data?.error ?? 'Could not create session',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setCreatingSession(false);
    }
  };

  const handleHubSuccess = (account: { id: string; provider: string }) => {
    toast({ title: `${account.provider} connected` });
    setHubOpen(false);
    setHubToken(null);
    fetchAccounts();
  };

  const handleHubClose = () => {
    setHubOpen(false);
    setHubToken(null);
    fetchAccounts();
  };

  const statusColor = (status?: string) => {
    if (status === 'active') return 'bg-emerald-50 text-emerald-700';
    if (status === 'error') return 'bg-red-50 text-red-700';
    if (status === 'suspended') return 'bg-amber-50 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };

  const providerDisplay = (account: StackOneAccount) => {
    return account.provider_name || account.provider?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || account.id;
  };

  if (state === 'loading') {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {state === 'setup' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4" />
              Connect StackOne
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              StackOne connects your team tools (HRIS, CRM, ATS, messaging, and more) through a single integration gateway.
              Enter your API key to get started.
            </p>
            <div className="space-y-3 max-w-lg">
              <div className="space-y-1">
                <label className="text-xs font-medium">API Key</label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk_live_..."
                  className="h-9 text-sm font-mono"
                  onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                />
                <p className="text-[11px] text-muted-foreground">
                  Find your API key in the{' '}
                  <a
                    href="https://app.stackone.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground inline-flex items-center gap-0.5"
                  >
                    StackOne dashboard <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </p>
              </div>
              <Button size="sm" onClick={handleSaveKey} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Connection status bar */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className="bg-emerald-50 text-emerald-700 border-0 gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {accounts.length} connector{accounts.length !== 1 ? 's' : ''} linked
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchAccounts}
                    disabled={loadingAccounts}
                    className="gap-1.5"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', loadingAccounts && 'animate-spin')} />
                    Refresh
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
              </div>
            </CardContent>
          </Card>

          {/* Linked accounts grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Linked Connectors</h3>
              <Button
                size="sm"
                onClick={handleAddConnector}
                disabled={creatingSession}
                className="gap-1.5"
              >
                {creatingSession ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Connector
              </Button>
            </div>

            {loadingAccounts ? (
              <Card>
                <CardContent className="py-10 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : accounts.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="py-10 text-center">
                  <Plug className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    No connectors linked yet. Add your first connector to start syncing data.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleAddConnector}
                    disabled={creatingSession}
                    className="gap-1.5"
                  >
                    {creatingSession ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Add Connector
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map(account => (
                  <Card key={account.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="py-4 px-5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">
                            {providerDisplay(account)}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                            {account.id.slice(0, 12)}...
                          </p>
                        </div>
                        <Badge
                          className={cn('text-[10px] border-0 flex-shrink-0 ml-2', statusColor(account.status))}
                        >
                          {account.status || 'unknown'}
                        </Badge>
                      </div>
                      {account.updated_at && (
                        <p className="text-[11px] text-muted-foreground">
                          Updated {new Date(account.updated_at).toLocaleDateString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* About card */}
          <Card className="bg-[#F5F3F0] border-[#6B9A8F]/30">
            <CardContent className="py-5 px-6">
              <h4 className="font-semibold text-sm mb-2">About StackOne</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Connects 200+ SaaS providers through a single gateway</li>
                <li>Supports HRIS, ATS, CRM, Documents, Messaging, and more</li>
                <li>Handles auth, rate limiting, and data transformation automatically</li>
              </ul>
              <a
                href="https://docs.stackone.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3"
              >
                Documentation <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        </>
      )}

      {/* StackOne Hub Dialog */}
      <Dialog open={hubOpen} onOpenChange={(open) => { if (!open) handleHubClose(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>Add Connector</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-4" style={{ minHeight: 480 }}>
            {hubToken && <StackOneHubEmbed token={hubToken} onSuccess={handleHubSuccess} onClose={handleHubClose} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StackOneHubEmbed({
  token,
  onSuccess,
  onClose,
}: {
  token: string;
  onSuccess: (account: { id: string; provider: string }) => void;
  onClose: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [HubComponent, setHubComponent] = useState<React.FC<any> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@stackone/hub').then(mod => {
      if (!cancelled) setHubComponent(() => mod.StackOneHub);
    }).catch(err => {
      if (!cancelled) setLoadError(String(err));
    });
    return () => { cancelled = true; };
  }, []);

  if (loadError) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive p-4">
        <XCircle className="h-4 w-4 flex-shrink-0" />
        Failed to load connector hub: {loadError}
      </div>
    );
  }

  if (!HubComponent) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <HubComponent
      token={token}
      theme="light"
      height="460px"
      onSuccess={onSuccess}
      onClose={onClose}
    />
  );
}
