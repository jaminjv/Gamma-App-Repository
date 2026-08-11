'use client';

import { useTransition } from 'react';
import { assignGroup } from './actions';
import type { Group } from '@/lib/types';

export function AssignSelect({
  orderId,
  groups,
  currentGroupId,
}: {
  orderId: string;
  groups: Group[];
  currentGroupId: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={currentGroupId ?? ''}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value || null;
        startTransition(() => {
          assignGroup(orderId, value);
        });
      }}
      style={{ padding: 5, border: '1px solid #D3C9B4', borderRadius: 4, fontSize: 12 }}
    >
      <option value="">Sin asignar</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
