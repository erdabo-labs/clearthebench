import { createClient } from 'jsr:@supabase/supabase-js@2';
// @deno-types="npm:@types/web-push"
import webpush from 'npm:web-push';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const db = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async () => {
  const now = new Date().toISOString();

  // Find all alerts that are due
  const { data: alerts, error } = await db
    .from('ctb_pending_alerts')
    .select('game_id, coach_id, fire_at, interval_seconds')
    .eq('active', true)
    .lte('fire_at', now);

  if (error) {
    console.error('fetch alerts', error);
    return new Response('error', { status: 500 });
  }

  for (const alert of (alerts ?? [])) {
    // Get all subscriptions for this coach
    const { data: subs } = await db
      .from('ctb_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('coach_id', alert.coach_id);

    const payload = JSON.stringify({
      title: 'Time to Rotate!',
      body: 'Rotation window is open',
      gameId: alert.game_id,
    });

    const staleEndpoints: string[] = [];

    for (const sub of (subs ?? [])) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error('sendNotification', sub.endpoint, err);
        }
      }
    }

    // Remove stale subscriptions
    if (staleEndpoints.length > 0) {
      await db.from('ctb_push_subscriptions').delete().in('endpoint', staleEndpoints);
    }

    // Advance fire_at by interval for next cycle
    const nextFireAt = new Date(
      new Date(alert.fire_at).getTime() + alert.interval_seconds * 1000,
    ).toISOString();

    await db
      .from('ctb_pending_alerts')
      .update({ fire_at: nextFireAt })
      .eq('game_id', alert.game_id);
  }

  return new Response(JSON.stringify({ processed: (alerts ?? []).length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
