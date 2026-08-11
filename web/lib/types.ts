// Tipos que reflejan el esquema de supabase/migrations/0001_init.sql
// Cuando el proyecto crezca, puedes reemplazar esto con tipos
// autogenerados: `npx supabase gen types typescript --project-id TU_ID`

export type UserRole = 'admin' | 'group_leader';
export type EquipmentType = 'bucket' | 'climbing' | 'ambos';
export type JobType = 'remocion' | 'trim' | 'poda_alta' | 'emergencia';
export type OrderStatus = 'pendiente' | 'asignado' | 'en_progreso' | 'hecho' | 'reasignar';
export type DumpType = 'chips' | 'logs';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  leader_id: string | null;
  equipment_type: EquipmentType;
  member_count: number;
  created_at: string;
}

export interface WorkOrder {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  scheduled_date: string; // ISO date (YYYY-MM-DD)
  job_type: JobType;
  equipment_required: EquipmentType;
  instructions: string | null;
  sketch_image_url: string | null;
  status: OrderStatus;
  reassign_reason: string | null;
  completion_photo_url: string | null;
  group_id: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface DumpReport {
  id: string;
  group_id: string | null;
  work_order_id: string | null;
  location_name: string;
  dump_type: DumpType;
  lat: number | null;
  lng: number | null;
  reported_at: string;
  notes: string | null;
  photo_url: string | null;
}
