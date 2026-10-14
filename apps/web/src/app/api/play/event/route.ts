import { getDb, getEventForPin, getEventForRef, type EventFormForPlayer } from '@thinkwise/db';

const forPlayer = (f: EventFormForPlayer | null) => (f ? { title: f.title, description: f.description, fields: f.fields } : null);

/** Public: an event game's feedback forms, by PIN while it runs or by ref (the game session) for 12 hours. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ref = params.get('ref');
  const db = getDb();
  const event = ref ? await getEventForRef(db, ref) : await getEventForPin(db, params.get('pin') ?? '');
  const body = event
    ? {
        event: {
          ref: event.ref,
          title: event.title,
          description: event.description,
          identity: event.identity,
          required: event.required,
          before: forPlayer(event.before),
          after: forPlayer(event.after),
        },
      }
    : { event: null };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
