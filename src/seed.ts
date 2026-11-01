import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import type { Core } from '@strapi/strapi';

const CONTENT_DIR = path.join(__dirname, '..', '..', 'seed-data');

function toInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = parseInt(String(value).trim(), 10);
  return Number.isNaN(n) ? undefined : n;
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function slugify(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[/,.]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const EXPANSION_CONTENT_DIR = CONTENT_DIR;

/**
 * Grants `find`/`findOne` (and `find` only for the site-setting single type)
 * permissions to the Public role for every public-facing content type.
 * Idempotent: only creates permission rows that don't already exist.
 */
async function setPublicPermissions(strapi: Core.Strapi) {
  const publicRole = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  if (!publicRole) {
    strapi.log.warn('[seed] Public role not found, skipping permission setup.');
    return;
  }

  const collectionTypes = [
    'service',
    'pricing-package',
    'ala-carte-item',
    'testimonial',
    'faq',
    'blog-post',
    'university',
    'masters-program',
    'bachelors-program',
    'regional-scholarship',
    'glossary-term',
    'visa-approval',
  ];

  const actions: string[] = [];
  for (const ct of collectionTypes) {
    actions.push(`api::${ct}.${ct}.find`);
    actions.push(`api::${ct}.${ct}.findOne`);
  }
  actions.push('api::site-setting.site-setting.find');
  // Leads are a public contact-form submission target: allow creating them,
  // but never allow the public to list/read/update/delete leads.
  actions.push('api::lead.lead.create');

  for (const action of actions) {
    const existing = await strapi.query('plugin::users-permissions.permission').findOne({
      where: { action, role: publicRole.id },
    });
    if (!existing) {
      await strapi.query('plugin::users-permissions.permission').create({
        data: { action, role: publicRole.id },
      });
      strapi.log.info(`[seed] Granted public permission: ${action}`);
    }
  }
}

async function seedServices(strapi: Core.Strapi, data: any) {
  const count = await strapi.documents('api::service.service').count({});
  if (count > 0) return;
  const items = data.services || [];
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    await strapi.documents('api::service.service').create({
      data: {
        num: str(s.num),
        name: str(s.name),
        slug: str(s.slug),
        short: str(s.short),
        long: str(s.long),
        fee: str(s.fee),
        includes: s.includes || [],
        detail: str(s.detail),
        order: i + 1,
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${items.length} services`);
}

async function seedPricingPackages(strapi: Core.Strapi, data: any) {
  const count = await strapi.documents('api::pricing-package.pricing-package').count({});
  if (count > 0) return;
  const items = data.packages || [];
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    await strapi.documents('api::pricing-package.pricing-package').create({
      data: {
        tier: str(p.tier),
        badge: str(p.badge),
        name: str(p.name),
        price: str(p.price),
        who: str(p.who),
        items: p.items || [],
        order: i + 1,
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${items.length} pricing-packages`);
}

async function seedAlaCarteItems(strapi: Core.Strapi, data: any) {
  const count = await strapi.documents('api::ala-carte-item.ala-carte-item').count({});
  if (count > 0) return;
  const items = data.alacarte || [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    await strapi.documents('api::ala-carte-item.ala-carte-item').create({
      data: { name: str(a.name), price: str(a.price), order: i + 1 },
    });
  }
  strapi.log.info(`[seed] Seeded ${items.length} ala-carte-items`);
}

async function seedTestimonials(strapi: Core.Strapi, data: any) {
  const count = await strapi.documents('api::testimonial.testimonial').count({});
  if (count > 0) return;
  const items = data.testimonials || [];
  for (let i = 0; i < items.length; i++) {
    const t = items[i];
    await strapi.documents('api::testimonial.testimonial').create({
      data: {
        tag: str(t.tag),
        quote: str(t.quote),
        name: str(t.name),
        where: str(t.where),
        featured: !!t.featured,
        order: i + 1,
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${items.length} testimonials`);
}

// Real 2026 client outcomes, transcribed from the actual "Visa Approved" social
// posters Askari Consultants published (Downloads/Italy Visa Success — Photo
// Posts & Ads). Dates/universities/programmes are read directly off each
// poster — nothing here is invented. Two clients' posters (Muhammad Awaab Ali,
// Tayyab Irfan) don't show a university or approval date on the poster itself,
// so those fields are left empty rather than guessed (schema allows this).
// Photos are attached separately by scripts/attach-visa-approval-photos.cjs.
async function seedVisaApprovals(strapi: Core.Strapi) {
  const count = await strapi.documents('api::visa-approval.visa-approval').count({});
  if (count > 0) return;
  const items: {
    studentName: string;
    university?: string;
    programme?: string;
    visaDate?: string;
    featured: boolean;
  }[] = [
    { studentName: 'Muhammad Waqas Qazi', university: 'University of Florence', visaDate: '2026-10-07', featured: true },
    { studentName: 'Muhammad Umar Iqbal Khan', university: 'University of Palermo', programme: 'Automation and System Engineering', visaDate: '2026-10-02', featured: true },
    { studentName: 'Javed Javed', university: 'University of Milano-Bicocca', visaDate: '2026-10-01', featured: true },
    { studentName: 'Kulsoom Latif', university: 'University of Ferrara', visaDate: '2026-09-22', featured: false },
    { studentName: 'Hamza Yaqoob', university: 'University of Messina', programme: 'BS Data Analysis', visaDate: '2026-08-24', featured: false },
    { studentName: 'Faizan Ahmed Khan', university: 'University of Florence', programme: 'Applied Chemical Sciences and Technologies', visaDate: '2026-08-24', featured: false },
    { studentName: 'Salman', university: 'University of Milano-Bicocca', programme: 'MS Data Science', visaDate: '2026-08-24', featured: false },
    { studentName: 'Muhammad Sarim Kirmani', university: 'University of Florence', programme: 'Advanced Chemical Sciences and Technologies', visaDate: '2026-08-17', featured: false },
    { studentName: 'Namrah Hussain', university: 'University of Bologna', programme: 'Fashion Studies', visaDate: '2026-08-17', featured: false },
    { studentName: 'Sami Sultan', university: 'University of Rome Tor Vergata', programme: 'MSc ICT and Internet Engineering', visaDate: '2026-08-13', featured: false },
    { studentName: 'Saad Raza', university: 'University of Turin', programme: 'Artificial Intelligence and Advance High Computing', visaDate: '2026-08-11', featured: false },
    { studentName: 'Ali Hamza', university: 'University of Florence', programme: 'Mechanical Engineering for Sustainability', visaDate: '2026-08-07', featured: false },
    { studentName: 'Abdul Rafeh', university: 'University of Padova', programme: 'MSc Electrical Engineering', visaDate: '2026-08-06', featured: false },
    { studentName: 'Muhammad Waleed Ali', university: 'University of Genoa', programme: 'MSc Energy Engineering', visaDate: '2026-08-06', featured: false },
    { studentName: 'Ansharah Fatima', university: 'Sapienza University of Rome', programme: 'MSc Fashion Studies and Practices', visaDate: '2026-08-06', featured: false },
    { studentName: 'Muhammad Awaab Ali', featured: false },
    { studentName: 'Tayyab Irfan', university: 'University of Bari Aldo Moro', featured: false },
  ];
  for (let i = 0; i < items.length; i++) {
    const v = items[i];
    await strapi.documents('api::visa-approval.visa-approval').create({
      data: { ...v, order: i + 1 },
    });
  }
  strapi.log.info(`[seed] Seeded ${items.length} visa-approvals`);
}

async function seedFaqs(strapi: Core.Strapi, data: any) {
  const count = await strapi.documents('api::faq.faq').count({});
  if (count > 0) return;
  const items = data.faqs || [];
  for (let i = 0; i < items.length; i++) {
    const f = items[i];
    await strapi.documents('api::faq.faq').create({
      data: { question: str(f.question), answer: str(f.answer), order: i + 1 },
    });
  }
  strapi.log.info(`[seed] Seeded ${items.length} faqs`);
}

async function seedBlogPosts(strapi: Core.Strapi, data: any) {
  const count = await strapi.documents('api::blog-post.blog-post').count({});
  if (count > 0) return;
  const items = data.blogPosts || [];
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    await strapi.documents('api::blog-post.blog-post').create({
      data: {
        category: str(b.category),
        date: str(b.date),
        readTime: str(b.readTime),
        title: str(b.title),
        slug: str(b.slug),
        excerpt: str(b.excerpt),
        body: b.body || [],
        order: i + 1,
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${items.length} blog-posts`);
}

async function seedSiteSetting(strapi: Core.Strapi, data: any) {
  const existing = await strapi.documents('api::site-setting.site-setting').findFirst();
  if (existing) return;
  const contact = data.contact || {};
  await strapi.documents('api::site-setting.site-setting').create({
    data: {
      heroStats: data.heroStats || [],
      processSteps: data.processSteps || [],
      reasons: data.reasons || [],
      cities: data.cities || [],
      aboutFacts: data.aboutFacts || [],
      principles: data.principles || [],
      contactFacts: data.contactFacts || [],
      whatsappItaly: str(contact.whatsappItaly),
      whatsappPakistan: str(contact.whatsappPakistan),
      email: str(contact.email),
      offices: str(contact.offices),
      facebook: str(contact.facebook),
      instagram: str(contact.instagram),
    },
  });
  strapi.log.info('[seed] Seeded site-setting');
}

async function seedUniversities(strapi: Core.Strapi) {
  const count = await strapi.documents('api::university.university').count({});
  if (count > 0) return;
  const csvContent = fs.readFileSync(
    path.join(CONTENT_DIR, 'data-sheet-2-University_List.csv')
  );
  const rows: any[] = parse(csvContent, { columns: true, skip_empty_lines: true });
  for (const r of rows) {
    await strapi.documents('api::university.university').create({
      data: {
        number: toInt(r['#']),
        name: str(r['University']),
        applicationLink: str(r['Application Link / Tutorial']),
        blogLink: str(r['Blog']),
        admissionFee: str(r['Admission Fee (EUR)']),
        englishCertificate: str(r['English Certificate']),
        estimatedAdmissionDate: str(r['Estimated Admission Date']),
        deadline: str(r['Deadline']),
        status: str(r['Status']),
        cgpaRequirement: str(r['CGPA Requirement']),
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${rows.length} universities`);
}

async function seedMastersPrograms(strapi: Core.Strapi) {
  const count = await strapi.documents('api::masters-program.masters-program').count({});
  if (count > 0) return;
  const csvContent = fs.readFileSync(
    path.join(CONTENT_DIR, 'data-sheet-3-Masters_Programs.csv')
  );
  const rows: any[] = parse(csvContent, { columns: true, skip_empty_lines: true });
  for (const r of rows) {
    await strapi.documents('api::masters-program.masters-program').create({
      data: {
        number: toInt(r['#']),
        program: str(r['Program']),
        field: str(r['Field / Department']),
        universityName: str(r['University']),
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${rows.length} masters-programs`);
}

async function seedBachelorsPrograms(strapi: Core.Strapi) {
  const count = await strapi.documents('api::bachelors-program.bachelors-program').count({});
  if (count > 0) return;
  const csvContent = fs.readFileSync(
    path.join(CONTENT_DIR, 'data-sheet-4-Bachelors_Programs.csv')
  );
  const rows: any[] = parse(csvContent, { columns: true, skip_empty_lines: true });
  for (const r of rows) {
    await strapi.documents('api::bachelors-program.bachelors-program').create({
      data: {
        number: toInt(r['#']),
        program: str(r['Program']),
        field: str(r['Field']),
        universityName: str(r['University']),
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${rows.length} bachelors-programs`);
}

async function seedRegionalScholarships(strapi: Core.Strapi) {
  const count = await strapi.documents('api::regional-scholarship.regional-scholarship').count({});
  if (count > 0) return;
  const raw = fs.readFileSync(
    path.join(CONTENT_DIR, 'data-sheet-5-Regional_Scholarships.csv'),
    'utf8'
  );
  // First two lines are a title row and a description paragraph row; the real
  // header ("#,University,Regional Agency (DSU/ERSU),...") is the third line.
  const lines = raw.split(/\r\n|\n/);
  const withoutIntro = lines.slice(2).join('\n');
  const rows: any[] = parse(withoutIntro, { columns: true, skip_empty_lines: true });
  for (const r of rows) {
    await strapi.documents('api::regional-scholarship.regional-scholarship').create({
      data: {
        number: toInt(r['#']),
        universityName: str(r['University']),
        regionalAgency: str(r['Regional Agency (DSU/ERSU)']),
        documentRequirements: str(r['Document Requirements']),
        openingDate: str(r['Opening Date']),
        status: str(r['Status']),
        deadline: str(r['Deadline']),
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${rows.length} regional-scholarships`);
}

async function seedGlossaryTerms(strapi: Core.Strapi) {
  const count = await strapi.documents('api::glossary-term.glossary-term').count({});
  if (count > 0) return;
  const jsonPath = path.join(EXPANSION_CONTENT_DIR, 'expansion-content.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const items = data.glossaryTerms || [];
  for (let i = 0; i < items.length; i++) {
    const g = items[i];
    await strapi.documents('api::glossary-term.glossary-term').create({
      data: {
        term: str(g.term),
        category: str(g.category),
        definition: str(g.definition),
        slug: slugify(str(g.term)),
        order: i + 1,
      },
    });
  }
  strapi.log.info(`[seed] Seeded ${items.length} glossary-terms`);
}

/**
 * Applies the expansion-content.json FAQ corrections: fixes the outdated
 * financial-proof figure on the existing FAQ row (update, not duplicate),
 * and appends the 5 new FAQ entries, continuing the `order` sequence.
 * Idempotent: matches by exact question text before creating/updating.
 */
async function applyFaqExpansion(strapi: Core.Strapi) {
  const jsonPath = path.join(EXPANSION_CONTENT_DIR, 'expansion-content.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const moneyQuestion = 'How much money do I need to show?';
  const newAnswer = data.faqUpdates?.['how-much-money-do-i-need-to-show'];
  if (newAnswer) {
    const existing = await strapi
      .query('api::faq.faq')
      .findOne({ where: { question: moneyQuestion } });
    if (existing && existing.answer !== newAnswer) {
      await strapi.documents('api::faq.faq').update({
        documentId: existing.documentId,
        data: { answer: str(newAnswer) },
      });
      strapi.log.info('[seed] Updated outdated FAQ answer for financial-proof question');
    }
  }

  const newFaqs = data.newFaqs || [];
  if (newFaqs.length === 0) return;

  const allFaqs = await strapi.query('api::faq.faq').findMany({});
  const existingQuestions = new Set(allFaqs.map((f: any) => f.question));
  const maxOrder = allFaqs.reduce((max: number, f: any) => Math.max(max, f.order || 0), 0);

  let added = 0;
  for (let i = 0; i < newFaqs.length; i++) {
    const f = newFaqs[i];
    if (existingQuestions.has(str(f.question))) continue;
    await strapi.documents('api::faq.faq').create({
      data: {
        question: str(f.question),
        answer: str(f.answer),
        order: maxOrder + i + 1,
      },
    });
    added++;
  }
  if (added > 0) strapi.log.info(`[seed] Added ${added} new faqs`);
}

/**
 * Adds the 5 new blog-post entries from expansion-content.json, continuing
 * the `order` sequence. Idempotent: matches by slug before creating.
 */
async function seedExpansionBlogPosts(strapi: Core.Strapi) {
  const jsonPath = path.join(EXPANSION_CONTENT_DIR, 'expansion-content.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const items = data.blogPosts || [];
  if (items.length === 0) return;

  const allPosts = await strapi.query('api::blog-post.blog-post').findMany({});
  const existingSlugs = new Set(allPosts.map((b: any) => b.slug));
  const maxOrder = allPosts.reduce((max: number, b: any) => Math.max(max, b.order || 0), 0);

  let added = 0;
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    if (existingSlugs.has(str(b.slug))) continue;
    await strapi.documents('api::blog-post.blog-post').create({
      data: {
        category: str(b.category),
        date: str(b.date),
        readTime: str(b.readTime),
        title: str(b.title),
        slug: str(b.slug),
        excerpt: str(b.excerpt),
        body: b.body || [],
        order: maxOrder + i + 1,
      },
    });
    added++;
  }
  if (added > 0) strapi.log.info(`[seed] Added ${added} new blog-posts`);
}

const DOCUMENT_CHECKLIST = {
  bachelors: [
    {
      item: 'Valid passport',
      note: 'Must remain valid well past your intended visa period.',
    },
    {
      item: "High school certificate & mark sheet",
      note: "If your final certificate isn't issued yet, a Bonafide certificate confirming enrolment and expected completion date can stand in.",
    },
    {
      item: 'Recommendation letters',
      note: "Not every programme asks for these — check the specific course.",
    },
    {
      item: 'Tailored motivation letter',
      note: 'Written for the exact programme, not a generic template.',
    },
    {
      item: 'IELTS',
      note: "Required by most Bachelor's programmes; MOI letters are less commonly accepted at this level than for Master's.",
    },
    { item: 'Europass-format CV', note: '' },
    { item: 'Passport-sized photograph', note: '' },
    {
      item: 'TOLC entrance test result',
      note: 'Required by most universities; a few programmes are exceptions.',
    },
  ],
  masters: [
    { item: 'Valid passport', note: '' },
    {
      item: "Bachelor's degree & transcript",
      note: 'Or a Hope/provisional certificate if not yet completed.',
    },
    { item: 'High school mark sheet & certificate', note: '' },
    {
      item: 'Recommendation letters',
      note: 'Where required by the programme.',
    },
    {
      item: 'Tailored motivation letter',
      note: 'Written per programme, not reused.',
    },
    { item: 'English Proficiency Letter (MOI) or IELTS', note: '' },
    { item: 'Europass-format CV', note: '' },
    { item: 'Passport-sized photograph', note: '' },
    { item: 'Job experience letter', note: 'If available.' },
    { item: 'Internship certificate', note: 'If available.' },
    { item: 'Related course certifications', note: 'If available.' },
    {
      item: "Bachelor's syllabus / course content",
      note: 'Where required by the university.',
    },
  ],
};

/**
 * Extends the single site-setting row with aboutByTheNumbers and
 * documentChecklist. Updates the existing row in place (never creates a
 * second one) and only fills fields that are not already set.
 */
async function extendSiteSetting(strapi: Core.Strapi) {
  const existing = await strapi.documents('api::site-setting.site-setting').findFirst();
  if (!existing) {
    strapi.log.warn('[seed] No site-setting row found, skipping expansion fields.');
    return;
  }

  const jsonPath = path.join(EXPANSION_CONTENT_DIR, 'expansion-content.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const update: Record<string, unknown> = {};
  if (!existing.aboutByTheNumbers) {
    update.aboutByTheNumbers = data.aboutByTheNumbers || [];
  }
  if (!existing.documentChecklist) {
    update.documentChecklist = DOCUMENT_CHECKLIST;
  }
  if (!existing.applicationDeadline) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 100);
    update.applicationDeadline = deadline.toISOString();
  }

  if (Object.keys(update).length > 0) {
    await strapi.documents('api::site-setting.site-setting').update({
      documentId: existing.documentId,
      data: update,
    });
    strapi.log.info('[seed] Extended site-setting with expansion fields.');
  }
}

/**
 * Renames the two default non-super-admin Strapi admin roles and scopes their
 * permissions: Editor -> Advisor (student pipeline), Author -> Social Team
 * (marketing content). Idempotent: matches on the underlying `code` (which
 * never changes) rather than `name`, so reruns after a rename are safe.
 *
 * Advisor's access to Student/Task is additionally scoped to records where
 * `assignedAdvisor` matches the logged-in admin's email, via the
 * `api::is-assigned-advisor` / `api::is-assigned-advisor-via-student`
 * conditions registered in `src/index.ts`.
 */
async function setupAdminRoles(strapi: Core.Strapi) {
  const roleService = strapi.service('admin::role');

  const editorRole = await strapi.query('admin::role').findOne({ where: { code: 'strapi-editor' } });
  const authorRole = await strapi.query('admin::role').findOne({ where: { code: 'strapi-author' } });

  if (!editorRole || !authorRole) {
    strapi.log.warn('[seed] Default Editor/Author admin roles not found, skipping RBAC setup.');
    return;
  }

  if (editorRole.name !== 'Advisor') {
    await roleService.update(
      { id: editorRole.id },
      {
        name: 'Advisor',
        description: 'Manages student pipeline: applications, documents, tasks and communication log.',
      }
    );
  }
  if (authorRole.name !== 'Social Team') {
    await roleService.update(
      { id: authorRole.id },
      {
        name: 'Social Team',
        description: 'Manages blog content, testimonials, glossary and social posts. No access to student/CRM data.',
      }
    );
  }

  const explorerAction = (action: string) => `plugin::content-manager.explorer.${action}`;
  const cmPerm = (subject: string, action: string, conditions?: string[]) => {
    const p: Record<string, unknown> = { action: explorerAction(action), subject };
    if (action !== 'delete') p.properties = { fields: ['*'], locales: [] };
    if (conditions) p.conditions = conditions;
    return p;
  };

  const advisorPermissions: Record<string, unknown>[] = [];
  for (const [subject, conditionName] of [
    ['api::student.student', 'api::is-assigned-advisor'],
    ['api::task.task', 'api::is-assigned-advisor'],
    ['api::application.application', 'api::is-assigned-advisor-via-student'],
    ['api::document.document', 'api::is-assigned-advisor-via-student'],
    ['api::note.note', 'api::is-assigned-advisor-via-student'],
    ['api::process-step.process-step', 'api::is-assigned-advisor-via-student'],
    ['api::lead.lead', null],
    ['api::visa-approval.visa-approval', null],
  ] as const) {
    const condition = conditionName ? [conditionName] : undefined;
    advisorPermissions.push(cmPerm(subject, 'create'));
    advisorPermissions.push(cmPerm(subject, 'read', condition));
    advisorPermissions.push(cmPerm(subject, 'update', condition));
    advisorPermissions.push(cmPerm(subject, 'delete', condition));
  }
  // So advisors can create/manage student portal login accounts (Phase: student portal).
  for (const action of ['create', 'read', 'update']) {
    advisorPermissions.push(cmPerm('plugin::users-permissions.user', action));
  }
  advisorPermissions.push({ action: 'plugin::users-permissions.roles.read' });

  // Media Library admin permissions — SEPARATE from both the content-type
  // field permission above and the public-API `plugin::upload.content-api.*`
  // grant given to the Student role elsewhere in this file. Without these,
  // opening any media field (document.file, process-step.attachment,
  // social-post.asset) in the admin panel crashes the Media Library's RBAC
  // check instead of just showing "no permission" — a real bug found via a
  // browser console error, not caught by any of this project's earlier
  // curl-based testing since that never exercises the admin UI itself.
  const MEDIA_LIBRARY_PERMISSIONS = [
    'plugin::upload.read',
    'plugin::upload.assets.create',
    'plugin::upload.assets.update',
    'plugin::upload.assets.download',
    'plugin::upload.assets.copy-link',
  ];
  for (const action of MEDIA_LIBRARY_PERMISSIONS) {
    advisorPermissions.push({ action });
  }

  await roleService.assignPermissions(editorRole.id, advisorPermissions);

  const socialPermissions: Record<string, unknown>[] = [];
  for (const subject of [
    'api::blog-post.blog-post',
    'api::testimonial.testimonial',
    'api::glossary-term.glossary-term',
    'api::social-post.social-post',
    'api::visa-approval.visa-approval',
  ]) {
    for (const action of ['create', 'read', 'update', 'delete']) {
      socialPermissions.push(cmPerm(subject, action));
    }
  }
  for (const action of MEDIA_LIBRARY_PERMISSIONS) {
    socialPermissions.push({ action });
  }
  await roleService.assignPermissions(authorRole.id, socialPermissions);

  strapi.log.info('[seed] Admin RBAC (Advisor / Social Team roles) configured.');
}

/**
 * Creates the "Student" users-permissions role (public-facing portal login,
 * distinct from the Strapi admin roles above) and grants it exactly the API
 * access a logged-in student needs: read their own student/application
 * records, read+upload their own documents. Row-level scoping (a student
 * can only ever see THEIR OWN records) is enforced in the controllers for
 * those three content types, not here — the users-permissions plugin has no
 * built-in condition system equivalent to the admin panel's.
 */
async function setupStudentPortalRole(strapi: Core.Strapi) {
  let studentRole = await strapi.query('plugin::users-permissions.role').findOne({ where: { type: 'student' } });

  if (!studentRole) {
    studentRole = await strapi.query('plugin::users-permissions.role').create({
      data: {
        name: 'Student',
        description: 'Portal login for students to view their own progress and upload documents.',
        type: 'student',
      },
    });
    strapi.log.info('[seed] Created Student users-permissions role.');
  }

  const actions = [
    'api::student.student.find',
    'api::student.student.findOne',
    'api::application.application.find',
    'api::document.document.find',
    'api::document.document.create',
    'api::process-step.process-step.find',
    'api::process-step.process-step.findOne',
    'plugin::upload.content-api.upload',
    'plugin::upload.content-api.find',
    'plugin::upload.content-api.findOne',
    // Needed to `populate` these relations on an application (Strapi checks
    // `find` access on a relation's TARGET type, separately per role — Public
    // already has these, but Student is a distinct role and needs its own grant).
    'api::university.university.find',
    'api::masters-program.masters-program.find',
    'api::bachelors-program.bachelors-program.find',
    'api::pricing-package.pricing-package.find',
  ];

  for (const action of actions) {
    const existing = await strapi.query('plugin::users-permissions.permission').findOne({
      where: { action, role: studentRole.id },
    });
    if (!existing) {
      await strapi.query('plugin::users-permissions.permission').create({
        data: { action, role: studentRole.id },
      });
      strapi.log.info(`[seed] Granted Student role permission: ${action}`);
    }
  }
}

export async function runSeed(strapi: Core.Strapi) {
  try {
    await setPublicPermissions(strapi);

    const jsonPath = path.join(CONTENT_DIR, 'site-content.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    await seedServices(strapi, data);
    await seedPricingPackages(strapi, data);
    await seedAlaCarteItems(strapi, data);
    await seedTestimonials(strapi, data);
    await seedVisaApprovals(strapi);
    await seedFaqs(strapi, data);
    await seedBlogPosts(strapi, data);
    await seedSiteSetting(strapi, data);

    await seedUniversities(strapi);
    await seedMastersPrograms(strapi);
    await seedBachelorsPrograms(strapi);
    await seedRegionalScholarships(strapi);

    await seedGlossaryTerms(strapi);
    await applyFaqExpansion(strapi);
    await seedExpansionBlogPosts(strapi);
    await extendSiteSetting(strapi);

    await setupAdminRoles(strapi);
    await setupStudentPortalRole(strapi);

    strapi.log.info('[seed] Bootstrap seeding complete.');
  } catch (err) {
    strapi.log.error('[seed] Seeding failed:', err);
  }
}
