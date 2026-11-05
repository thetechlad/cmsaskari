import { factories } from '@strapi/strapi';

/**
 * Ledger rows are only ever written by the wallet service (src/api/student/
 * services/wallet.ts) inside a DB transaction with the uniqueness-enforced
 * ledgerKey idempotency check — never via the public REST API, which would
 * let a client forge grant/reserve/settle/release entries directly.
 */
export default factories.createCoreRouter('api::credit-transaction.credit-transaction', {
  only: ['find', 'findOne'],
});
