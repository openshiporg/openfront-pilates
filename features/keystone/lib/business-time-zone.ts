import { resolveStudioTimeZone } from "../../../lib/timezone";

/**
 * The one business timezone: the club's saved Store Settings zone, falling back to the
 * organization's. Setup, class generation, instructor availability and admission all use it, so the
 * same wall time means the same instant everywhere. Already accepted UTC instants are never
 * re-derived from it.
 */
export async function businessTimeZone(prisma: any, organizationId: string) {
  const [settings, organization] = await Promise.all([
    prisma.studioSettings.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "asc" }], select: { timezone: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  return resolveStudioTimeZone(settings?.timezone, organization?.timezone);
}
