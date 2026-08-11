'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createOrder } from './actions';
import type { Group, JobType, EquipmentType } from '@/lib/types';

export function OrderForm({ groups }: { groups: Group[] }) {
  const supabase = createClient();
  const [address, setAddress] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobType, setJobType] = useState<JobType>('remocion');
  const [equipment, setEquipment] = useState<EquipmentType>('bucket');
  const [instructions, setInstructions] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    let sketchUrl: string | null = null;

    // Sube la imagen del boceto/diagrama al bucket "order-sketches"
    // (creado por la migración 0001_init.sql) y guarda su URL pública.
    if (file) {
      const path = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('order-sketches')
        .upload(path, file);

      if (!uploadError) {
        const { data } = supabase.storage.from('order-sketches').getPublicUrl(path);
        sketchUrl = data.publicUrl;
      }
    }

    await createOrder({
      address,
      scheduledDate: date,
      jobType,
      equipmentRequired: equipment,
      instructions,
      sketchImageUrl: sketchUrl,
    });

    setAddress('');
    setInstructions('');
    setFile(null);
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ background: '#fff', border: '1px solid #D3C9B4', borderRadius: 6, padding: 18 }}
    >
      <h2 style={{ fontSize: 15, marginBottom: 12 }}>Nueva orden de trabajo</h2>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>Dirección</label>
        <input
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{ width: '100%', padding: 9, border: '1px solid #D3C9B4', borderRadius: 4 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: '100%', padding: 9, border: '1px solid #D3C9B4', borderRadius: 4 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>Tipo de trabajo</label>
          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value as JobType)}
            style={{ width: '100%', padding: 9, border: '1px solid #D3C9B4', borderRadius: 4 }}
          >
            <option value="remocion">Remoción</option>
            <option value="trim">Poda / trim</option>
            <option value="poda_alta">Poda en altura</option>
            <option value="emergencia">Daño por tormenta</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>Equipo requerido</label>
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value as EquipmentType)}
          style={{ width: '100%', padding: 9, border: '1px solid #D3C9B4', borderRadius: 4 }}
        >
          <option value="bucket">Bucket truck</option>
          <option value="climbing">Climbing</option>
          <option value="ambos">Bucket + Climbing</option>
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>Instrucciones</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          style={{ width: '100%', padding: 9, border: '1px solid #D3C9B4', borderRadius: 4, minHeight: 60 }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>
          Boceto / diagrama de instrucciones (opcional)
        </label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <button
        type="submit"
        disabled={saving}
        style={{
          background: '#E0631C', color: '#fff', border: 'none', borderRadius: 4,
          padding: '10px 18px', fontWeight: 600, cursor: 'pointer',
        }}
      >
        {saving ? 'Guardando…' : 'Guardar orden'}
      </button>
    </form>
  );
}
