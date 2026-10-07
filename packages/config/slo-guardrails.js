/**
 * FitBud MVP operating / SLO guardrails (Technical Architecture §§16–17).
 *
 * Comments and named constants only — not a dashboard, monitor, or alert system.
 * Move to a paid Cloudflare tier before any of these become routine.
 *
 * Capacity targets (engineering objectives, not vendor guarantees):
 * - Onboarded trainers: 100 target / 150 modelled ceiling
 * - Active trainees: 2,500 target / 3,750 modelled ceiling (~25 per trainer)
 * - API traffic: ≤50,000 requests/day; ≤75 RPM sustained / ≤300 RPM short peak
 * - API latency: p95 < 500 ms; p99 < 1 s for normal CRUD and sync
 * - Application errors: < 1% 5xx; availability objective 99.5% monthly
 * - D1: ≤3M reads/day, ≤50k writes/day, ≤350 MB per database
 * - R2: ≤7 GB, ≤500k Class A / ≤5M Class B ops per month
 * - Realtime: ≤250 sockets; ≤20k WebSocket messages/day
 * - Background jobs: ≤2,500/day; pickup p95 < 2 minutes
 * - Offline cached reads p95 < 100 ms; reconnect sync p95 < 10 s (≤100 pending)
 * - Push handoff Worker→FCM p95 < 2 s; ≥99% API acceptance target
 *
 * Zero-cost exit triggers (routine breach → paid tier / redesign):
 * >50k Worker req/day, >3M D1 reads or >50k writes/day, >350 MB D1,
 * >7 GB R2, >2.5k queued jobs/day, >20k realtime msgs/day, >300 RPM peak.
 */

export const SLO_GUARDRAILS = Object.freeze({
  apiRequestsPerDay: 50_000,
  sustainedRpm: 75,
  peakRpm: 300,
  apiP95Ms: 500,
  apiP99Ms: 1_000,
  maxFiveXxRate: 0.01,
  availabilityMonthly: 0.995,
  d1ReadsPerDay: 3_000_000,
  d1WritesPerDay: 50_000,
  d1MaxMb: 350,
  r2MaxGb: 7,
  realtimeSockets: 250,
  realtimeMessagesPerDay: 20_000,
  backgroundJobsPerDay: 2_500,
});
