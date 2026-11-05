/**
 * Ledger-based credit wallet for the matching feature. student.creditBalance
 * is a cached derivative; credit-transaction rows (see
 * src/api/credit-transaction/content-types/credit-transaction/schema.json)
 * are the source of truth. Every mutation runs inside strapi.db.transaction()
 * so the balance read + decide + ledger insert + balance write are atomic,
 * and every ledger row has a unique ledgerKey so a retried request (or a
 * genuine race between two transactions) produces exactly one effect
 * instead of double-granting or double-spending.
 */

const INITIAL_GRANT = 3;

export class ReadinessGateClosedError extends Error {}
export class InsufficientCreditsError extends Error {}

function isUniqueConstraintError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | undefined;
  if (!e) return false;
  const code = e.code ?? '';
  const message = e.message ?? '';
  return (
    code === '23505' || // postgres unique_violation
    code === 'ER_DUP_ENTRY' || // mysql
    code.startsWith('SQLITE_CONSTRAINT') || // sqlite3 driver
    /unique constraint/i.test(message) ||
    /duplicate key/i.test(message) ||
    /duplicate entry/i.test(message)
  );
}

async function getBalance(studentId: number): Promise<number> {
  const student = (await strapi.db
    .query('api::student.student')
    .findOne({ where: { id: studentId }, select: ['creditBalance'] })) as { creditBalance?: number } | null;
  return student?.creditBalance ?? 0;
}

async function ledgerEntryExists(ledgerKey: string): Promise<boolean> {
  const existing = await strapi.db
    .query('api::credit-transaction.credit-transaction')
    .findOne({ where: { ledgerKey }, select: ['id'] });
  return !!existing;
}

export default {
  /**
   * Grants the one-time 3-credit sign-up bonus. Idempotent per dedupeKey —
   * a reused contact (re-verifying the same normalized email) never gets a
   * second grant, it just gets back the current balance.
   */
  async grantInitialCredits(studentId: number, dedupeKey: string): Promise<number> {
    return strapi.db.transaction(async () => {
      const ledgerKey = `grant:${dedupeKey}`;
      if (await ledgerEntryExists(ledgerKey)) {
        return getBalance(studentId);
      }
      const current = await getBalance(studentId);
      const balanceAfter = current + INITIAL_GRANT;
      try {
        await strapi.db.query('api::credit-transaction.credit-transaction').create({
          data: { student: studentId, type: 'Grant', amount: INITIAL_GRANT, ledgerKey, balanceAfter },
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) return getBalance(studentId);
        throw err;
      }
      await strapi.db
        .query('api::student.student')
        .update({ where: { id: studentId }, data: { creditBalance: balanceAfter } });
      return balanceAfter;
    });
  },

  /**
   * Reserves one credit for a match run. Re-checks the readiness gate live
   * (never trust a cached flag) — a stale checklist state can never spend a
   * credit, and the reservation is never even attempted if the gate is
   * closed. Throws ReadinessGateClosedError or InsufficientCreditsError
   * (callers map these to 409 / 402 respectively).
   */
  async reserveCredit(studentId: number, matchRunId: number): Promise<number> {
    return strapi.db.transaction(async () => {
      const readiness = strapi.service('api::checklist-item.readiness') as {
        isReadinessGateOpen: (id: number) => Promise<boolean>;
      };
      const gateOpen = await readiness.isReadinessGateOpen(studentId);
      if (!gateOpen) throw new ReadinessGateClosedError('Readiness gate is closed.');

      const ledgerKey = `reserve:${matchRunId}`;
      if (await ledgerEntryExists(ledgerKey)) {
        return getBalance(studentId);
      }

      const current = await getBalance(studentId);
      if (current < 1) throw new InsufficientCreditsError('Insufficient credits.');
      const balanceAfter = current - 1;
      try {
        await strapi.db.query('api::credit-transaction.credit-transaction').create({
          data: { student: studentId, type: 'Reserve', amount: -1, ledgerKey, matchRun: matchRunId, balanceAfter },
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) return getBalance(studentId);
        throw err;
      }
      await strapi.db
        .query('api::student.student')
        .update({ where: { id: studentId }, data: { creditBalance: balanceAfter } });
      return balanceAfter;
    });
  },

  /** Settles a reserved credit on successful match-run publication. No balance change — already deducted at reserve. */
  async settleCredit(studentId: number, matchRunId: number): Promise<void> {
    return strapi.db.transaction(async () => {
      const ledgerKey = `settle:${matchRunId}`;
      if (await ledgerEntryExists(ledgerKey)) return;
      const current = await getBalance(studentId);
      try {
        await strapi.db.query('api::credit-transaction.credit-transaction').create({
          data: { student: studentId, type: 'Settle', amount: 0, ledgerKey, matchRun: matchRunId, balanceAfter: current },
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) return;
        throw err;
      }
    });
  },

  /** Releases a reserved credit back to the balance (error, stale input, or zero eligible results). */
  async releaseCredit(studentId: number, matchRunId: number, reason?: string): Promise<number> {
    return strapi.db.transaction(async () => {
      const ledgerKey = `release:${matchRunId}`;
      if (await ledgerEntryExists(ledgerKey)) {
        return getBalance(studentId);
      }
      const current = await getBalance(studentId);
      const balanceAfter = current + 1;
      try {
        await strapi.db.query('api::credit-transaction.credit-transaction').create({
          data: { student: studentId, type: 'Release', amount: 1, ledgerKey, matchRun: matchRunId, balanceAfter, note: reason },
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) return getBalance(studentId);
        throw err;
      }
      await strapi.db
        .query('api::student.student')
        .update({ where: { id: studentId }, data: { creditBalance: balanceAfter } });
      return balanceAfter;
    });
  },
};
