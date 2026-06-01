import { Eye, EyeOff, Shield, User } from 'lucide-react';
import { useRoleOverride, type OverrideRole } from '@/contexts/RoleOverrideContext';
import { cn } from '@/lib/utils';

export function RoleOverrideBanner() {
  const { override, setOverride, isOverriding } = useRoleOverride();

  if (!isOverriding) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-orange-300 bg-orange-50 px-4 py-2 shadow-lg">
        <Eye className="h-4 w-4 text-orange-600" />
        <span className="text-sm font-medium text-orange-800">
          Viewing as
        </span>
        <div className="flex gap-1">
          <RolePill role="admin" active={override === 'admin'} onClick={() => setOverride('admin')} />
          <RolePill role="member" active={override === 'member'} onClick={() => setOverride('member')} />
        </div>
        <button
          onClick={() => setOverride(null)}
          className="ml-1 rounded-full p-1 text-orange-600 hover:bg-orange-100 transition-colors"
          title="Exit role preview"
        >
          <EyeOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function RolePill({ role, active, onClick }: { role: OverrideRole; active: boolean; onClick: () => void }) {
  const Icon = role === 'admin' ? Shield : User;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'bg-orange-600 text-white'
          : 'bg-white text-orange-700 hover:bg-orange-100 border border-orange-200',
      )}
    >
      <Icon className="h-3 w-3" />
      {role === 'admin' ? 'Admin' : 'Member'}
    </button>
  );
}
