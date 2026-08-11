'use client';

import { useTransition } from 'react';
import { signOut } from './actions';

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => { signOut(); })}
      style={{
        background: 'transparent', color: '#5C5346', border: '1px solid #D3C9B4',
        borderRadius: 4, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
      }}
    >
      {isPending ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
