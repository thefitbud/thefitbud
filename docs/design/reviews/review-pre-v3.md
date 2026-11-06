# FitBud mockup review (design/mvp-mockups-all-screens @ f9be6b9)

> **Historical review (kept for rationale).** Written before the 22 Oct consolidation; paths like `docs/spec/mockups/png`, `mockups-v2/` and `redesign/v3/` now map to `docs/design/mockups/png|html`, and screens it flags may since have been replaced by v3 frames. Current index: [../README.md](../README.md).

Note: `design/mvp-mockups` doesn't exist on origin. The branch used is `design/mvp-mockups-all-screens`.
Scope: every PNG in docs/spec/mockups/png (226) and docs/spec/mockups-v2/png (47), checked on contact sheets (fitbud-design/sheets/). Phone screens were viewed at readable size. Web and iPad screens were triaged at thumbnail size, and the IP set was checked at full size.
Per the user, this lists **serious issues only**.

## Screens that fall short (ranked)
1. **Trainee Today progress card**: mockups/png/04-trainee-today-ios.png, -android, 04b-past-day, 97-all-done, 104-offline, 113, 115, 29, 29b, 04-trainee-today-ring-card-2x.png.
   - Five concentric gradient rings (orange, purple, amber, teal, green) break the token palette. DESIGN-NOTES says rings use kcal #4527C6, protein #1A1248, carbs #7C6CF0, fat #0E7490.
   - Teal and green, and orange and amber, are confusable for deuteranopes, and colour is the only thing tying each ring to its label.
   - Each ring is repeated as a bar in the legend, so every value is encoded twice. The inner rings are tiny, so equal progress looks unequal.
   - Steps are mixed into the nutrition rings, and the workout, the main item of the day, isn't on the card.
   - "1,390 kcal left" frames food as a deficit. The rest of the product uses "X of Y".
   - It contradicts TR-07 decision 3 ("a kcal ring plus macro bars, not four rings").
   - The legend has no units, and nothing on the card is tappable. At 97-all-done, all five rings are full and say nothing.
2. **Two divergent Today sources of truth**: mockups-v2/png/04-trainee-today-*.png have no rings (a Next-up hero instead), while mockups/png/04-* have rings, and the latest commit only re-rendered v1. Engineering can't tell which one is canonical. Pick one before MD2.
3. **IP-09 trainer mobile sessions**: there's no Sessions tab, and the screen sits under the Attention tab. There's no way to log a group from the phone, and in a gym the phone is what the coach is holding. See sessions-offline.md.
4. **IP-05 iPad group session**: four equal columns with a different exercise in each make it hard to scan. The bottom bar mixes two actions for different clients. See sessions-offline.md.

## Good (no serious issues)
- Trainee Diet/meal flows (07–09, 24–26)
- Workout (10, 10b, 11, 11b, 12)
- Check-in (14, 100, 101)
- Notifications and lock screens (105–124, 27–30)
- Reminders, quiet hours and meal times (76–84)
- Sync and offline (85–88)
- Ended and reactivation states (89–92)
- Trainer mobile attention, exception and check-ins (05, 31–50)
- Activity (62–72)
- Auth (01, 06, 06b, 103)
- Trainer web home, workspace, exceptions, builders and settings (triaged at thumbnail size, no structural problems seen)
- IP-03, IP-06, IP-08 (minor notes are in sessions-offline.md)
