/**
 * Shared Lead -> Student (+ portal login) provisioning, used by both the
 * legacy advisor-driven path (lead lifecycle's convertToStudent checkbox)
 * and the new self-service verified-lead path (lead.verifyLead). Both
 * produce the exact same Student record shape; only how a portal login and
 * initial wallet grant are attached differs.
 */
import crypto from 'crypto';

function splitName(full: string | undefined): { firstName: string; lastName: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Unknown', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

type LeadLike = {
  id: number;
  name?: string;
  email?: string;
  whatsapp?: string;
  intake?: string;
  intendedDegree?: 'Bachelors' | 'Masters';
  message?: string;
  source?: string;
};

export default {
  /** Creates a Student from a Lead if one doesn't already exist for it. Returns the (new or existing) Student id. */
  async createStudentFromLead(lead: LeadLike): Promise<number> {
    const existing = (await strapi.db
      .query('api::student.student')
      .findOne({ where: { sourceLead: lead.id } })) as { id: number } | null;
    if (existing) return existing.id;

    const { firstName, lastName } = splitName(lead.name);
    const created = (await strapi.db.query('api::student.student').create({
      data: {
        firstName,
        lastName,
        email: lead.email,
        whatsapp: lead.whatsapp,
        targetIntake: lead.intake,
        level: lead.intendedDegree,
        notes: lead.message ? `From website lead (source: ${lead.source ?? 'unknown'}):\n${lead.message}` : undefined,
        sourceLead: lead.id,
        stage: 'New',
      },
    })) as { id: number };
    return created.id;
  },

  /**
   * Creates (or returns the existing) portal login for a student, with the
   * Student users-permissions role. The password is random and never
   * surfaced anywhere — the verified-lead flow logs the caller in directly
   * via an issued JWT, it never asks the student to type a password.
   */
  async ensurePortalUser(studentId: number, email: string): Promise<{ id: number }> {
    const student = (await strapi.db
      .query('api::student.student')
      .findOne({ where: { id: studentId }, populate: ['portalUser'] })) as {
      portalUser?: { id: number } | null;
    } | null;
    if (student?.portalUser) return student.portalUser;

    const studentRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'student' } });
    if (!studentRole) {
      throw new Error('Student users-permissions role not found — has setupStudentPortalRole run?');
    }

    const userService = strapi.plugin('users-permissions').service('user') as {
      add: (values: Record<string, unknown>) => Promise<{ id: number }>;
    };
    const user = await userService.add({
      username: email,
      email,
      password: crypto.randomBytes(24).toString('hex'),
      provider: 'local',
      confirmed: true,
      blocked: false,
      role: studentRole.id,
    });

    await strapi.db.query('api::student.student').update({ where: { id: studentId }, data: { portalUser: user.id } });
    return user;
  },

  /**
   * Issues a portal JWT for a user, the same shape returned by POST
   * /api/auth/local. This project's users-permissions jwtManagement mode is
   * "refresh" (see config/plugins.ts), under which jwt.issue() returns a
   * Promise (it generates a refresh token + exchanges it for an access
   * token internally) rather than a plain string — must be awaited.
   */
  async issuePortalJwt(userId: number): Promise<string> {
    const jwtService = strapi.plugin('users-permissions').service('jwt') as {
      issue: (payload: { id: number }) => string | Promise<string>;
    };
    return jwtService.issue({ id: userId });
  },
};
