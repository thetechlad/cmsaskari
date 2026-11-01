// One-off verification script for the CRM automation lifecycle hooks.
// Runs against the live app instance directly (bypassing HTTP/admin auth
// entirely), so it's unaffected by the admin login rate limiter.
// Usage: node scripts/test-crm-automation.cjs
const { createStrapi } = require('@strapi/strapi');

function log(label, obj) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(obj, null, 2));
}

async function main() {
  const app = await createStrapi({ distDir: './dist' }).load();
  try {
    const student = await app.db.query('api::student.student').findOne({
      where: { email: 'zara.test@example.com' },
    });
    if (!student) throw new Error('Test student not found — run the lead-conversion test first');
    log('Student before', { id: student.id, stage: student.stage });

    const steps = await app.db
      .query('api::process-step.process-step')
      .findMany({ where: { student: student.id }, orderBy: { order: 'asc' } });
    log(
      'Process steps',
      steps.map((s) => ({ order: s.order, title: s.title, stepStatus: s.stepStatus }))
    );

    const arrivalStep = steps.find((s) => s.order === 8);
    await app.db
      .query('api::process-step.process-step')
      .update({ where: { id: arrivalStep.id }, data: { stepStatus: 'Completed' } });

    const studentAfter = await app.db.query('api::student.student').findOne({ where: { id: student.id } });
    log('Student after completing step 8', { stage: studentAfter.stage });
    console.log(studentAfter.stage === 'Enrolled' ? 'PASS: stage auto-advanced to Enrolled' : 'FAIL: stage did not advance');

    const docStep = steps.find((s) => s.order === 2);
    await app.db
      .query('api::process-step.process-step')
      .update({ where: { id: docStep.id }, data: { stepStatus: 'Blocked' } });

    const tasks = await app.db.query('api::task.task').findMany({ where: { student: student.id } });
    log(
      'Tasks for student after blocking step 2',
      tasks.map((t) => ({ title: t.title, priority: t.priority, dueDate: t.dueDate }))
    );
    const escalationTask = tasks.find((t) => t.title.includes('Unblock') && t.title.includes('Document Collection'));
    console.log(escalationTask ? 'PASS: blocked-step task auto-created' : 'FAIL: no escalation task found');

    await app.db.query('api::task.task').deleteMany({ where: { student: student.id } });
    await app.db.query('api::process-step.process-step').deleteMany({ where: { student: student.id } });
    await app.db.query('api::student.student').delete({ where: { id: student.id } });
    const lead = await app.db.query('api::lead.lead').findOne({ where: { email: 'zara.test@example.com' } });
    if (lead) await app.db.query('api::lead.lead').delete({ where: { id: lead.id } });
    console.log('\nCleanup complete — test student, steps, tasks, and lead removed.');
  } catch (err) {
    console.error('TEST FAILED:', err);
  } finally {
    await app.destroy();
    process.exit(0);
  }
}

main();
