import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Unlink, CheckCircle2, XCircle, Plug, Plus, RefreshCw, ExternalLink, Key,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
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
type ConnectorCategory = 'hris' | 'ticketing' | 'crm';

interface ProviderInfo {
  id: string;
  name: string;
  category: ConnectorCategory;
}

const PROVIDER_CATALOG: ProviderInfo[] = [
  { id: 'bamboohr',       name: 'BambooHR',         category: 'hris' },
  { id: 'workday',        name: 'Workday',           category: 'hris' },
  { id: 'gusto',          name: 'Gusto',             category: 'hris' },
  { id: 'rippling',       name: 'Rippling',          category: 'hris' },
  { id: 'hibob',          name: 'HiBob',             category: 'hris' },
  { id: 'personio',       name: 'Personio',          category: 'hris' },
  { id: 'deel',           name: 'Deel',              category: 'hris' },
  { id: 'remote',         name: 'Remote',            category: 'hris' },
  { id: 'adp',            name: 'ADP',               category: 'hris' },
  { id: 'ukg',            name: 'UKG',               category: 'hris' },
  { id: 'jira',           name: 'Jira',              category: 'ticketing' },
  { id: 'asana',          name: 'Asana',             category: 'ticketing' },
  { id: 'linear',         name: 'Linear',            category: 'ticketing' },
  { id: 'monday',         name: 'Monday.com',        category: 'ticketing' },
  { id: 'clickup',        name: 'ClickUp',           category: 'ticketing' },
  { id: 'trello',         name: 'Trello',            category: 'ticketing' },
  { id: 'shortcut',       name: 'Shortcut',          category: 'ticketing' },
  { id: 'github',         name: 'GitHub Issues',     category: 'ticketing' },
  { id: 'salesforce',     name: 'Salesforce',        category: 'crm' },
  { id: 'hubspot',        name: 'HubSpot',           category: 'crm' },
  { id: 'pipedrive',      name: 'Pipedrive',         category: 'crm' },
  { id: 'zoho',           name: 'Zoho CRM',          category: 'crm' },
  { id: 'close',          name: 'Close',             category: 'crm' },
  { id: 'copper',         name: 'Copper',            category: 'crm' },
  { id: 'apollo',         name: 'Apollo.io',         category: 'crm' },
];

const CATEGORY_META: Record<ConnectorCategory, { label: string; badgeClass: string; initClass: string }> = {
  hris:      { label: 'HRIS',      badgeClass: 'bg-blue-50 text-blue-700',       initClass: 'bg-blue-100 text-blue-700' },
  ticketing: { label: 'Ticketing', badgeClass: 'bg-purple-50 text-purple-700',   initClass: 'bg-purple-100 text-purple-700' },
  crm:       { label: 'CRM',       badgeClass: 'bg-emerald-50 text-emerald-700', initClass: 'bg-emerald-100 text-emerald-700' },
};

function providerInitials(name: string): string {
  return name.split(/[\s.]+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function guessCategory(provider: string): ConnectorCategory | null {
  const p = provider.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hris = new Set(['bamboohr','workday','gusto','adp','rippling','hibob','personio','namely','paylocity','paycom','sage','successfactors','ukg','zenefits','factorial','humaans','deel','remote','oyster']);
  const ticketing = new Set(['jira','asana','linear','monday','clickup','shortcut','trello','notion','height','github','gitlab','azuredevops','basecamp']);
  const crm = new Set(['salesforce','hubspot','pipedrive','zoho','close','copper','freshsales','apollo','outreach','salesloft']);
  if (hris.has(p)) return 'hris';
  if (ticketing.has(p)) return 'ticketing';
  if (crm.has(p)) return 'crm';
  return null;
}

function statusClass(status?: string): string {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700';
  if (status === 'error') return 'bg-red-50 text-red-700';
  if (status === 'suspended') return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function providerDisplay(account: StackOneAccount): string {
  return account.provider_name || account.provider?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || account.id;
}

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
    const { data } = await (supabase as unknown as SupabaseClient)
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

  const handleAddConnector = async (categories?: ConnectorCategory[]) => {
    setCreatingSession(true);
    try {
      const { data, error } = await supabase.functions.invoke('stackone-proxy', {
        body: { action: 'create_session', ...(categories?.length ? { categories } : {}) },
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

  if (state === 'loading') {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (state === 'setup') {
    return (
      <div className="space-y-6">
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
      </div>
    );
  }

  const connectedProviderIds = new Set(
    accounts.map(a => a.provider?.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );
  const availableProviders = PROVIDER_CATALOG.filter(p => !connectedProviderIds.has(p.id));
  const catalogCategories: ConnectorCategory[] = ['hris', 'ticketing', 'crm'];

  return (
    <div className="space-y-6">
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
                {accounts.length} connector{accounts.length !== 1 ? 's' : ''} active
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

      {/* Active connections table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Active Connections</h3>
          <Button
            size="sm"
            onClick={() => handleAddConnector()}
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
            <CardContent className="py-8 text-center">
              <Plug className="h-7 w-7 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No connectors linked yet. Pick one from the catalog below to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(account => {
                  const cat = guessCategory(account.provider);
                  const meta = cat ? CATEGORY_META[cat] : null;
                  const initials = providerInitials(providerDisplay(account));
                  return (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded text-[11px] font-bold flex-shrink-0',
                            meta ? meta.initClass : 'bg-gray-100 text-gray-600',
                          )}>
                            {initials}
                          </span>
                          <div>
                            <p className="font-medium text-sm leading-tight">{providerDisplay(account)}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">{account.id.slice(0, 12)}…</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {meta ? (
                          <Badge className={cn('border-0 text-xs', meta.badgeClass)}>{meta.label}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('border-0 text-xs', statusClass(account.status))}>
                          {account.status || 'unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {account.updated_at ? new Date(account.updated_at).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Available connectors catalog */}
      <div>
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Available Connectors</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click any connector to link it. StackOne supports 200+ providers across all categories.
          </p>
        </div>

        <div className="space-y-5">
          {catalogCategories.map(cat => {
            const providers = availableProviders.filter(p => p.category === cat);
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {meta.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {providers.map(provider => (
                    <button
                      key={provider.id}
                      onClick={() => handleAddConnector([cat])}
                      disabled={creatingSession}
                      className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/50 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <span className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold flex-shrink-0',
                        meta.initClass,
                      )}>
                        {providerInitials(provider.name)}
                      </span>
                      <span className="font-medium text-sm">{provider.name}</span>
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </button>
                  ))}
                  <button
                    onClick={() => handleAddConnector([cat])}
                    disabled={creatingSession}
                    className="flex items-center gap-1.5 rounded-md border border-dashed bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Browse all {meta.label}
                  </button>
                </div>
              </div>
            );
          })}

          {availableProviders.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              All common connectors are already linked.{' '}
              <button
                onClick={() => handleAddConnector()}
                disabled={creatingSession}
                className="underline hover:text-foreground"
              >
                Browse all 200+ connectors
              </button>
            </p>
          )}
        </div>
      </div>

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
  const [HubComponent, setHubComponent] = useState<React.FC<{
    token: string;
    theme?: string;
    height?: string;
    onSuccess: (account: { id: string; provider: string }) => void;
    onClose: () => void;
  }> | null>(null);
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
