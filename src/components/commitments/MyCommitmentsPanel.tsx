import { useCallback } from 'react';
import { PrioritySlot } from './PrioritySlot';
import { CommitmentCell } from './CommitmentCell';
import type {
  CommitmentQuarter,
  PersonalPriority,
  MonthlyCommitment,
  CommitmentStatus,
  UpsertPriorityForm,
  UpsertCommitmentForm,
} from '@/types/commitments';
import { getQuarterMonths } from '@/types/commitments';

interface MyCommitmentsPanelProps {
  quarter: CommitmentQuarter;
  userId: string;
  priorities: PersonalPriority[];
  commitments: MonthlyCommitment[];
  onUpsertPriority: (form: UpsertPriorityForm) => Promise<PersonalPriority | null>;
  onDeletePriority: (id: string) => Promise<void>;
  onUpsertCommitment: (form: UpsertCommitmentForm) => Promise<MonthlyCommitment | null>;
  onDeleteCommitment: (id: string) => Promise<void>;
  onStatusChange: (id: string, status: CommitmentStatus) => Promise<void>;
}

export function MyCommitmentsPanel({
  quarter,
  userId,
  priorities,
  commitments,
  onUpsertPriority,
  onDeletePriority,
  onUpsertCommitment,
  onDeleteCommitment,
  onStatusChange,
}: MyCommitmentsPanelProps) {
  const months = getQuarterMonths(quarter);
  const monthLabels = [months.month1, months.month2, months.month3];

  const priorityAt = (order: number) => priorities.find(p => p.display_order === order);

  const commitmentsFor = (month: number, order: number) =>
    commitments.find(c => c.month_number === month && c.display_order === order);

  const handleSavePriority = useCallback(async (order: number, title: string) => {
    const existing = priorityAt(order);
    await onUpsertPriority({
      ...(existing ? { id: existing.id } : {}),
      quarter_id: quarter.id,
      user_id: userId,
      title,
      display_order: order,
    });
  }, [priorities, quarter.id, userId, onUpsertPriority]);

  const handleSaveCommitment = useCallback(async (month: number, order: number, title: string) => {
    const existing = commitmentsFor(month, order);
    await onUpsertCommitment({
      ...(existing ? { id: existing.id } : {}),
      quarter_id: quarter.id,
      user_id: userId,
      month_number: month,
      title,
      display_order: order,
    });
  }, [commitments, quarter.id, userId, onUpsertCommitment]);

  return (
    <div className="space-y-8">
      {/* Quarterly Priorities */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Q Priorities
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {[1, 2, 3].map(order => (
            <PrioritySlot
              key={order}
              order={order}
              priority={priorityAt(order)}
              onSave={title => handleSavePriority(order, title)}
              onDelete={() => { const p = priorityAt(order); if (p) onDeletePriority(p.id); return Promise.resolve(); }}
            />
          ))}
        </div>
      </section>

      {/* Monthly Commitments grid */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Monthly Commitments
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(monthNum => (
            <div key={monthNum} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">
                {monthLabels[monthNum - 1]}
              </h4>
              {[1, 2, 3].map(order => (
                <CommitmentCell
                  key={order}
                  commitment={commitmentsFor(monthNum, order)}
                  quarterId={quarter.id}
                  userId={userId}
                  monthNumber={monthNum}
                  displayOrder={order}
                  onSave={title => handleSaveCommitment(monthNum, order, title)}
                  onDelete={() => {
                    const c = commitmentsFor(monthNum, order);
                    return c ? onDeleteCommitment(c.id) : Promise.resolve();
                  }}
                  onStatusChange={status => {
                    const c = commitmentsFor(monthNum, order);
                    return c ? onStatusChange(c.id, status) : Promise.resolve();
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
