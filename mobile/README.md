# Ramaje — App móvil de líderes (siguiente paso, aún no iniciado)

Esta carpeta está vacía a propósito. El prototipo funcional ya existe
como HTML (`ramaje-app-lideres.html`) con toda la lógica de negocio
resuelta — lo que falta es reconstruirlo en React Native/Expo y
conectarlo a Supabase. Esto se hace mejor en Claude Code, donde sí se
puede instalar Expo, correr el simulador, y probar con tu teléfono
real (Expo Go).

## Cómo arrancar (dáselo a Claude Code como instrucción)

```bash
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
npx expo install expo-location expo-image-picker
```

## Qué debe reconstruir Claude Code, tomando como referencia
`ramaje-app-lideres.html`:

1. **Login**: en vez de "elegir tu nombre" (como en el prototipo),
   usar `supabase.auth.signInWithPassword` con el correo/contraseña
   real del líder.
2. **Pantalla principal**: consultar
   `work_orders` filtrando por `group_id = <la cuadrilla del líder>`.
3. **Iniciar trabajo**: `update work_orders set status='en_progreso',
   started_at=now() where id=...`
4. **Terminado**: exigir una foto (usar `expo-image-picker`), subirla
   al bucket `completion-photos` de Supabase Storage, y luego
   `update work_orders set status='hecho', completed_at=now(),
   completion_photo_url=<url> where id=...`
5. **No terminado**: `update work_orders set status='reasignar',
   reassign_reason=<texto opcional> where id=...`
6. **Ver diagrama**: mostrar `sketch_image_url` de la orden si existe
   (ya lo sube el admin desde la web).
7. **Selector de idioma ES/EN**: reusar el mismo diccionario de
   traducciones que ya está en `ramaje-app-lideres.html`.
8. **Jornada y GPS** (Fase 5-6 del documento original, aún no
   construido en el prototipo HTML): botones "Iniciar jornada" /
   "Finalizar jornada" que crean/cierran un registro en `shifts`, y
   mientras la jornada esté activa, usar `expo-location` en segundo
   plano para insertar en `location_pings` cada 2-5 minutos.

Todas las políticas de seguridad (RLS) para que un líder solo pueda
ver y modificar lo de su propia cuadrilla ya están en
`supabase/migrations/0001_init.sql`.
