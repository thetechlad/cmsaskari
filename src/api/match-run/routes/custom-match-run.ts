/**
 * Match runs must never be created via the default CRUD `create` route (which
 * would let a client bypass the wallet reservation and readiness-gate checks
 * entirely). The default router for this content-type is restricted to
 * find/findOne only — this is the single sanctioned way to produce a run.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/match-runs/run',
      handler: 'match-run.runMatch',
    },
  ],
};
