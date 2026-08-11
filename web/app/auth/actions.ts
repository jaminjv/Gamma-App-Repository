'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Cierra la sesión y borra las cookies de Supabase Auth. Se llama desde
// SignOutButton; al ser una Server Action sí puede escribir cookies.
export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
