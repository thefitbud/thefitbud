# Design review: Z12-5

Advisory report (D-W11-2, D-W11-3). ImageMagick was not available in this environment, so pixel AE scores were skipped; grades below are by eye against the locked frames in `docs/design/mockups/png/`. How to read it: docs/runbooks/design-review.md.

| Screen | Frame | Grade | Notes |
|---|---|---|---|
| `144-trainer-web-invite-detail-web-1440x900.png` | `144-trainer-web-invite-detail-web.png` | **CLOSE** | Header (avatar, Invited + Mail pill, meta, ⋯), Invite tab, 4-step stepper, formatted WhatsApp, invite-link row + helper, side cards. Seed email/phone/dates/form `v1` differ from frame sample. Timeline missing reminder row (no API). Copy uses `Anita's` / they-join (frame “her”). |
| `145-trainer-web-invite-revoke-web-1440x900.png` | `145-trainer-web-invite-revoke-web.png` | **CLOSE** | Modal “Revoke Anita's invite?”, stop-working body, Cancel + destructive Revoke invite. Body ends “invite again” (frame “invite her again”). |

Screens: 2 paired, 0 unmapped. Coral never used as a button. Ink primary for Remind on WhatsApp; destructive for Revoke.
