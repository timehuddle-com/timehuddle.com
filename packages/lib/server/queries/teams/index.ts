import { Prisma } from "@prisma/client";

import prisma, { baseEventTypeSelect } from "@calcom/prisma";
import { SchedulingType } from "@calcom/prisma/enums";
import { EventTypeMetaDataSchema, teamMetadataSchema } from "@calcom/prisma/zod-utils";

import { WEBAPP_URL } from "../../../constants";

export type TeamWithMembers = Awaited<ReturnType<typeof getTeamWithMembers>>;

export async function getTeamWithMembers(id?: number, slug?: string, userId?: number) {
  const userSelect = Prisma.validator<Prisma.UserSelect>()({
    username: true,
    email: true,
    name: true,
    id: true,
    bio: true,
  });
  const teamSelect = Prisma.validator<Prisma.TeamSelect>()({
    id: true,
    name: true,
    slug: true,
    logo: true,
    bio: true,
    hideBranding: true,
    hideBookATeamMember: true,
    isPrivate: true,
    metadata: true,
    parent: {
      select: {
        id: true,
        slug: true,
        name: true,
        logo: true,
      },
    },
    children: {
      select: {
        name: true,
        logo: true,
        slug: true,
        members: {
          select: {
            user: {
              select: {
                name: true,
                username: true,
              },
            },
          },
        },
      },
    },
    members: {
      select: {
        accepted: true,
        role: true,
        disableImpersonation: true,
        user: {
          select: userSelect,
        },
      },
    },
    theme: true,
    brandColor: true,
    darkBrandColor: true,
    eventTypes: {
      where: {
        hidden: false,
        schedulingType: {
          not: SchedulingType.MANAGED,
        },
      },
      select: {
        users: {
          select: userSelect,
        },
        metadata: true,
        ...baseEventTypeSelect,
      },
    },
    inviteTokens: {
      select: {
        token: true,
        expires: true,
        expiresInDays: true,
        identifier: true,
      },
    },
  });

  const where: Prisma.TeamFindFirstArgs["where"] = {};

  if (userId) where.members = { some: { userId } };
  if (id) where.id = id;
  if (slug) where.slug = slug;

  const team = await prisma.team.findFirst({
    where,
    select: teamSelect,
  });

  if (!team) return null;
  const members = team.members.map((obj) => {
    return {
      ...obj.user,
      role: obj.role,
      accepted: obj.accepted,
      disableImpersonation: obj.disableImpersonation,
      avatar: `${WEBAPP_URL}/${obj.user.username}/avatar.png`,
    };
  });

  const eventTypes = team.eventTypes.map((eventType) => ({
    ...eventType,
    metadata: EventTypeMetaDataSchema.parse(eventType.metadata),
  }));
  /** Don't leak invite tokens to the frontend */
  const { inviteTokens, ...teamWithoutInviteTokens } = team;
  return {
    ...teamWithoutInviteTokens,
    /** To prevent breaking we only return non-email attached token here, if we have one */
    inviteToken: inviteTokens.find((token) => token.identifier === "invite-link-for-teamId-" + team.id),
    metadata: teamMetadataSchema.parse(team.metadata),
    eventTypes,
    members,
  };
}

// also returns team
export async function isTeamAdmin(userId: number, teamId: number) {
  return (
    (await prisma.membership.findFirst({
      where: {
        userId,
        teamId,
        accepted: true,
        OR: [{ role: "ADMIN" }, { role: "OWNER" }],
      },
    })) || false
  );
}

export async function isTeamOwner(userId: number, teamId: number) {
  return !!(await prisma.membership.findFirst({
    where: {
      userId,
      teamId,
      accepted: true,
      role: "OWNER",
    },
  }));
}

export async function isTeamMember(userId: number, teamId: number) {
  return !!(await prisma.membership.findFirst({
    where: {
      userId,
      teamId,
      accepted: true,
    },
  }));
}
