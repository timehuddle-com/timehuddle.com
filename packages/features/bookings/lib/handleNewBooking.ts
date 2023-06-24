import type { App, Attendee, Credential, EventTypeCustomInput } from "@prisma/client";
import { Prisma } from "@prisma/client";
import async from "async";
import { isValidPhoneNumber } from "libphonenumber-js";
import { cloneDeep } from "lodash";
import type { NextApiRequest } from "next";
import short, { uuid } from "short-uuid";
import { v5 as uuidv5 } from "uuid";
import z from "zod";

import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import { metadata as GoogleMeetMetadata } from "@calcom/app-store/googlevideo/_metadata";
import type { LocationObject } from "@calcom/app-store/locations";
import { OrganizerDefaultConferencingAppType } from "@calcom/app-store/locations";
import { getLocationValueForDB } from "@calcom/app-store/locations";
import { MeetLocationType } from "@calcom/app-store/locations";
import type { EventTypeAppsList } from "@calcom/app-store/utils";
import { getAppFromSlug } from "@calcom/app-store/utils";
import { cancelScheduledJobs, scheduleTrigger } from "@calcom/app-store/zapier/lib/nodeScheduler";
import EventManager from "@calcom/core/EventManager";
import { getEventName } from "@calcom/core/event";
import { getUserAvailability } from "@calcom/core/getUserAvailability";
import { deleteMeeting } from "@calcom/core/videoClient";
import type { ConfigType, Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import {
  sendAttendeeRequestEmail,
  sendOrganizerRequestEmail,
  sendRescheduledEmails,
  sendScheduledEmails,
  sendRescheduledSeatEmail,
  sendScheduledSeatsEmails,
} from "@calcom/emails";
import { getBookingFieldsWithSystemFields } from "@calcom/features/bookings/lib/getBookingFields";
import { getCalEventResponses } from "@calcom/features/bookings/lib/getCalEventResponses";
import { handleWebhookTrigger } from "@calcom/features/bookings/lib/handleWebhookTrigger";
import {
  allowDisablingAttendeeConfirmationEmails,
  allowDisablingHostConfirmationEmails,
} from "@calcom/features/ee/workflows/lib/allowDisablingStandardEmails";
import { deleteScheduledEmailReminder } from "@calcom/features/ee/workflows/lib/reminders/emailReminderManager";
import { scheduleWorkflowReminders } from "@calcom/features/ee/workflows/lib/reminders/reminderScheduler";
import { deleteScheduledSMSReminder } from "@calcom/features/ee/workflows/lib/reminders/smsReminderManager";
import type { GetSubscriberOptions } from "@calcom/features/webhooks/lib/getWebhooks";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import { isPrismaObjOrUndefined, parseRecurringEvent } from "@calcom/lib";
import { getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
import { getDefaultEvent, getGroupName, getUsernameList } from "@calcom/lib/defaultEvents";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import getPaymentAppData from "@calcom/lib/getPaymentAppData";
import { HttpError } from "@calcom/lib/http-error";
import isOutOfBounds, { BookingDateInPastError } from "@calcom/lib/isOutOfBounds";
import logger from "@calcom/lib/logger";
import { handlePayment } from "@calcom/lib/payment/handlePayment";
import { checkBookingLimits, checkDurationLimits, getLuckyUser } from "@calcom/lib/server";
import { getTranslation } from "@calcom/lib/server/i18n";
import { slugify } from "@calcom/lib/slugify";
import { updateWebUser as syncServicesUpdateWebUser } from "@calcom/lib/sync/SyncServiceManager";
import { TimeFormat } from "@calcom/lib/timeFormat";
import prisma, { userSelect } from "@calcom/prisma";
import type { BookingReference } from "@calcom/prisma/client";
import { BookingStatus, SchedulingType, WebhookTriggerEvents, WorkflowMethods } from "@calcom/prisma/enums";
import { bookingCreateSchemaLegacyPropsForApi } from "@calcom/prisma/zod-utils";
import {
  bookingCreateBodySchemaForApi,
  customInputSchema,
  EventTypeMetaDataSchema,
  extendedBookingCreateBody,
  userMetadata as userMetadataSchema,
} from "@calcom/prisma/zod-utils";
import type { BufferedBusyTime } from "@calcom/types/BufferedBusyTime";
import type {
  AdditionalInformation,
  AppsStatus,
  CalendarEvent,
  IntervalLimit,
  Person,
} from "@calcom/types/Calendar";
import type { EventResult, PartialReference } from "@calcom/types/EventManager";
import type { WorkingHours, TimeRange as DateOverride } from "@calcom/types/schedule";

import type { EventTypeInfo } from "../../webhooks/lib/sendPayload";
import getBookingResponsesSchema from "./getBookingResponsesSchema";

const translator = short();
const log = logger.getChildLogger({ prefix: ["[api] book:user"] });

type User = Prisma.UserGetPayload<typeof userSelect>;
type BufferedBusyTimes = BufferedBusyTime[];

interface IEventTypePaymentCredentialType {
  appId: EventTypeAppsList;
  app: {
    categories: App["categories"];
    dirName: string;
  };
  key: Prisma.JsonValue;
}

/**
 * Refreshes a Credential with fresh data from the database.
 *
 * @param credential
 */
async function refreshCredential(credential: Credential): Promise<Credential> {
  const newCredential = await prisma.credential.findUnique({
    where: {
      id: credential.id,
    },
  });

  if (!newCredential) {
    return credential;
  } else {
    return newCredential;
  }
}

/**
 * Refreshes the given set of credentials.
 *
 * @param credentials
 */
async function refreshCredentials(credentials: Array<Credential>): Promise<Array<Credential>> {
  return await async.mapLimit(credentials, 5, refreshCredential);
}

const isWithinAvailableHours = (
  timeSlot: { start: ConfigType; end: ConfigType },
  {
    workingHours,
    dateOverrides,
    organizerTimeZone,
    inviteeTimeZone,
  }: {
    workingHours: WorkingHours[];
    dateOverrides: DateOverride[];
    organizerTimeZone: string;
    inviteeTimeZone: string;
  }
) => {
  const timeSlotStart = dayjs(timeSlot.start).utc();
  const timeSlotEnd = dayjs(timeSlot.end).utc();
  const organizerDSTDiff =
    dayjs().tz(organizerTimeZone).utcOffset() - timeSlotStart.tz(organizerTimeZone).utcOffset();
  const getTime = (slotTime: Dayjs, minutes: number) =>
    slotTime.startOf("day").add(minutes + organizerDSTDiff, "minutes");

  for (const workingHour of workingHours) {
    const startTime = getTime(timeSlotStart, workingHour.startTime);
    // workingHours function logic set 1439 minutes when user select the end of the day (11:59) in his schedule
    // so, we need to add a minute, to avoid, "No available user" error when the last available slot is selected.
    const endTime = getTime(timeSlotEnd, workingHour.endTime === 1439 ? 1440 : workingHour.endTime);
    if (
      workingHour.days.includes(timeSlotStart.day()) &&
      // UTC mode, should be performant.
      timeSlotStart.isBetween(startTime, endTime, null, "[)") &&
      timeSlotEnd.isBetween(startTime, endTime, null, "(]")
    ) {
      return true;
    }
  }

  // check if it is a date override
  for (const dateOverride of dateOverrides) {
    const utcOffSet = dayjs(dateOverride.start).tz(inviteeTimeZone).utcOffset();

    const slotStart = dayjs(timeSlotStart).add(utcOffSet, "minute");
    const slotEnd = dayjs(timeSlotEnd).add(utcOffSet, "minute");

    if (
      slotStart.isBetween(dateOverride.start, dateOverride.end) &&
      slotEnd.isBetween(dateOverride.start, dateOverride.end)
    ) {
      return true;
    }
  }

  log.error(
    `NAUF: isWithinAvailableHours ${JSON.stringify({ ...timeSlot, organizerTimeZone, workingHours })}`
  );
  return false;
};

// if true, there are conflicts.
function checkForConflicts(busyTimes: BufferedBusyTimes, time: dayjs.ConfigType, length: number) {
  // Early return
  if (!Array.isArray(busyTimes) || busyTimes.length < 1) {
    return false; // guaranteed no conflicts when there is no busy times.
  }

  for (const busyTime of busyTimes) {
    const startTime = dayjs(busyTime.start);
    const endTime = dayjs(busyTime.end);
    // Check if time is between start and end times
    if (dayjs(time).isBetween(startTime, endTime, null, "[)")) {
      log.error(
        `NAUF: start between a busy time slot ${JSON.stringify({
          ...busyTime,
          time: dayjs(time).format(),
        })}`
      );
      return true;
    }
    // Check if slot end time is between start and end time
    if (dayjs(time).add(length, "minutes").isBetween(startTime, endTime)) {
      log.error(
        `NAUF: Ends between a busy time slot ${JSON.stringify({
          ...busyTime,
          time: dayjs(time).add(length, "minutes").format(),
        })}`
      );
      return true;
    }
    // Check if startTime is between slot
    if (startTime.isBetween(dayjs(time), dayjs(time).add(length, "minutes"))) {
      return true;
    }
  }
  return false;
}

const getEventTypesFromDB = async (eventTypeId: number) => {
  const eventType = await prisma.eventType.findUniqueOrThrow({
    where: {
      id: eventTypeId,
    },
    select: {
      id: true,
      customInputs: true,
      disableGuests: true,
      users: {
        select: {
          credentials: true,
          ...userSelect.select,
        },
      },
      slug: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      bookingFields: true,
      title: true,
      length: true,
      eventName: true,
      schedulingType: true,
      description: true,
      periodType: true,
      periodStartDate: true,
      periodEndDate: true,
      periodDays: true,
      periodCountCalendarDays: true,
      requiresConfirmation: true,
      userId: true,
      price: true,
      currency: true,
      metadata: true,
      destinationCalendar: true,
      hideCalendarNotes: true,
      seatsPerTimeSlot: true,
      recurringEvent: true,
      seatsShowAttendees: true,
      bookingLimits: true,
      durationLimits: true,
      owner: {
        select: {
          hideBranding: true,
        },
      },
      workflows: {
        include: {
          workflow: {
            include: {
              steps: true,
            },
          },
        },
      },
      locations: true,
      timeZone: true,
      schedule: {
        select: {
          availability: true,
          timeZone: true,
        },
      },
      hosts: {
        select: {
          isFixed: true,
          user: {
            select: {
              credentials: true,
              ...userSelect.select,
              organization: {
                select: {
                  slug: true,
                },
              },
            },
          },
        },
      },
      availability: {
        select: {
          date: true,
          startTime: true,
          endTime: true,
          days: true,
        },
      },
    },
  });

  return {
    ...eventType,
    metadata: EventTypeMetaDataSchema.parse(eventType?.metadata || {}),
    recurringEvent: parseRecurringEvent(eventType?.recurringEvent),
    customInputs: customInputSchema.array().parse(eventType?.customInputs || []),
    locations: (eventType?.locations ?? []) as LocationObject[],
    bookingFields: getBookingFieldsWithSystemFields(eventType || {}),
  };
};

type IsFixedAwareUser = User & {
  isFixed: boolean;
  credentials: Credential[];
  organization: { slug: string };
};

async function ensureAvailableUsers(
  eventType: Awaited<ReturnType<typeof getEventTypesFromDB>> & {
    users: IsFixedAwareUser[];
  },
  input: { dateFrom: string; dateTo: string; timeZone: string },
  recurringDatesInfo?: {
    allRecurringDates: string[] | undefined;
    currentRecurringIndex: number | undefined;
  }
) {
  const availableUsers: IsFixedAwareUser[] = [];
  /** Let's start checking for availability */
  for (const user of eventType.users) {
    const {
      busy: bufferedBusyTimes,
      workingHours,
      dateOverrides,
    } = await getUserAvailability(
      {
        userId: user.id,
        eventTypeId: eventType.id,
        ...input,
      },
      { user, eventType }
    );

    // check if time slot is outside of schedule.
    if (
      !isWithinAvailableHours(
        { start: input.dateFrom, end: input.dateTo },
        {
          workingHours,
          dateOverrides,
          organizerTimeZone: eventType.timeZone || eventType?.schedule?.timeZone || user.timeZone,
          inviteeTimeZone: input.timeZone,
        }
      )
    ) {
      // user does not have availability at this time, skip user.
      continue;
    }

    console.log("calendarBusyTimes==>>>", bufferedBusyTimes);

    let foundConflict = false;
    try {
      if (
        eventType.recurringEvent &&
        recurringDatesInfo?.currentRecurringIndex === 0 &&
        recurringDatesInfo.allRecurringDates
      ) {
        const allBookingDates = recurringDatesInfo.allRecurringDates.map((strDate) => new Date(strDate));
        // Go through each date for the recurring event and check if each one's availability
        // DONE: Decreased computational complexity from O(2^n) to O(n) by refactoring this loop to stop
        // running at the first unavailable time.
        let i = 0;
        while (!foundConflict && i < allBookingDates.length) {
          foundConflict = checkForConflicts(bufferedBusyTimes, allBookingDates[i++], eventType.length);
        }
      } else {
        foundConflict = checkForConflicts(bufferedBusyTimes, input.dateFrom, eventType.length);
      }
    } catch {
      log.debug({
        message: "Unable set isAvailableToBeBooked. Using true. ",
      });
    }
    // no conflicts found, add to available users.
    if (!foundConflict) {
      availableUsers.push(user);
    }
  }
  if (!availableUsers.length) {
    throw new Error("No available users found.");
  }
  return availableUsers;
}

async function getOriginalRescheduledBooking(uid: string, seatsEventType?: boolean) {
  return prisma.booking.findFirst({
    where: {
      uid: uid,
      status: {
        in: [BookingStatus.ACCEPTED, BookingStatus.CANCELLED, BookingStatus.PENDING],
      },
    },
    include: {
      attendees: {
        select: {
          name: true,
          email: true,
          locale: true,
          timeZone: true,
          ...(seatsEventType && { bookingSeat: true, id: true }),
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          locale: true,
          timeZone: true,
        },
      },
      payment: true,
      references: true,
      workflowReminders: true,
    },
  });
}

function getBookingData({
  req,
  isNotAnApiCall,
  eventType,
}: {
  req: NextApiRequest;
  isNotAnApiCall: boolean;
  eventType: Awaited<ReturnType<typeof getEventTypesFromDB>>;
}) {
  const responsesSchema = getBookingResponsesSchema({
    eventType: {
      bookingFields: eventType.bookingFields,
    },
    view: req.body.rescheduleUid ? "reschedule" : "booking",
  });
  const bookingDataSchema = isNotAnApiCall
    ? extendedBookingCreateBody.merge(
        z.object({
          responses: responsesSchema,
        })
      )
    : bookingCreateBodySchemaForApi
        .merge(
          z.object({
            responses: responsesSchema.optional(),
          })
        )
        .superRefine((val, ctx) => {
          if (val.responses && val.customInputs) {
            ctx.addIssue({
              code: "custom",
              message:
                "Don't use both customInputs and responses. `customInputs` is only there for legacy support.",
            });
            return;
          }
          const legacyProps = Object.keys(bookingCreateSchemaLegacyPropsForApi.shape);

          if (val.responses) {
            const unwantedProps: string[] = [];
            legacyProps.forEach((legacyProp) => {
              if (typeof val[legacyProp as keyof typeof val] !== "undefined") {
                console.error(
                  `Deprecated: Unexpected falsy value for: ${unwantedProps.join(
                    ","
                  )}. They can't be used with \`responses\`. This will become a 400 error in the future.`
                );
              }
              if (val[legacyProp as keyof typeof val]) {
                unwantedProps.push(legacyProp);
              }
            });
            if (unwantedProps.length) {
              ctx.addIssue({
                code: "custom",
                message: `Legacy Props: ${unwantedProps.join(",")}. They can't be used with \`responses\``,
              });
              return;
            }
          } else if (val.customInputs) {
            const { success } = bookingCreateSchemaLegacyPropsForApi.safeParse(val);
            if (!success) {
              ctx.addIssue({
                code: "custom",
                message: `With \`customInputs\` you must specify legacy props ${legacyProps.join(",")}`,
              });
            }
          }
        });

  const reqBody = bookingDataSchema.parse(req.body);

  // Work with Typescript to require reqBody.end
  type ReqBodyWithoutEnd = z.infer<typeof bookingDataSchema>;
  type ReqBodyWithEnd = ReqBodyWithoutEnd & { end: string };

  const reqBodyWithEnd = (reqBody: ReqBodyWithoutEnd): reqBody is ReqBodyWithEnd => {
    // Use the event length to auto-set the event end time.
    if (!Object.prototype.hasOwnProperty.call(reqBody, "end")) {
      reqBody.end = dayjs.utc(reqBody.start).add(eventType.length, "minutes").format();
    }
    return true;
  };
  if (!reqBodyWithEnd(reqBody)) {
    throw new Error("Internal Error.");
  }
  // reqBody.end is no longer an optional property.
  if ("customInputs" in reqBody) {
    if (reqBody.customInputs) {
      // Check if required custom inputs exist
      handleCustomInputs(eventType.customInputs as EventTypeCustomInput[], reqBody.customInputs);
    }
    const reqBodyWithLegacyProps = bookingCreateSchemaLegacyPropsForApi.parse(reqBody);
    return {
      ...reqBody,
      name: reqBodyWithLegacyProps.name,
      email: reqBodyWithLegacyProps.email,
      guests: reqBodyWithLegacyProps.guests,
      location: reqBodyWithLegacyProps.location || "",
      smsReminderNumber: reqBodyWithLegacyProps.smsReminderNumber,
      notes: reqBodyWithLegacyProps.notes,
      rescheduleReason: reqBodyWithLegacyProps.rescheduleReason,
    };
  } else {
    if (!reqBody.responses) {
      throw new Error("`responses` must not be nullish");
    }
    const responses = reqBody.responses;
    const { userFieldsResponses: calEventUserFieldsResponses, responses: calEventResponses } =
      getCalEventResponses({
        bookingFields: eventType.bookingFields,
        responses,
      });
    return {
      ...reqBody,
      name: responses.name,
      email: responses.email,
      guests: responses.guests ? responses.guests : [],
      location: responses.location?.optionValue || responses.location?.value || "",
      smsReminderNumber: responses.smsReminderNumber,
      notes: responses.notes || "",
      calEventUserFieldsResponses,
      rescheduleReason: responses.rescheduleReason,
      calEventResponses,
    };
  }
}

function getCustomInputsResponses(
  reqBody: {
    responses?: Record<string, object>;
    customInputs?: z.infer<typeof bookingCreateSchemaLegacyPropsForApi>["customInputs"];
  },
  eventTypeCustomInputs: Awaited<ReturnType<typeof getEventTypesFromDB>>["customInputs"]
) {
  const customInputsResponses = {} as NonNullable<CalendarEvent["customInputs"]>;
  if ("customInputs" in reqBody) {
    const reqCustomInputsResponses = reqBody.customInputs || [];
    if (reqCustomInputsResponses?.length > 0) {
      reqCustomInputsResponses.forEach(({ label, value }) => {
        customInputsResponses[label] = value;
      });
    }
  } else {
    const responses = reqBody.responses || {};
    // Backward Compatibility: Map new `responses` to old `customInputs` format so that webhooks can still receive same values.
    for (const [fieldName, fieldValue] of Object.entries(responses)) {
      const foundACustomInputForTheResponse = eventTypeCustomInputs.find(
        (input) => slugify(input.label) === fieldName
      );
      if (foundACustomInputForTheResponse) {
        customInputsResponses[foundACustomInputForTheResponse.label] = fieldValue;
      }
    }
  }

  return customInputsResponses;
}

async function handler(
  req: NextApiRequest & { userId?: number | undefined },
  {
    isNotAnApiCall = false,
  }: {
    isNotAnApiCall?: boolean;
  } = {
    isNotAnApiCall: false,
  }
) {
  const { userId } = req;

  // handle dynamic user
  let eventType =
    !req.body.eventTypeId && !!req.body.eventTypeSlug
      ? getDefaultEvent(req.body.eventTypeSlug)
      : await getEventTypesFromDB(req.body.eventTypeId);

  eventType = {
    ...eventType,
    bookingFields: getBookingFieldsWithSystemFields(eventType),
  };
  const {
    recurringCount,
    allRecurringDates,
    currentRecurringIndex,
    noEmail,
    eventTypeId,
    eventTypeSlug,
    hasHashedBookingLink,
    language,
    appsStatus: reqAppsStatus,
    name: bookerName,
    email: bookerEmail,
    guests: reqGuests,
    location,
    notes: additionalNotes,
    smsReminderNumber,
    rescheduleReason,
    ...reqBody
  } = getBookingData({
    req,
    isNotAnApiCall,
    eventType,
  });

  const tAttendees = await getTranslation(language ?? "en", "common");
  const tGuests = await getTranslation("en", "common");
  log.debug(`Booking eventType ${eventTypeId} started`);
  const dynamicUserList = Array.isArray(reqBody.user)
    ? getGroupName(reqBody.user)
    : getUsernameList(reqBody.user);
  if (!eventType) throw new HttpError({ statusCode: 404, message: "eventType.notFound" });

  const isTeamEventType =
    eventType.schedulingType === SchedulingType.COLLECTIVE ||
    eventType.schedulingType === SchedulingType.ROUND_ROBIN;

  const paymentAppData = getPaymentAppData(eventType);

  let timeOutOfBounds = false;
  try {
    timeOutOfBounds = isOutOfBounds(reqBody.start, {
      periodType: eventType.periodType,
      periodDays: eventType.periodDays,
      periodEndDate: eventType.periodEndDate,
      periodStartDate: eventType.periodStartDate,
      periodCountCalendarDays: eventType.periodCountCalendarDays,
    });
  } catch (error) {
    log.warn({
      message: "NewBooking: Unable set timeOutOfBounds. Using false. ",
    });
    if (error instanceof BookingDateInPastError) {
      // TODO: HttpError should not bleed through to the console.
      log.info(`Booking eventType ${eventTypeId} failed`, error);
      throw new HttpError({ statusCode: 400, message: error.message });
    }
  }

  if (timeOutOfBounds) {
    const error = {
      errorCode: "BookingTimeOutOfBounds",
      message: `EventType '${eventType.eventName}' cannot be booked at this time.`,
    };
    log.warn({
      message: `NewBooking: EventType '${eventType.eventName}' cannot be booked at this time.`,
    });
    throw new HttpError({ statusCode: 400, message: error.message });
  }

  const loadUsers = async () =>
    !eventTypeId
      ? await prisma.user.findMany({
          where: {
            username: {
              in: dynamicUserList,
            },
          },
          select: {
            ...userSelect.select,
            credentials: true, // Don't leak to client
            metadata: true,
            organization: {
              select: {
                slug: true,
              },
            },
          },
        })
      : eventType.hosts?.length
      ? eventType.hosts.map(({ user, isFixed }) => ({
          ...user,
          isFixed,
        }))
      : eventType.users || [];
  // loadUsers allows type inferring
  let users: (Awaited<ReturnType<typeof loadUsers>>[number] & {
    isFixed?: boolean;
    metadata?: Prisma.JsonValue;
  })[] = await loadUsers();

  const isDynamicAllowed = !users.some((user) => !user.allowDynamicBooking);
  if (!isDynamicAllowed && !eventTypeId) {
    log.warn({ message: "NewBooking: Some of the users in this group do not allow dynamic booking" });
    throw new HttpError({
      message: "Some of the users in this group do not allow dynamic booking",
      statusCode: 400,
    });
  }

  // If this event was pre-relationship migration
  // TODO: Establish whether this is dead code.
  if (!users.length && eventType.userId) {
    const eventTypeUser = await prisma.user.findUnique({
      where: {
        id: eventType.userId,
      },
      select: {
        credentials: true, // Don't leak to client
        ...userSelect.select,
      },
    });
    if (!eventTypeUser) {
      log.warn({ message: "NewBooking: eventTypeUser.notFound" });
      throw new HttpError({ statusCode: 404, message: "eventTypeUser.notFound" });
    }
    users.push(eventTypeUser);
  }

  if (!users) throw new HttpError({ statusCode: 404, message: "eventTypeUser.notFound" });

  users = users.map((user) => ({
    ...user,
    isFixed:
      user.isFixed === false
        ? false
        : user.isFixed || eventType.schedulingType !== SchedulingType.ROUND_ROBIN,
  }));

  let locationBodyString = location;

  // TODO: It's definition should be moved to getLocationValueForDb
  let organizerOrFirstDynamicGroupMemberDefaultLocationUrl = undefined;

  if (dynamicUserList.length > 1) {
    users = users.sort((a, b) => {
      const aIndex = (a.username && dynamicUserList.indexOf(a.username)) || 0;
      const bIndex = (b.username && dynamicUserList.indexOf(b.username)) || 0;
      return aIndex - bIndex;
    });
    const firstUsersMetadata = userMetadataSchema.parse(users[0].metadata);
    locationBodyString = firstUsersMetadata?.defaultConferencingApp?.appLink || locationBodyString;
    organizerOrFirstDynamicGroupMemberDefaultLocationUrl =
      firstUsersMetadata?.defaultConferencingApp?.appLink;
  }

  if (
    Object.prototype.hasOwnProperty.call(eventType, "bookingLimits") ||
    Object.prototype.hasOwnProperty.call(eventType, "durationLimits")
  ) {
    const startAsDate = dayjs(reqBody.start).toDate();
    if (eventType.bookingLimits) {
      await checkBookingLimits(eventType.bookingLimits as IntervalLimit, startAsDate, eventType.id);
    }
    if (eventType.durationLimits) {
      await checkDurationLimits(eventType.durationLimits as IntervalLimit, startAsDate, eventType.id);
    }
  }

  if (!eventType.seatsPerTimeSlot) {
    const availableUsers = await ensureAvailableUsers(
      {
        ...eventType,
        users: users as IsFixedAwareUser[],
        ...(eventType.recurringEvent && {
          recurringEvent: {
            ...eventType.recurringEvent,
            count: recurringCount || eventType.recurringEvent.count,
          },
        }),
      },
      {
        dateFrom: reqBody.start,
        dateTo: reqBody.end,
        timeZone: reqBody.timeZone,
      },
      {
        allRecurringDates,
        currentRecurringIndex,
      }
    );

    const luckyUsers: typeof users = [];
    const luckyUserPool = availableUsers.filter((user) => !user.isFixed);
    // loop through all non-fixed hosts and get the lucky users
    while (luckyUserPool.length > 0 && luckyUsers.length < 1 /* TODO: Add variable */) {
      const newLuckyUser = await getLuckyUser("MAXIMIZE_AVAILABILITY", {
        // find a lucky user that is not already in the luckyUsers array
        availableUsers: luckyUserPool.filter(
          (user) => !luckyUsers.find((existing) => existing.id === user.id)
        ),
        eventTypeId: eventType.id,
      });
      if (!newLuckyUser) {
        break; // prevent infinite loop
      }
      luckyUsers.push(newLuckyUser);
    }
    // ALL fixed users must be available
    if (
      availableUsers.filter((user) => user.isFixed).length !== users.filter((user) => user.isFixed).length
    ) {
      throw new Error("Some users are unavailable for booking.");
    }
    // Pushing fixed user before the luckyUser guarantees the (first) fixed user as the organizer.
    users = [...availableUsers.filter((user) => user.isFixed), ...luckyUsers];
  }

  const [organizerUser] = users;
  const tOrganizer = await getTranslation(organizerUser?.locale ?? "en", "common");

  // use host default
  if (isTeamEventType && locationBodyString === OrganizerDefaultConferencingAppType) {
    const metadataParseResult = userMetadataSchema.safeParse(organizerUser.metadata);
    const organizerMetadata = metadataParseResult.success ? metadataParseResult.data : undefined;
    if (organizerMetadata) {
      const app = getAppFromSlug(organizerMetadata?.defaultConferencingApp?.appSlug);
      locationBodyString = app?.appData?.location?.type || locationBodyString;
      organizerOrFirstDynamicGroupMemberDefaultLocationUrl =
        organizerMetadata?.defaultConferencingApp?.appLink;
    } else {
      locationBodyString = "";
    }
  }

  const invitee = [
    {
      email: bookerEmail,
      name: bookerName,
      timeZone: reqBody.timeZone,
      language: { translate: tAttendees, locale: language ?? "en" },
    },
  ];

  const guests = (reqGuests || []).reduce((guestArray, guest) => {
    // If it's a team event, remove the team member from guests
    if (isTeamEventType && users.some((user) => user.email === guest)) {
      return guestArray;
    }
    guestArray.push({
      email: guest,
      name: "",
      timeZone: reqBody.timeZone,
      language: { translate: tGuests, locale: "en" },
    });
    return guestArray;
  }, [] as typeof invitee);

  const seed = `${organizerUser.username}:${dayjs(reqBody.start).utc().format()}:${new Date().getTime()}`;
  const uid = translator.fromUUID(uuidv5(seed, uuidv5.URL));

  // For static link based video apps, it would have the static URL value instead of it's type(e.g. integrations:campfire_video)
  // This ensures that createMeeting isn't called for static video apps as bookingLocation becomes just a regular value for them.
  const bookingLocation = organizerOrFirstDynamicGroupMemberDefaultLocationUrl
    ? organizerOrFirstDynamicGroupMemberDefaultLocationUrl
    : getLocationValueForDB(locationBodyString, eventType.locations);

  const customInputs = getCustomInputsResponses(reqBody, eventType.customInputs);
  const teamMemberPromises =
    users.length > 1
      ? users.slice(1).map(async function (user) {
          return {
            email: user.email || "",
            name: user.name || "",
            timeZone: user.timeZone,
            language: {
              translate: await getTranslation(user.locale ?? "en", "common"),
              locale: user.locale ?? "en",
            },
          };
        })
      : [];

  const teamMembers = await Promise.all(teamMemberPromises);

  const attendeesList = [...invitee, ...guests];

  const responses = "responses" in reqBody ? reqBody.responses : null;

  const eventNameObject = {
    //TODO: Can we have an unnamed attendee? If not, I would really like to throw an error here.
    attendeeName: bookerName || "Nameless",
    eventType: eventType.title,
    eventName: eventType.eventName,
    // TODO: Can we have an unnamed organizer? If not, I would really like to throw an error here.
    host: organizerUser.name || "Nameless",
    location: bookingLocation,
    bookingFields: { ...responses },
    t: tOrganizer,
  };

  let requiresConfirmation = eventType?.requiresConfirmation;
  const rcThreshold = eventType?.metadata?.requiresConfirmationThreshold;
  if (rcThreshold) {
    if (dayjs(dayjs(reqBody.start).utc().format()).diff(dayjs(), rcThreshold.unit) > rcThreshold.time) {
      requiresConfirmation = false;
    }
  }

  const calEventUserFieldsResponses =
    "calEventUserFieldsResponses" in reqBody ? reqBody.calEventUserFieldsResponses : null;

  let evt: CalendarEvent = {
    type: eventType.title,
    title: getEventName(eventNameObject), //this needs to be either forced in english, or fetched for each attendee and organizer separately
    description: eventType.description,
    additionalNotes,
    customInputs,
    startTime: dayjs(reqBody.start).utc().format(),
    endTime: dayjs(reqBody.end).utc().format(),
    organizer: {
      id: organizerUser.id,
      name: organizerUser.name || "Nameless",
      email: organizerUser.email || "Email-less",
      username: organizerUser.username || undefined,
      timeZone: organizerUser.timeZone,
      language: { translate: tOrganizer, locale: organizerUser.locale ?? "en" },
      timeFormat: organizerUser.timeFormat === 24 ? TimeFormat.TWENTY_FOUR_HOUR : TimeFormat.TWELVE_HOUR,
    },
    responses: "calEventResponses" in reqBody ? reqBody.calEventResponses : null,
    userFieldsResponses: calEventUserFieldsResponses,
    attendees: attendeesList,
    location: bookingLocation, // Will be processed by the EventManager later.
    /** For team events & dynamic collective events, we will need to handle each member destinationCalendar eventually */
    destinationCalendar: eventType.destinationCalendar || organizerUser.destinationCalendar,
    hideCalendarNotes: eventType.hideCalendarNotes,
    requiresConfirmation: requiresConfirmation ?? false,
    eventTypeId: eventType.id,
    // if seats are not enabled we should default true
    seatsShowAttendees: eventType.seatsPerTimeSlot ? eventType.seatsShowAttendees : true,
    seatsPerTimeSlot: eventType.seatsPerTimeSlot,
  };

  let rescheduleUid = reqBody.rescheduleUid;
  let bookingSeat: Prisma.BookingSeatGetPayload<{ include: { booking: true; attendee: true } }> | null = null;
  type BookingType = Prisma.PromiseReturnType<typeof getOriginalRescheduledBooking>;
  let originalRescheduledBooking: BookingType = null;

  if (rescheduleUid) {
    // rescheduleUid can be bookingUid and bookingSeatUid
    bookingSeat = await prisma.bookingSeat.findUnique({
      where: {
        referenceUid: rescheduleUid,
      },
      include: {
        booking: true,
        attendee: true,
      },
    });
    if (bookingSeat) {
      rescheduleUid = bookingSeat.booking.uid;
    }
    originalRescheduledBooking = await getOriginalRescheduledBooking(
      rescheduleUid,
      !!eventType.seatsPerTimeSlot
    );
    if (!originalRescheduledBooking) {
      throw new HttpError({ statusCode: 404, message: "Could not find original booking" });
    }
  }

  /* Used for seats bookings to update evt object with video data */
  const addVideoCallDataToEvt = (bookingReferences: BookingReference[]) => {
    const videoCallReference = bookingReferences.find((reference) => reference.type.includes("_video"));

    if (videoCallReference) {
      evt.videoCallData = {
        type: videoCallReference.type,
        id: videoCallReference.meetingId,
        password: videoCallReference?.meetingPassword,
        url: videoCallReference.meetingUrl,
      };
    }
  };

  /* Check if the original booking has no more attendees, if so delete the booking
  and any calendar or video integrations */
  const lastAttendeeDeleteBooking = async (
    originalRescheduledBooking: Awaited<ReturnType<typeof getOriginalRescheduledBooking>>,
    filteredAttendees: Partial<Attendee>[],
    originalBookingEvt?: CalendarEvent
  ) => {
    let deletedReferences = false;
    if (filteredAttendees && filteredAttendees.length === 0 && originalRescheduledBooking) {
      const integrationsToDelete = [];

      for (const reference of originalRescheduledBooking.references) {
        if (reference.credentialId) {
          const credential = await prisma.credential.findUnique({
            where: {
              id: reference.credentialId,
            },
          });

          if (credential) {
            if (reference.type.includes("_video")) {
              integrationsToDelete.push(deleteMeeting(credential, reference.uid));
            }
            if (reference.type.includes("_calendar") && originalBookingEvt) {
              const calendar = await getCalendar(credential);
              if (calendar) {
                integrationsToDelete.push(
                  calendar?.deleteEvent(reference.uid, originalBookingEvt, reference.externalCalendarId)
                );
              }
            }
          }
        }
      }

      await Promise.all(integrationsToDelete).then(async () => {
        await prisma.booking.update({
          where: {
            id: originalRescheduledBooking.id,
          },
          data: {
            status: BookingStatus.CANCELLED,
          },
        });
      });
      deletedReferences = true;
    }
    return deletedReferences;
  };

  const handleSeats = async () => {
    let resultBooking:
      | (Partial<Booking> & {
          appsStatus?: AppsStatus[];
          seatReferenceUid?: string;
          paymentUid?: string;
          message?: string;
        })
      | null = null;
    const booking = await prisma.booking.findFirst({
      where: {
        OR: [
          {
            uid: rescheduleUid || reqBody.bookingUid,
          },
          {
            eventTypeId: eventType.id,
            startTime: evt.startTime,
          },
        ],
      },
      select: {
        uid: true,
        id: true,
        attendees: { include: { bookingSeat: true } },
        userId: true,
        references: true,
        startTime: true,
        user: true,
        status: true,
      },
    });

    if (!booking) {
      throw new HttpError({ statusCode: 404, message: "Could not find booking" });
    }

    // See if attendee is already signed up for timeslot
    if (
      booking.attendees.find((attendee) => attendee.email === invitee[0].email) &&
      dayjs.utc(booking.startTime).format() === evt.startTime
    ) {
      throw new HttpError({ statusCode: 409, message: "Already signed up for this booking." });
    }

    // There are two paths here, reschedule a booking with seats and booking seats without reschedule
    if (rescheduleUid) {
      // See if the new date has a booking already
      const newTimeSlotBooking = await prisma.booking.findFirst({
        where: {
          startTime: evt.startTime,
          eventTypeId: eventType.id,
        },
        select: {
          id: true,
          uid: true,
          attendees: {
            include: {
              bookingSeat: true,
            },
          },
        },
      });

      const credentials = await refreshCredentials(organizerUser.credentials);
      const eventManager = new EventManager({ ...organizerUser, credentials });

      if (!originalRescheduledBooking) {
        // typescript isn't smart enough;
        throw new Error("Internal Error.");
      }

      const updatedBookingAttendees = originalRescheduledBooking.attendees.reduce(
        (filteredAttendees, attendee) => {
          if (attendee.email === bookerEmail) {
            return filteredAttendees; // skip current booker, as we know the language already.
          }
          filteredAttendees.push({
            name: attendee.name,
            email: attendee.email,
            timeZone: attendee.timeZone,
            language: { translate: tAttendees, locale: attendee.locale ?? "en" },
          });
          return filteredAttendees;
        },
        [] as Person[]
      );

      // If original booking has video reference we need to add the videoCallData to the new evt
      const videoReference = originalRescheduledBooking.references.find((reference) =>
        reference.type.includes("_video")
      );

      const originalBookingEvt = {
        ...evt,
        title: originalRescheduledBooking.title,
        startTime: dayjs(originalRescheduledBooking.startTime).utc().format(),
        endTime: dayjs(originalRescheduledBooking.endTime).utc().format(),
        attendees: updatedBookingAttendees,
        // If the location is a video integration then include the videoCallData
        ...(videoReference && {
          videoCallData: {
            type: videoReference.type,
            id: videoReference.meetingId,
            password: videoReference.meetingPassword,
            url: videoReference.meetingUrl,
          },
        }),
      };

      if (!bookingSeat) {
        // if no bookingSeat is given and the userId != owner, 401.
        // TODO: Next step; Evaluate ownership, what about teams?
        if (booking.user?.id !== req.userId) {
          throw new HttpError({ statusCode: 401 });
        }

        // Moving forward in this block is the owner making changes to the booking. All attendees should be affected
        evt.attendees = originalRescheduledBooking.attendees.map((attendee) => {
          return {
            name: attendee.name,
            email: attendee.email,
            timeZone: attendee.timeZone,
            language: { translate: tAttendees, locale: attendee.locale ?? "en" },
          };
        });

        // If owner reschedules the event we want to update the entire booking
        // Also if owner is rescheduling there should be no bookingSeat

        // If there is no booking during the new time slot then update the current booking to the new date
        if (!newTimeSlotBooking) {
          const newBooking: (Booking & { appsStatus?: AppsStatus[] }) | null = await prisma.booking.update({
            where: {
              id: booking.id,
            },
            data: {
              startTime: evt.startTime,
              cancellationReason: rescheduleReason,
            },
            include: {
              user: true,
              references: true,
              payment: true,
              attendees: true,
            },
          });

          addVideoCallDataToEvt(newBooking.references);

          const copyEvent = cloneDeep(evt);

          const updateManager = await eventManager.reschedule(copyEvent, rescheduleUid, newBooking.id);

          // @NOTE: This code is duplicated and should be moved to a function
          // This gets overridden when updating the event - to check if notes have been hidden or not. We just reset this back
          // to the default description when we are sending the emails.
          evt.description = eventType.description;

          const results = updateManager.results;

          const calendarResult = results.find((result) => result.type.includes("_calendar"));

          evt.iCalUID = calendarResult.updatedEvent.iCalUID || undefined;

          if (results.length > 0 && results.some((res) => !res.success)) {
            const error = {
              errorCode: "BookingReschedulingMeetingFailed",
              message: "Booking Rescheduling failed",
            };
            log.error(`Booking ${organizerUser.name} failed`, error, results);
          } else {
            const metadata: AdditionalInformation = {};
            if (results.length) {
              // TODO: Handle created event metadata more elegantly
              const [updatedEvent] = Array.isArray(results[0].updatedEvent)
                ? results[0].updatedEvent
                : [results[0].updatedEvent];
              if (updatedEvent) {
                metadata.hangoutLink = updatedEvent.hangoutLink;
                metadata.conferenceData = updatedEvent.conferenceData;
                metadata.entryPoints = updatedEvent.entryPoints;
                handleAppsStatus(results, newBooking);
              }
            }
          }

          if (noEmail !== true) {
            const copyEvent = cloneDeep(evt);
            await sendRescheduledEmails({
              ...copyEvent,
              additionalNotes, // Resets back to the additionalNote input and not the override value
              cancellationReason: "$RCH$" + (rescheduleReason ? rescheduleReason : ""), // Removable code prefix to differentiate cancellation from rescheduling for email
            });
          }
          const foundBooking = await findBookingQuery(newBooking.id);

          resultBooking = { ...foundBooking, appsStatus: newBooking.appsStatus };
        } else {
          // Merge two bookings together
          const attendeesToMove = [],
            attendeesToDelete = [];

          for (const attendee of booking.attendees) {
            // If the attendee already exists on the new booking then delete the attendee record of the old booking
            if (
              newTimeSlotBooking.attendees.some(
                (newBookingAttendee) => newBookingAttendee.email === attendee.email
              )
            ) {
              attendeesToDelete.push(attendee.id);
              // If the attendee does not exist on the new booking then move that attendee record to the new booking
            } else {
              attendeesToMove.push({ id: attendee.id, seatReferenceId: attendee.bookingSeat?.id });
            }
          }

          // Confirm that the new event will have enough available seats
          if (
            !eventType.seatsPerTimeSlot ||
            attendeesToMove.length +
              newTimeSlotBooking.attendees.filter((attendee) => attendee.bookingSeat).length >
              eventType.seatsPerTimeSlot
          ) {
            throw new HttpError({ statusCode: 409, message: "Booking does not have enough available seats" });
          }

          const moveAttendeeCalls = [];
          for (const attendeeToMove of attendeesToMove) {
            moveAttendeeCalls.push(
              prisma.attendee.update({
                where: {
                  id: attendeeToMove.id,
                },
                data: {
                  bookingId: newTimeSlotBooking.id,
                  bookingSeat: {
                    upsert: {
                      create: {
                        referenceUid: uuid(),
                        bookingId: newTimeSlotBooking.id,
                      },
                      update: {
                        bookingId: newTimeSlotBooking.id,
                      },
                    },
                  },
                },
              })
            );
          }

          await Promise.all([
            ...moveAttendeeCalls,
            // Delete any attendees that are already a part of that new time slot booking
            prisma.attendee.deleteMany({
              where: {
                id: {
                  in: attendeesToDelete,
                },
              },
            }),
          ]);

          const updatedNewBooking = await prisma.booking.findUnique({
            where: {
              id: newTimeSlotBooking.id,
            },
            include: {
              attendees: true,
              references: true,
            },
          });

          if (!updatedNewBooking) {
            throw new HttpError({ statusCode: 404, message: "Updated booking not found" });
          }

          // Update the evt object with the new attendees
          const updatedBookingAttendees = updatedNewBooking.attendees.map((attendee) => {
            const evtAttendee = {
              ...attendee,
              language: { translate: tAttendees, locale: language ?? "en" },
            };
            return evtAttendee;
          });

          evt.attendees = updatedBookingAttendees;

          addVideoCallDataToEvt(updatedNewBooking.references);

          const copyEvent = cloneDeep(evt);

          const updateManager = await eventManager.reschedule(
            copyEvent,
            rescheduleUid,
            newTimeSlotBooking.id
          );

          const results = updateManager.results;

          const calendarResult = results.find((result) => result.type.includes("_calendar"));

          evt.iCalUID = Array.isArray(calendarResult?.updatedEvent)
            ? calendarResult?.updatedEvent[0]?.iCalUID
            : calendarResult?.updatedEvent?.iCalUID || undefined;

          // TODO send reschedule emails to attendees of the old booking
          await sendRescheduledEmails({
            ...copyEvent,
            additionalNotes, // Resets back to the additionalNote input and not the override value
            cancellationReason: "$RCH$" + (rescheduleReason ? rescheduleReason : ""), // Removable code prefix to differentiate cancellation from rescheduling for email
          });

          // Update the old booking with the cancelled status
          await prisma.booking.update({
            where: {
              id: booking.id,
            },
            data: {
              status: BookingStatus.CANCELLED,
            },
          });

          const foundBooking = await findBookingQuery(newTimeSlotBooking.id);

          resultBooking = { ...foundBooking };
        }
      }

      // seatAttendee is null when the organizer is rescheduling.
      const seatAttendee: Partial<Person> | null = bookingSeat?.attendee || null;
      if (seatAttendee) {
        seatAttendee["language"] = { translate: tAttendees, locale: bookingSeat?.attendee.locale ?? "en" };
      }
      // If there is no booking then remove the attendee from the old booking and create a new one
      if (!newTimeSlotBooking) {
        await prisma.attendee.delete({
          where: {
            id: seatAttendee?.id,
          },
        });

        // Update the original calendar event by removing the attendee that is rescheduling
        if (originalBookingEvt && originalRescheduledBooking) {
          // Event would probably be deleted so we first check than instead of updating references
          const filteredAttendees = originalRescheduledBooking?.attendees.filter((attendee) => {
            return attendee.email !== bookerEmail;
          });
          const deletedReference = await lastAttendeeDeleteBooking(
            originalRescheduledBooking,
            filteredAttendees,
            originalBookingEvt
          );

          if (!deletedReference) {
            await eventManager.updateCalendarAttendees(originalBookingEvt, originalRescheduledBooking);
          }
        }

        // We don't want to trigger rescheduling logic of the original booking
        originalRescheduledBooking = null;

        return null;
      }

      // Need to change the new seat reference and attendee record to remove it from the old booking and add it to the new booking
      // https://stackoverflow.com/questions/4980963/database-insert-new-rows-or-update-existing-ones
      if (seatAttendee?.id && bookingSeat?.id) {
        await Promise.all([
          await prisma.attendee.update({
            where: {
              id: seatAttendee.id,
            },
            data: {
              bookingId: newTimeSlotBooking.id,
            },
          }),
          await prisma.bookingSeat.update({
            where: {
              id: bookingSeat.id,
            },
            data: {
              bookingId: newTimeSlotBooking.id,
            },
          }),
        ]);
      }

      const copyEvent = cloneDeep(evt);

      const updateManager = await eventManager.reschedule(copyEvent, rescheduleUid, newTimeSlotBooking.id);

      const results = updateManager.results;

      const calendarResult = results.find((result) => result.type.includes("_calendar"));

      evt.iCalUID = Array.isArray(calendarResult?.updatedEvent)
        ? calendarResult?.updatedEvent[0]?.iCalUID
        : calendarResult?.updatedEvent?.iCalUID || undefined;

      await sendRescheduledSeatEmail(copyEvent, seatAttendee as Person);
      const filteredAttendees = originalRescheduledBooking?.attendees.filter((attendee) => {
        return attendee.email !== bookerEmail;
      });
      await lastAttendeeDeleteBooking(originalRescheduledBooking, filteredAttendees, originalBookingEvt);

      const foundBooking = await findBookingQuery(newTimeSlotBooking.id);

      resultBooking = { ...foundBooking, seatReferenceUid: bookingSeat?.referenceUid };
    } else {
      // Need to add translation for attendees to pass type checks. Since these values are never written to the db we can just use the new attendee language
      const bookingAttendees = booking.attendees.map((attendee) => {
        return { ...attendee, language: { translate: tAttendees, locale: language ?? "en" } };
      });

      evt = { ...evt, attendees: [...bookingAttendees, invitee[0]] };

      if (eventType.seatsPerTimeSlot && eventType.seatsPerTimeSlot <= booking.attendees.length) {
        throw new HttpError({ statusCode: 409, message: "Booking seats are full" });
      }

      const videoCallReference = booking.references.find((reference) => reference.type.includes("_video"));

      if (videoCallReference) {
        evt.videoCallData = {
          type: videoCallReference.type,
          id: videoCallReference.meetingId,
          password: videoCallReference?.meetingPassword,
          url: videoCallReference.meetingUrl,
        };
      }

      const attendeeUniqueId = uuid();

      await prisma.booking.update({
        where: {
          uid: reqBody.bookingUid,
        },
        include: {
          attendees: true,
        },
        data: {
          attendees: {
            create: {
              email: invitee[0].email,
              name: invitee[0].name,
              timeZone: invitee[0].timeZone,
              locale: invitee[0].language.locale,
              bookingSeat: {
                create: {
                  referenceUid: attendeeUniqueId,
                  data: {
                    description: additionalNotes,
                  },
                  booking: {
                    connect: {
                      id: booking.id,
                    },
                  },
                },
              },
            },
          },
          ...(booking.status === BookingStatus.CANCELLED && { status: BookingStatus.ACCEPTED }),
        },
      });

      evt.attendeeSeatId = attendeeUniqueId;

      const newSeat = booking.attendees.length !== 0;

      /**
       * Remember objects are passed into functions as references
       * so if you modify it in a inner function it will be modified in the outer function
       * deep cloning evt to avoid this
       */
      if (!evt?.uid) {
        evt.uid = booking?.uid ?? null;
      }
      const copyEvent = cloneDeep(evt);
      copyEvent.uid = booking.uid;
      await sendScheduledSeatsEmails(copyEvent, invitee[0], newSeat, !!eventType.seatsShowAttendees);

      const credentials = await refreshCredentials(organizerUser.credentials);
      const eventManager = new EventManager({ ...organizerUser, credentials });
      await eventManager.updateCalendarAttendees(evt, booking);

      const foundBooking = await findBookingQuery(booking.id);

      if (!Number.isNaN(paymentAppData.price) && paymentAppData.price > 0 && !!booking) {
        const credentialPaymentAppCategories = await prisma.credential.findMany({
          where: {
            userId: organizerUser.id,
            app: {
              categories: {
                hasSome: ["payment"],
              },
            },
          },
          select: {
            key: true,
            appId: true,
            app: {
              select: {
                categories: true,
                dirName: true,
              },
            },
          },
        });

        const eventTypePaymentAppCredential = credentialPaymentAppCategories.find((credential) => {
          return credential.appId === paymentAppData.appId;
        });

        if (!eventTypePaymentAppCredential) {
          throw new HttpError({ statusCode: 400, message: "Missing payment credentials" });
        }
        if (!eventTypePaymentAppCredential?.appId) {
          throw new HttpError({ statusCode: 400, message: "Missing payment app id" });
        }

        const payment = await handlePayment(
          evt,
          eventType,
          eventTypePaymentAppCredential as IEventTypePaymentCredentialType,
          booking,
          bookerEmail
        );

        resultBooking = { ...foundBooking };
        resultBooking["message"] = "Payment required";
        resultBooking["paymentUid"] = payment?.uid;
      }

      resultBooking = { ...foundBooking, seatReferenceUid: evt.attendeeSeatId };
    }

    // Here we should handle every after action that needs to be done after booking creation

    // Obtain event metadata that includes videoCallUrl
    const metadata = evt.videoCallData?.url ? { videoCallUrl: evt.videoCallData.url } : undefined;
    try {
      await scheduleWorkflowReminders({
        workflows: eventType.workflows,
        smsReminderNumber: smsReminderNumber || null,
        calendarEvent: { ...evt, ...{ metadata, eventType: { slug: eventType.slug } } },
        requiresConfirmation: evt.requiresConfirmation || false,
        isRescheduleEvent: !!rescheduleUid,
        isFirstRecurringEvent: true,
        emailAttendeeSendToOverride: bookerEmail,
      });
    } catch (error) {
      log.error("Error while scheduling workflow reminders", error);
    }

    return resultBooking;
  };
  // For seats, if the booking already exists then we want to add the new attendee to the existing booking
  if (eventType.seatsPerTimeSlot && (reqBody.bookingUid || rescheduleUid)) {
    const newBooking = await handleSeats();
    if (newBooking) {
      req.statusCode = 201;
      return newBooking;
    }
  }
  if (isTeamEventType) {
    evt.team = {
      members: teamMembers,
      name: eventType.team?.name || "Nameless",
    };
  }

  if (reqBody.recurringEventId && eventType.recurringEvent) {
    // Overriding the recurring event configuration count to be the actual number of events booked for
    // the recurring event (equal or less than recurring event configuration count)
    eventType.recurringEvent = Object.assign({}, eventType.recurringEvent, { count: recurringCount });
    evt.recurringEvent = eventType.recurringEvent;
  }

  // If the user is not the owner of the event, new booking should be always pending.
  // Otherwise, an owner rescheduling should be always accepted.
  // Before comparing make sure that userId is set, otherwise undefined === undefined
  const userReschedulingIsOwner = userId && originalRescheduledBooking?.user?.id === userId;
  const isConfirmedByDefault = (!requiresConfirmation && !paymentAppData.price) || userReschedulingIsOwner;

  async function createBooking() {
    if (originalRescheduledBooking) {
      evt.title = originalRescheduledBooking?.title || evt.title;
      evt.description = originalRescheduledBooking?.description || evt.description;
      evt.location = originalRescheduledBooking?.location || evt.location;
    }

    const eventTypeRel = !eventTypeId
      ? {}
      : {
          connect: {
            id: eventTypeId,
          },
        };

    const dynamicEventSlugRef = !eventTypeId ? eventTypeSlug : null;
    const dynamicGroupSlugRef = !eventTypeId ? (reqBody.user as string).toLowerCase() : null;

    // If the user is not the owner of the event, new booking should be always pending.
    // Otherwise, an owner rescheduling should be always accepted.
    // Before comparing make sure that userId is set, otherwise undefined === undefined
    const userReschedulingIsOwner = userId && originalRescheduledBooking?.user?.id === userId;
    const isConfirmedByDefault = (!requiresConfirmation && !paymentAppData.price) || userReschedulingIsOwner;

    const attendeesData = evt.attendees.map((attendee) => {
      //if attendee is team member, it should fetch their locale not booker's locale
      //perhaps make email fetch request to see if his locale is stored, else
      return {
        name: attendee.name,
        email: attendee.email,
        timeZone: attendee.timeZone,
        locale: attendee.language.locale,
      };
    });

    if (evt.team?.members) {
      attendeesData.push(
        ...evt.team.members.map((member) => ({
          email: member.email,
          name: member.name,
          timeZone: member.timeZone,
          locale: member.language.locale,
        }))
      );
    }

    const newBookingData: Prisma.BookingCreateInput = {
      uid,
      responses: responses === null ? Prisma.JsonNull : responses,
      title: evt.title,
      startTime: dayjs.utc(evt.startTime).toDate(),
      endTime: dayjs.utc(evt.endTime).toDate(),
      description: evt.additionalNotes,
      customInputs: isPrismaObjOrUndefined(evt.customInputs),
      status: isConfirmedByDefault ? BookingStatus.ACCEPTED : BookingStatus.PENDING,
      location: evt.location,
      eventType: eventTypeRel,
      smsReminderNumber,
      metadata: reqBody.metadata,
      attendees: {
        createMany: {
          data: attendeesData,
        },
      },
      dynamicEventSlugRef,
      dynamicGroupSlugRef,
      user: {
        connect: {
          id: organizerUser.id,
        },
      },
      destinationCalendar: evt.destinationCalendar
        ? {
            connect: { id: evt.destinationCalendar.id },
          }
        : undefined,
    };

    if (reqBody.recurringEventId) {
      newBookingData.recurringEventId = reqBody.recurringEventId;
    }
    if (originalRescheduledBooking) {
      newBookingData.metadata = {
        ...(typeof originalRescheduledBooking.metadata === "object" && originalRescheduledBooking.metadata),
      };
      newBookingData["paid"] = originalRescheduledBooking.paid;
      newBookingData["fromReschedule"] = originalRescheduledBooking.uid;
      if (originalRescheduledBooking.uid) {
        newBookingData.cancellationReason = rescheduleReason;
      }
      if (newBookingData.attendees?.createMany?.data) {
        // Reschedule logic with booking with seats
        if (eventType?.seatsPerTimeSlot && bookerEmail) {
          newBookingData.attendees.createMany.data = attendeesData.filter(
            (attendee) => attendee.email === bookerEmail
          );
        } else {
          newBookingData.attendees.createMany.data = originalRescheduledBooking.attendees;
        }
      }
      if (originalRescheduledBooking.recurringEventId) {
        newBookingData.recurringEventId = originalRescheduledBooking.recurringEventId;
      }
    }
    const createBookingObj = {
      include: {
        user: {
          select: { email: true, name: true, timeZone: true },
        },
        attendees: true,
        payment: true,
        references: true,
      },
      data: newBookingData,
    };

    if (originalRescheduledBooking?.paid && originalRescheduledBooking?.payment) {
      const bookingPayment = originalRescheduledBooking?.payment?.find((payment) => payment.success);

      if (bookingPayment) {
        createBookingObj.data.payment = {
          connect: { id: bookingPayment.id },
        };
      }
    }

    if (typeof paymentAppData.price === "number" && paymentAppData.price > 0) {
      /* Validate if there is any payment app credential for this user */
      await prisma.credential.findFirstOrThrow({
        where: {
          appId: paymentAppData.appId,
          userId: organizerUser.id,
        },
        select: {
          id: true,
        },
      });
    }

    return prisma.booking.create(createBookingObj);
  }

  let results: EventResult<AdditionalInformation & { url?: string; iCalUID?: string }>[] = [];
  let referencesToCreate: PartialReference[] = [];

  type Booking = Prisma.PromiseReturnType<typeof createBooking>;
  let booking: (Booking & { appsStatus?: AppsStatus[] }) | null = null;
  try {
    booking = await createBooking();

    // @NOTE: Add specific try catch for all subsequent async calls to avoid error
    // Sync Services
    await syncServicesUpdateWebUser(
      await prisma.user.findFirst({
        where: { id: userId },
        select: { id: true, email: true, name: true, username: true, createdDate: true },
      })
    );
    evt.uid = booking?.uid ?? null;

    if (booking && booking.id && eventType.seatsPerTimeSlot) {
      const currentAttendee = booking.attendees.find(
        (attendee) => attendee.email === req.body.responses.email
      );

      // Save description to bookingSeat
      const uniqueAttendeeId = uuid();
      await prisma.bookingSeat.create({
        data: {
          referenceUid: uniqueAttendeeId,
          data: {
            description: evt.additionalNotes,
          },
          booking: {
            connect: {
              id: booking.id,
            },
          },
          attendee: {
            connect: {
              id: currentAttendee?.id,
            },
          },
        },
      });
      evt.attendeeSeatId = uniqueAttendeeId;
    }
  } catch (_err) {
    const err = getErrorFromUnknown(_err);
    log.error(`Booking ${eventTypeId} failed`, "Error when saving booking to db", err.message);
    if (err.code === "P2002") {
      throw new HttpError({ statusCode: 409, message: "booking.conflict" });
    }
    throw err;
  }

  // After polling videoBusyTimes, credentials might have been changed due to refreshment, so query them again.
  const credentials = await refreshCredentials(organizerUser.credentials);
  const eventManager = new EventManager({ ...organizerUser, credentials });

  function handleAppsStatus(
    results: EventResult<AdditionalInformation>[],
    booking: (Booking & { appsStatus?: AppsStatus[] }) | null
  ) {
    // Taking care of apps status
    const resultStatus: AppsStatus[] = results.map((app) => ({
      appName: app.appName,
      type: app.type,
      success: app.success ? 1 : 0,
      failures: !app.success ? 1 : 0,
      errors: app.calError ? [app.calError] : [],
      warnings: app.calWarnings,
    }));

    if (reqAppsStatus === undefined) {
      if (booking !== null) {
        booking.appsStatus = resultStatus;
      }
      evt.appsStatus = resultStatus;
      return;
    }
    // From down here we can assume reqAppsStatus is not undefined anymore
    // Other status exist, so this is the last booking of a series,
    // proceeding to prepare the info for the event
    const calcAppsStatus = reqAppsStatus.concat(resultStatus).reduce((prev, curr) => {
      if (prev[curr.type]) {
        prev[curr.type].success += curr.success;
        prev[curr.type].errors = prev[curr.type].errors.concat(curr.errors);
        prev[curr.type].warnings = prev[curr.type].warnings?.concat(curr.warnings || []);
      } else {
        prev[curr.type] = curr;
      }
      return prev;
    }, {} as { [key: string]: AppsStatus });
    evt.appsStatus = Object.values(calcAppsStatus);
  }

  let videoCallUrl;
  if (originalRescheduledBooking?.uid) {
    try {
      // cancel workflow reminders from previous rescheduled booking
      originalRescheduledBooking.workflowReminders.forEach((reminder) => {
        if (reminder.method === WorkflowMethods.EMAIL) {
          deleteScheduledEmailReminder(reminder.id, reminder.referenceId);
        } else if (reminder.method === WorkflowMethods.SMS) {
          deleteScheduledSMSReminder(reminder.id, reminder.referenceId);
        }
      });
    } catch (error) {
      log.error("Error while canceling scheduled workflow reminders", error);
    }

    // Use EventManager to conditionally use all needed integrations.
    addVideoCallDataToEvt(originalRescheduledBooking.references);
    const updateManager = await eventManager.reschedule(evt, originalRescheduledBooking.uid);

    //update original rescheduled booking (no seats event)
    if (!eventType.seatsPerTimeSlot) {
      await prisma.booking.update({
        where: {
          id: originalRescheduledBooking.id,
        },
        data: {
          status: BookingStatus.CANCELLED,
        },
      });
    }

    // This gets overridden when updating the event - to check if notes have been hidden or not. We just reset this back
    // to the default description when we are sending the emails.
    evt.description = eventType.description;

    results = updateManager.results;
    referencesToCreate = updateManager.referencesToCreate;
    if (results.length > 0 && results.some((res) => !res.success)) {
      const error = {
        errorCode: "BookingReschedulingMeetingFailed",
        message: "Booking Rescheduling failed",
      };

      log.error(`Booking ${organizerUser.name} failed`, error, results);
    } else {
      const metadata: AdditionalInformation = {};
      const calendarResult = results.find((result) => result.type.includes("_calendar"));

      evt.iCalUID = Array.isArray(calendarResult?.updatedEvent)
        ? calendarResult?.updatedEvent[0]?.iCalUID
        : calendarResult?.updatedEvent?.iCalUID || undefined;

      if (results.length) {
        // TODO: Handle created event metadata more elegantly
        const [updatedEvent] = Array.isArray(results[0].updatedEvent)
          ? results[0].updatedEvent
          : [results[0].updatedEvent];
        if (updatedEvent) {
          metadata.hangoutLink = updatedEvent.hangoutLink;
          metadata.conferenceData = updatedEvent.conferenceData;
          metadata.entryPoints = updatedEvent.entryPoints;
          handleAppsStatus(results, booking);
          videoCallUrl = metadata.hangoutLink || videoCallUrl || updatedEvent?.url;
        }
      }
      if (noEmail !== true) {
        const copyEvent = cloneDeep(evt);
        await sendRescheduledEmails({
          ...copyEvent,
          additionalInformation: metadata,
          additionalNotes, // Resets back to the additionalNote input and not the override value
          cancellationReason: "$RCH$" + (rescheduleReason ? rescheduleReason : ""), // Removable code prefix to differentiate cancellation from rescheduling for email
        });
      }
    }
    // If it's not a reschedule, doesn't require confirmation and there's no price,
    // Create a booking
  } else if (!requiresConfirmation && !paymentAppData.price) {
    // Use EventManager to conditionally use all needed integrations.
    const createManager = await eventManager.create(evt);

    // This gets overridden when creating the event - to check if notes have been hidden or not. We just reset this back
    // to the default description when we are sending the emails.
    evt.description = eventType.description;

    results = createManager.results;
    referencesToCreate = createManager.referencesToCreate;
    videoCallUrl = evt.videoCallData && evt.videoCallData.url ? evt.videoCallData.url : null;

    if (results.length > 0 && results.every((res) => !res.success)) {
      const error = {
        errorCode: "BookingCreatingMeetingFailed",
        message: "Booking failed",
      };

      log.error(`Booking ${organizerUser.username} failed`, error, results);
    } else {
      const metadata: AdditionalInformation = {};

      if (results.length) {
        // Handle Google Meet results
        // We use the original booking location since the evt location changes to daily
        if (bookingLocation === MeetLocationType) {
          const googleMeetResult = {
            appName: GoogleMeetMetadata.name,
            type: "conferencing",
            uid: results[0].uid,
            originalEvent: results[0].originalEvent,
          };

          // Find index of google_calendar inside createManager.referencesToCreate
          const googleCalIndex = createManager.referencesToCreate.findIndex(
            (ref) => ref.type === "google_calendar"
          );
          const googleCalResult = results[googleCalIndex];

          if (!googleCalResult) {
            results.push({
              ...googleMeetResult,
              success: false,
              calWarnings: [tOrganizer("google_meet_warning")],
            });
          }

          if (googleCalResult?.createdEvent?.hangoutLink) {
            results.push({
              ...googleMeetResult,
              success: true,
            });

            // Add google_meet to referencesToCreate in the same index as google_calendar
            createManager.referencesToCreate[googleCalIndex] = {
              ...createManager.referencesToCreate[googleCalIndex],
              meetingUrl: googleCalResult.createdEvent.hangoutLink,
            };

            // Also create a new referenceToCreate with type video for google_meet
            createManager.referencesToCreate.push({
              type: "google_meet_video",
              meetingUrl: googleCalResult.createdEvent.hangoutLink,
              uid: googleCalResult.uid,
              credentialId: createManager.referencesToCreate[googleCalIndex].credentialId,
            });
          } else if (googleCalResult && !googleCalResult.createdEvent?.hangoutLink) {
            results.push({
              ...googleMeetResult,
              success: false,
            });
          }
        }
        // TODO: Handle created event metadata more elegantly
        metadata.hangoutLink = results[0].createdEvent?.hangoutLink;
        metadata.conferenceData = results[0].createdEvent?.conferenceData;
        metadata.entryPoints = results[0].createdEvent?.entryPoints;
        handleAppsStatus(results, booking);
        videoCallUrl =
          metadata.hangoutLink || organizerOrFirstDynamicGroupMemberDefaultLocationUrl || videoCallUrl;
      }
      if (noEmail !== true) {
        let isHostConfirmationEmailsDisabled = false;
        let isAttendeeConfirmationEmailDisabled = false;

        const workflows = eventType.workflows.map((workflow) => workflow.workflow);

        if (eventType.workflows) {
          isHostConfirmationEmailsDisabled =
            eventType.metadata?.disableStandardEmails?.confirmation?.host || false;
          isAttendeeConfirmationEmailDisabled =
            eventType.metadata?.disableStandardEmails?.confirmation?.attendee || false;

          if (isHostConfirmationEmailsDisabled) {
            isHostConfirmationEmailsDisabled = allowDisablingHostConfirmationEmails(workflows);
          }

          if (isAttendeeConfirmationEmailDisabled) {
            isAttendeeConfirmationEmailDisabled = allowDisablingAttendeeConfirmationEmails(workflows);
          }
        }

        await sendScheduledEmails(
          {
            ...evt,
            additionalInformation: metadata,
            additionalNotes,
            customInputs,
          },
          eventNameObject,
          isHostConfirmationEmailsDisabled,
          isAttendeeConfirmationEmailDisabled
        );
      }
    }
  }

  const bookingRequiresPayment =
    !Number.isNaN(paymentAppData.price) &&
    paymentAppData.price > 0 &&
    !originalRescheduledBooking?.paid &&
    !!booking;

  if (!isConfirmedByDefault && noEmail !== true && !bookingRequiresPayment) {
    await sendOrganizerRequestEmail({ ...evt, additionalNotes });
    await sendAttendeeRequestEmail({ ...evt, additionalNotes }, attendeesList[0]);
  }

  if (bookingRequiresPayment) {
    // Load credentials.app.categories
    const credentialPaymentAppCategories = await prisma.credential.findMany({
      where: {
        userId: organizerUser.id,
        app: {
          categories: {
            hasSome: ["payment"],
          },
        },
      },
      select: {
        key: true,
        appId: true,
        app: {
          select: {
            categories: true,
            dirName: true,
          },
        },
      },
    });
    const eventTypePaymentAppCredential = credentialPaymentAppCategories.find((credential) => {
      return credential.appId === paymentAppData.appId;
    });

    if (!eventTypePaymentAppCredential) {
      throw new HttpError({ statusCode: 400, message: "Missing payment credentials" });
    }

    // Convert type of eventTypePaymentAppCredential to appId: EventTypeAppList
    if (!booking.user) booking.user = organizerUser;
    const payment = await handlePayment(
      evt,
      eventType,
      eventTypePaymentAppCredential as IEventTypePaymentCredentialType,
      booking,
      bookerEmail
    );

    req.statusCode = 201;
    return { ...booking, message: "Payment required", paymentUid: payment?.uid };
  }

  log.debug(`Booking ${organizerUser.username} completed`);

  if (booking.location?.startsWith("http")) {
    videoCallUrl = booking.location;
  }

  const metadata = videoCallUrl
    ? {
        videoCallUrl: getVideoCallUrlFromCalEvent(evt),
      }
    : undefined;

  const eventTypeInfo: EventTypeInfo = {
    eventTitle: eventType.title,
    eventDescription: eventType.description,
    requiresConfirmation: requiresConfirmation || null,
    price: paymentAppData.price,
    currency: eventType.currency,
    length: eventType.length,
  };
  const webhookData = {
    ...evt,
    ...eventTypeInfo,
    bookingId: booking?.id,
    rescheduleUid,
    rescheduleStartTime: originalRescheduledBooking?.startTime
      ? dayjs(originalRescheduledBooking?.startTime).utc().format()
      : undefined,
    rescheduleEndTime: originalRescheduledBooking?.endTime
      ? dayjs(originalRescheduledBooking?.endTime).utc().format()
      : undefined,
    metadata: { ...metadata, ...reqBody.metadata },
    eventTypeId,
    status: "ACCEPTED",
    smsReminderNumber: booking?.smsReminderNumber || undefined,
  };
  const subscriberOptions: GetSubscriberOptions = {
    userId: organizerUser.id,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
    teamId: eventType.team?.id,
  };

  if (isConfirmedByDefault) {
    const eventTrigger: WebhookTriggerEvents = rescheduleUid
      ? WebhookTriggerEvents.BOOKING_RESCHEDULED
      : WebhookTriggerEvents.BOOKING_CREATED;

    subscriberOptions.triggerEvent = eventTrigger;

    const subscriberOptionsMeetingEnded = {
      userId: organizerUser.id,
      eventTypeId,
      triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
      teamId: eventType.team?.id,
    };

    try {
      const subscribersMeetingEnded = await getWebhooks(subscriberOptionsMeetingEnded);

      subscribersMeetingEnded.forEach((subscriber) => {
        if (rescheduleUid && originalRescheduledBooking) {
          cancelScheduledJobs(originalRescheduledBooking, undefined, true);
        }
        if (booking && booking.status === BookingStatus.ACCEPTED) {
          scheduleTrigger(booking, subscriber.subscriberUrl, subscriber);
        }
      });
    } catch (error) {
      log.error("Error while running scheduledJobs for booking", error);
    }

    // Send Webhook call if hooked to BOOKING_CREATED & BOOKING_RESCHEDULED
    await handleWebhookTrigger({ subscriberOptions, eventTrigger, webhookData });
  } else if (eventType.requiresConfirmation) {
    // if eventType requires confirmation we will trigger the BOOKING REQUESTED Webhook
    const eventTrigger: WebhookTriggerEvents = WebhookTriggerEvents.BOOKING_REQUESTED;
    subscriberOptions.triggerEvent = eventTrigger;
    webhookData.status = "PENDING";
    await handleWebhookTrigger({ subscriberOptions, eventTrigger, webhookData });
  }

  // Avoid passing referencesToCreate with id unique constrain values
  // refresh hashed link if used
  const urlSeed = `${organizerUser.username}:${dayjs(reqBody.start).utc().format()}`;
  const hashedUid = translator.fromUUID(uuidv5(urlSeed, uuidv5.URL));

  try {
    if (hasHashedBookingLink) {
      await prisma.hashedLink.update({
        where: {
          link: reqBody.hashedLink as string,
        },
        data: {
          link: hashedUid,
        },
      });
    }
  } catch (error) {
    log.error("Error while updating hashed link", error);
  }

  if (!booking) throw new HttpError({ statusCode: 400, message: "Booking failed" });

  try {
    await prisma.booking.update({
      where: {
        uid: booking.uid,
      },
      data: {
        metadata: { ...(typeof booking.metadata === "object" && booking.metadata), ...metadata },
        references: {
          createMany: {
            data: referencesToCreate,
          },
        },
      },
    });
  } catch (error) {
    log.error("Error while creating booking references", error);
  }

  const metadataFromEvent = videoCallUrl ? { videoCallUrl } : undefined;

  try {
    await scheduleWorkflowReminders({
      workflows: eventType.workflows,
      smsReminderNumber: smsReminderNumber || null,
      calendarEvent: {
        ...evt,
        ...{ metadata: metadataFromEvent, eventType: { slug: eventType.slug } },
      },
      requiresConfirmation: evt.requiresConfirmation || false,
      isRescheduleEvent: !!rescheduleUid,
      isFirstRecurringEvent: true,
      hideBranding: !!eventType.owner?.hideBranding,
    });
  } catch (error) {
    log.error("Error while scheduling workflow reminders", error);
  }

  // booking successful
  req.statusCode = 201;
  return {
    ...booking,
    seatReferenceUid: evt.attendeeSeatId,
  };
}

export default handler;

function handleCustomInputs(
  eventTypeCustomInputs: EventTypeCustomInput[],
  reqCustomInputs: {
    value: string | boolean;
    label: string;
  }[]
) {
  eventTypeCustomInputs.forEach((etcInput) => {
    if (etcInput.required) {
      const input = reqCustomInputs.find((i) => i.label === etcInput.label);
      if (etcInput.type === "BOOL") {
        z.literal(true, {
          errorMap: () => ({ message: `Missing ${etcInput.type} customInput: '${etcInput.label}'` }),
        }).parse(input?.value);
      } else if (etcInput.type === "PHONE") {
        z.string({
          errorMap: () => ({
            message: `Missing ${etcInput.type} customInput: '${etcInput.label}'`,
          }),
        })
          .refine((val) => isValidPhoneNumber(val), {
            message: "Phone number is invalid",
          })
          .parse(input?.value);
      } else {
        // type: NUMBER are also passed as string
        z.string({
          errorMap: () => ({ message: `Missing ${etcInput.type} customInput: '${etcInput.label}'` }),
        })
          .min(1)
          .parse(input?.value);
      }
    }
  });
}

const findBookingQuery = async (bookingId: number) => {
  const foundBooking = await prisma.booking.findUnique({
    where: {
      id: bookingId,
    },
    select: {
      uid: true,
      location: true,
      startTime: true,
      endTime: true,
      title: true,
      description: true,
      status: true,
      responses: true,
      user: {
        select: {
          name: true,
          email: true,
          timeZone: true,
        },
      },
      eventType: {
        select: {
          title: true,
          description: true,
          currency: true,
          length: true,
          requiresConfirmation: true,
          price: true,
        },
      },
    },
  });

  // This should never happen but it's just typescript safe
  if (!foundBooking) {
    throw new Error("Internal Error.");
  }

  // Don't leak any sensitive data
  return foundBooking;
};
