import { getDb, getLiveEventForm } from '@thinkwise/db';

/** Public: the feedback form a participant fills in before joining this PIN's lobby, if any. */
export async function GET(request: Request) {
  const pin = new URL(request.url).searchParams.get('pin') ?? '';
  const event = await getLiveEventForm(getDb(), pin);
  const body = event
    ? {
        event: {
          title: event.title,
          description: event.description,
          identity: event.identity,
          required: event.feedbackRequired,
          form: { title: event.form.title, description: event.form.description, fields: event.form.fields },
        },
      }
    : { event: null };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
