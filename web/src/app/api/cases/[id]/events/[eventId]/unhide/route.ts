import { eventRoute } from "../route-shared";

// POST /api/cases/:id/events/:eventId/unhide — Undo: the line comes back into the Activity list.
export const POST = eventRoute(false);
