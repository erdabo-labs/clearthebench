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

Deno.serve(async (req) => {
  const { gameId } = await req.json().catch(() => ({}));
  if (!gameId) return new Response('missing gameId', { status: 400 });

  const { data: subs, error } = await db
    .from('ctb_spectator_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('game_id', gameId);

  if (error) {
    console.error('fetch spectator subs', error);
    return new Response('error', { status: 500 });
  }

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  const payload = JSON.stringify({
    title: 'Rotation!',
    body: 'Substitution happening now',
    tag: 'spectator',
    gameId,
    autoDismissMs: 30000,
  });

  const staleEndpoints: string[] = [];
  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        staleEndpoints.push(sub.endpoint);
      } else {
        console.error('sendNotification', sub.endpoint, err);
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await db.from('ctb_spectator_push_subscriptions')
      .delete().in('endpoint', staleEndpoints);
  }

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
