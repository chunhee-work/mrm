import { eventRoute } from "../route-shared";

// POST /api/cases/:id/events/:eventId/hide — the user removes one line from the case's Activity list (plan #148, display only).
export const POST = eventRoute(true);
