# Saved record deletion

Workspace administrators can delete individual saved items from their section. Settings → Manage saved data also exposes saved reports, evidence, offers, creatives, jobs, results, connections, targeting locations, checks, translations and reusable research outputs.

Every deletion first shows linked records that will be removed and independent records that will be unlinked. Cancel does nothing. Confirmation is tied to the exact reviewed state; a concurrent change requires a new review. Workspace ownership, administrator role and request origin are checked server-side. Deletes are transactional and audited.

Products cascade to their costs, research briefs/reports, campaign plans and associated unlaunched approvals. Saved competitor observations are kept and unlinked. Deleting competitor evidence removes its revisions and translations, cleans selections, clears cached evidence copies, and invalidates affected research and unlaunched approvals without rewriting approved snapshots. Removing an approval returns an unlaunched plan to draft when no other current launch request remains.

Deleting a media file detaches product images and ad screenshots, removes dependent draft campaign records and image analyses, and deletes the actual private storage object. A storage outage leaves inaccessible metadata marked for cleanup, with quota still reserved until the object is removed. Live workers retry cleanup at startup and once a minute. Database failure never schedules object removal.

Active campaigns and unresolved executions cannot be removed: pause and reconcile them first. Related running background tasks block deletion. Queued tasks receive a durable tombstone; workers skip them, including after a restart. AdPilot deletion never calls Meta to pause or delete ads. Removing a local manual campaign link does not stop its Facebook campaign; the review explicitly states this.

Audit records, authentication records and minimal deleted campaign budget reservations/queue tombstones are retained for accountability, recovery and budget protection. These are not user-facing saved content. No bulk database reset or paid ad action is part of this feature.

API: `GET /api/records`, `GET /api/records?kind=products`, `GET /api/records/:kind/:id/delete-preview`, `DELETE /api/records/:kind/:id` with `{ "token": "preview token" }`.
