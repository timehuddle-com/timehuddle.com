import dayjs from "@calcom/dayjs";
import { getWorkingHours } from "@calcom/lib/availability";
import { yyyymmdd } from "@calcom/lib/date-fns";
import { hasReadPermissionsForUserId } from "@calcom/lib/hasEditPermissionForUser";
import { prisma } from "@calcom/prisma";
import type { TimeRange } from "@calcom/types/schedule";

import { TRPCError } from "@trpc/server";

import type { TrpcSessionUser } from "../../../../trpc";
import { convertScheduleToAvailability, getDefaultScheduleId } from "../util";
import type { TGetInputSchema } from "./get.schema";

type GetOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TGetInputSchema;
};

export const getHandler = async ({ ctx, input }: GetOptions) => {
  const { user } = ctx;

  const schedule = await prisma.schedule.findUnique({
    where: {
      id: input.scheduleId || (await getDefaultScheduleId(user.id, prisma)),
    },
    select: {
      id: true,
      userId: true,
      name: true,
      availability: true,
      timeZone: true,
    },
  });

  if (!schedule) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
    });
  }
  const isCurrentUserPartOfTeam = hasReadPermissionsForUserId({
    ctx,
    input: { memberId: schedule?.userId },
  });

  const isCurrentUserOwner = schedule?.userId === user.id;

  if (!isCurrentUserPartOfTeam && !isCurrentUserOwner) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
    });
  }

  const timeZone = schedule.timeZone || user.timeZone;

  const schedulesCount = await prisma.schedule.count({
    where: {
      userId: user.id,
    },
  });
  // disabling utc casting while fetching WorkingHours
  return {
    id: schedule.id,
    name: schedule.name,
    isManaged: schedule.userId !== user.id,
    workingHours: getWorkingHours(
      { timeZone: schedule.timeZone || undefined, utcOffset: 0 },
      schedule.availability || []
    ),
    schedule: schedule.availability,
    availability: convertScheduleToAvailability(schedule).map((a) =>
      a.map((startAndEnd) => ({
        ...startAndEnd,
        // Turn our limited granularity into proper end of day.
        end: new Date(startAndEnd.end.toISOString().replace("23:59:00.000Z", "23:59:59.999Z")),
      }))
    ),
    timeZone,
    dateOverrides: schedule.availability.reduce((acc, override) => {
      // only iff future date override
      if (!override.date || dayjs.tz(override.date, timeZone).isBefore(dayjs(), "day")) {
        return acc;
      }
      const newValue = {
        start: dayjs
          .utc(override.date)
          .hour(override.startTime.getUTCHours())
          .minute(override.startTime.getUTCMinutes())
          .toDate(),
        end: dayjs
          .utc(override.date)
          .hour(override.endTime.getUTCHours())
          .minute(override.endTime.getUTCMinutes())
          .toDate(),
      };
      const dayRangeIndex = acc.findIndex(
        // early return prevents override.date from ever being empty.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (item) => yyyymmdd(item.ranges[0].start) === yyyymmdd(override.date!)
      );
      if (dayRangeIndex === -1) {
        acc.push({ ranges: [newValue] });
        return acc;
      }
      acc[dayRangeIndex].ranges.push(newValue);
      return acc;
    }, [] as { ranges: TimeRange[] }[]),
    isDefault: !input.scheduleId || user.defaultScheduleId === schedule.id,
    isLastSchedule: schedulesCount <= 1,
    readOnly: schedule.userId !== user.id && !input.isManagedEventType,
  };
};
