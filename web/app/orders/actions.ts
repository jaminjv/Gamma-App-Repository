'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { JobType, EquipmentType } from '@/lib/types';

// Crea una orden de trabajo nueva. El campo sketchImageUrl se llena
// después de subir el archivo al bucket "order-sketches" (ver
// lib/supabase/client.ts + storage.from('order-sketches').upload(...)
// desde el componente de formulario).
export async function createOrder(input: {
  address: string;
  scheduledDate: string;
  jobType: JobType;
  equipmentRequired: EquipmentType;
  instructions: string;
  sketchImageUrl: string | null;
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await supabase.from('work_orders').insert({
    address: input.address,
    scheduled_date: input.scheduledDate,
    job_type: input.jobType,
    equipment_required: input.equipmentRequired,
    instructions: input.instructions,
    sketch_image_url: input.sketchImageUrl,
    status: 'pendiente',
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/orders');
}

// El admin asigna (o reasigna) una cuadrilla a una orden.
// Si la orden estaba "pendiente" o "reasignar", pasa a "asignado"; y si se
// le quita la cuadrilla estando "asignado", vuelve a "pendiente" (si no,
// quedaba como "asignado" sin cuadrilla). Los estados en los que la
// cuadrilla ya tocó el trabajo — "en_progreso", "hecho" — no se tocan.
export async function assignGroup(orderId: string, groupId: string | null) {
  const supabase = createClient();

  const { data: order, error: fetchError } = await supabase
    .from('work_orders')
    .select('status')
    .eq('id', orderId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  let nextStatus = order.status;
  if (groupId && (order.status === 'pendiente' || order.status === 'reasignar')) {
    nextStatus = 'asignado';
  } else if (!groupId && order.status === 'asignado') {
    nextStatus = 'pendiente';
  }

  const { error } = await supabase
    .from('work_orders')
    .update({ group_id: groupId, status: nextStatus })
    .eq('id', orderId);

  if (error) throw new Error(error.message);

  revalidatePath('/orders');
}
