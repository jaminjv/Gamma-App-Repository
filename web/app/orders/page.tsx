import { createClient } from '@/lib/supabase/server';
import type { WorkOrder, Group } from '@/lib/types';
import { OrderForm } from './OrderForm';
import { AssignSelect } from './AssignSelect';
import { SignOutButton } from '../auth/SignOutButton';

export const dynamic = 'force-dynamic'; // siempre trae datos frescos

export default async function OrdersPage() {
  const supabase = createClient();

  const [{ data: orders }, { data: groups }] = await Promise.all([
    supabase.from('work_orders').select('*').order('scheduled_date', { ascending: true }),
    supabase.from('groups').select('*'),
  ]);

  const groupName = (id: string | null) =>
    groups?.find((g) => g.id === id)?.name ?? '— Sin asignar —';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Órdenes de trabajo</h1>
          <p style={{ color: '#5C5346', fontSize: 13, marginBottom: 20 }}>
            Datos reales desde Supabase — {(orders as WorkOrder[] | null)?.length ?? 0} órdenes.
          </p>
        </div>
        <SignOutButton />
      </div>

      <OrderForm groups={(groups as Group[]) ?? []} />

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 28, fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #2A241D' }}>
            <th style={{ padding: 8 }}>Dirección</th>
            <th style={{ padding: 8 }}>Fecha</th>
            <th style={{ padding: 8 }}>Tipo</th>
            <th style={{ padding: 8 }}>Cuadrilla</th>
            <th style={{ padding: 8 }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {(orders as WorkOrder[] | null)?.map((o) => (
            <tr key={o.id} style={{ borderBottom: '1px solid #D3C9B4' }}>
              <td style={{ padding: 8 }}>
                {o.address}
                {o.sketch_image_url && (
                  <a href={o.sketch_image_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>
                    📎
                  </a>
                )}
              </td>
              <td style={{ padding: 8 }}>{o.scheduled_date}</td>
              <td style={{ padding: 8 }}>{o.job_type}</td>
              <td style={{ padding: 8 }}>
                <AssignSelect orderId={o.id} groups={(groups as Group[]) ?? []} currentGroupId={o.group_id} />
              </td>
              <td style={{ padding: 8 }}>{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
