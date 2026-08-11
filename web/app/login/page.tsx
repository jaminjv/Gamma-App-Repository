'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Ramaje</h1>
      <p style={{ color: '#5C5346', fontSize: 13, marginBottom: 24 }}>
        Ingresa con tu correo y contraseña de Supabase Auth.
      </p>
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Correo</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 10, border: '1px solid #D3C9B4', borderRadius: 4 }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Contraseña</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 10, border: '1px solid #D3C9B4', borderRadius: 4 }}
          />
        </div>
        {error && <p style={{ color: '#A63D2E', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: 12, background: '#E0631C', color: '#fff',
            border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
