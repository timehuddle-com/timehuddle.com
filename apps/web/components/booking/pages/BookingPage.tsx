import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useForm, useFormContext } from "react-hook-form";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import BookingPageTagManager from "@calcom/app-store/BookingPageTagManager";
import type { EventLocationType } from "@calcom/app-store/locations";
import { createPaymentLink } from "@calcom/app-store/stripepayment/lib/client";
import type { LocationObject } from "@calcom/core/location";
import dayjs from "@calcom/dayjs";
import {
  useEmbedNonStylesConfig,
  useEmbedUiConfig,
  useIsBackgroundTransparent,
  useIsEmbed,
} from "@calcom/embed-core/embed-iframe";
import { createBooking, createRecurringBooking } from "@calcom/features/bookings/lib";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import {
  getBookingFieldsWithSystemFields,
  SystemField,
} from "@calcom/features/bookings/lib/getBookingFields";
import getBookingResponsesSchema, {
  getBookingResponsesPartialSchema,
} from "@calcom/features/bookings/lib/getBookingResponsesSchema";
import getLocationOptionsForSelect from "@calcom/features/bookings/lib/getLocationOptionsForSelect";
import { FormBuilderField } from "@calcom/features/form-builder/FormBuilder";
import { bookingSuccessRedirect } from "@calcom/lib/bookingSuccessRedirect";
import classNames from "@calcom/lib/classNames";
import { APP_NAME, MINUTES_TO_BOOK } from "@calcom/lib/constants";
import useGetBrandingColours from "@calcom/lib/getBrandColours";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import useTheme from "@calcom/lib/hooks/useTheme";
import { useTypedQuery } from "@calcom/lib/hooks/useTypedQuery";
import { HttpError } from "@calcom/lib/http-error";
import { parseDate, parseDateTimeWithTimeZone, parseRecurringDates } from "@calcom/lib/parse-dates";
import { getEveryFreqFor } from "@calcom/lib/recurringStrings";
import { telemetryEventTypes, useTelemetry } from "@calcom/lib/telemetry";
import { TimeFormat } from "@calcom/lib/timeFormat";
import { trpc } from "@calcom/trpc";
import { Button, Form, Tooltip, useCalcomTheme } from "@calcom/ui";
import { AlertTriangle, Calendar, RefreshCw, User } from "@calcom/ui/components/icon";

import { timeZone } from "@lib/clock";
import useRouterQuery from "@lib/hooks/useRouterQuery";

import BookingDescription from "@components/booking/BookingDescription";

import type { BookPageProps } from "../../../pages/[user]/book";
import type { HashLinkPageProps } from "../../../pages/d/[link]/book";
import type { TeamBookingPageProps } from "../../../pages/team/[slug]/book";

const Toaster = dynamic(() => import("react-hot-toast").then((mod) => mod.Toaster), { ssr: false });

/** These are like 40kb that not every user needs */
const BookingDescriptionPayment = dynamic(
  () => import("@components/booking/BookingDescriptionPayment")
) as unknown as typeof import("@components/booking/BookingDescriptionPayment").default;

const useBrandColors = ({ brandColor, darkBrandColor }: { brandColor?: string; darkBrandColor?: string }) => {
  const brandTheme = useGetBrandingColours({
    lightVal: brandColor,
    darkVal: darkBrandColor,
  });
  useCalcomTheme(brandTheme);
};

type BookingPageProps = BookPageProps | TeamBookingPageProps | HashLinkPageProps;
const BookingFields = ({
  fields,
  locations,
  rescheduleUid,
  isDynamicGroupBooking,
}: {
  fields: BookingPageProps["eventType"]["bookingFields"];
  locations: LocationObject[];
  rescheduleUid?: string;
  isDynamicGroupBooking: boolean;
}) => {
  const { t } = useLocale();
  const { watch, setValue } = useFormContext();
  const locationResponse = watch("responses.location");
  const currentView = rescheduleUid ? "reschedule" : "";

  return (
    // TODO: It might make sense to extract this logic into BookingFields config, that would allow to quickly configure system fields and their editability in fresh booking and reschedule booking view
    <div>
      {fields.map((field, index) => {
        // During reschedule by default all system fields are readOnly. Make them editable on case by case basis.
        // Allowing a system field to be edited might require sending emails to attendees, so we need to be careful
        let readOnly =
          (field.editable === "system" || field.editable === "system-but-optional") && !!rescheduleUid;

        let noLabel = false;
        let hidden = !!field.hidden;
        const fieldViews = field.views;

        if (fieldViews && !fieldViews.find((view) => view.id === currentView)) {
          return null;
        }

        if (field.name === SystemField.Enum.rescheduleReason) {
          // rescheduleReason is a reschedule specific field and thus should be editable during reschedule
          readOnly = false;
        }

        if (field.name === SystemField.Enum.smsReminderNumber) {
          // `smsReminderNumber` and location.optionValue when location.value===phone are the same data point. We should solve it in a better way in the Form Builder itself.
          // I think we should have a way to connect 2 fields together and have them share the same value in Form Builder
          if (locationResponse?.value === "phone") {
            setValue(`responses.${SystemField.Enum.smsReminderNumber}`, locationResponse?.optionValue);
            // Just don't render the field now, as the value is already connected to attendee phone location
            return null;
          }
          // `smsReminderNumber` can be edited during reschedule even though it's a system field
          readOnly = false;
        }

        if (field.name === SystemField.Enum.guests) {
          // No matter what user configured for Guests field, we don't show it for dynamic group booking as that doesn't support guests
          hidden = isDynamicGroupBooking ? true : !!field.hidden;
        }

        // We don't show `notes` field during reschedule
        if (
          (field.name === SystemField.Enum.notes || field.name === SystemField.Enum.guests) &&
          !!rescheduleUid
        ) {
          return null;
        }

        // Dynamically populate location field options
        if (field.name === SystemField.Enum.location && field.type === "radioInput") {
          if (!field.optionsInputs) {
            throw new Error("radioInput must have optionsInputs");
          }
          const optionsInputs = field.optionsInputs;

          // TODO: Instead of `getLocationOptionsForSelect` options should be retrieved from dataStore[field.getOptionsAt]. It would make it agnostic of the `name` of the field.
          const options = getLocationOptionsForSelect(locations, t);
          options.forEach((option) => {
            const optionInput = optionsInputs[option.value as keyof typeof optionsInputs];
            if (optionInput) {
              optionInput.placeholder = option.inputPlaceholder;
            }
          });
          field.options = options.filter(
            (location): location is NonNullable<(typeof options)[number]> => !!location
          );
          // If we have only one option and it has an input, we don't show the field label because Option name acts as label.
          // e.g. If it's just Attendee Phone Number option then we don't show `Location` label
          if (field.options.length === 1) {
            if (field.optionsInputs[field.options[0].value]) {
              noLabel = true;
            } else {
              // If there's only one option and it doesn't have an input, we don't show the field at all because it's visible in the left side bar
              hidden = true;
            }
          }
        }

        const label = noLabel ? "" : field.label || t(field.defaultLabel || "");
        const placeholder = field.placeholder || t(field.defaultPlaceholder || "");

        return (
          <FormBuilderField
            className="mb-4"
            field={{ ...field, label, placeholder, hidden }}
            readOnly={readOnly}
            key={index}
          />
        );
      })}
    </div>
  );
};

const routerQuerySchema = z
  .object({
    timeFormat: z.nativeEnum(TimeFormat),
    rescheduleUid: z.string().optional(),
    date: z
      .string()
      .optional()
      .transform((date) => {
        if (date === undefined) {
          return null;
        }
        return date;
      }),
  })
  .passthrough();

const BookingPage = ({
  eventType,
  booking,
  currentSlotBooking,
  profile,
  isDynamicGroupBooking,
  recurringEventCount,
  hasHashedBookingLink,
  hashedLink,
  ...restProps
}: BookingPageProps) => {
  const removeSelectedSlotMarkMutation = trpc.viewer.public.slots.removeSelectedSlotMark.useMutation();
  const reserveSlotMutation = trpc.viewer.public.slots.reserveSlot.useMutation();
  const { t, i18n } = useLocale();
  const { duration: queryDuration } = useRouterQuery("duration");
  const { date: queryDate } = useRouterQuery("date");
  const isEmbed = useIsEmbed(restProps.isEmbed);
  const embedUiConfig = useEmbedUiConfig();
  const shouldAlignCentrallyInEmbed = useEmbedNonStylesConfig("align") !== "left";
  const shouldAlignCentrally = !isEmbed || shouldAlignCentrallyInEmbed;
  const router = useRouter();
  const { data: session } = useSession();
  const isBackgroundTransparent = useIsBackgroundTransparent();
  const telemetry = useTelemetry();

  const { timezone } = useTimePreferences();

  const reserveSlot = () => {
    if (queryDuration) {
      reserveSlotMutation.mutate({
        eventTypeId: eventType.id,
        slotUtcStartDate: dayjs(queryDate).utc().format(),
        slotUtcEndDate: dayjs(queryDate).utc().add(parseInt(queryDuration), "minutes").format(),
        bookingUid: currentSlotBooking?.uid,
      });
    }
  };
  // Define duration now that we support multiple duration eventTypes
  let duration = eventType.length;
  if (
    queryDuration &&
    !isNaN(Number(queryDuration)) &&
    eventType.metadata?.multipleDuration &&
    eventType.metadata?.multipleDuration.includes(Number(queryDuration))
  ) {
    duration = Number(queryDuration);
  }

  useEffect(() => {
    /* if (top !== window) {
      //page_view will be collected automatically by _middleware.ts
      telemetry.event(
        telemetryEventTypes.embedView,
        collectPageParameters("/book", { isTeamBooking: document.URL.includes("team/") })
      );
    } */
    reserveSlot();
    const interval = setInterval(reserveSlot, parseInt(MINUTES_TO_BOOK) * 60 * 1000 - 2000);
    return () => {
      clearInterval(interval);
      removeSelectedSlotMarkMutation.mutate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutation = useMutation(createBooking, {
    onSuccess: async (responseData) => {
      const { uid } = responseData;

      if ("paymentUid" in responseData && !!responseData.paymentUid) {
        return await router.push(
          createPaymentLink({
            paymentUid: responseData.paymentUid,
            date,
            name: bookingForm.getValues("responses.name"),
            email: bookingForm.getValues("responses.email"),
            absolute: false,
          })
        );
      }

      const query = {
        isSuccessBookingPage: true,
        email: bookingForm.getValues("responses.email"),
        eventTypeSlug: eventType.slug,
        seatReferenceUid: "seatReferenceUid" in responseData ? responseData.seatReferenceUid : null,
        ...(rescheduleUid && booking?.startTime && { formerTime: booking.startTime.toString() }),
      };

      return bookingSuccessRedirect({
        router,
        successRedirectUrl: eventType.successRedirectUrl,
        query,
        bookingUid: uid,
      });
    },
  });

  const recurringMutation = useMutation(createRecurringBooking, {
    onSuccess: async (responseData = []) => {
      const { uid } = responseData[0] || {};
      const query = {
        isSuccessBookingPage: true,
        allRemainingBookings: true,
        email: bookingForm.getValues("responses.email"),
        eventTypeSlug: eventType.slug,
        formerTime: booking?.startTime.toString(),
      };
      return bookingSuccessRedirect({
        router,
        successRedirectUrl: eventType.successRedirectUrl,
        query,
        bookingUid: uid,
      });
    },
  });

  const {
    data: { timeFormat, rescheduleUid, date },
  } = useTypedQuery(routerQuerySchema);

  useTheme(profile.theme);
  useBrandColors({
    brandColor: profile.brandColor,
    darkBrandColor: profile.darkBrandColor,
  });

  const querySchema = getBookingResponsesPartialSchema({
    eventType: {
      bookingFields: getBookingFieldsWithSystemFields(eventType),
    },
    view: rescheduleUid ? "reschedule" : "booking",
  });

  const parsedQuery = querySchema.parse({
    ...router.query,
    // `guest` because we need to support legacy URL with `guest` query param support
    // `guests` because the `name` of the corresponding bookingField is `guests`
    guests: router.query.guests || router.query.guest,
  });

  // it would be nice if Prisma at some point in the future allowed for Json<Location>; as of now this is not the case.
  const locations: LocationObject[] = useMemo(
    () => (eventType.locations as LocationObject[]) || [],
    [eventType.locations]
  );

  const [isClientTimezoneAvailable, setIsClientTimezoneAvailable] = useState(false);
  useEffect(() => {
    // THis is to fix hydration error that comes because of different timezone on server and client
    setIsClientTimezoneAvailable(true);
  }, []);

  const loggedInIsOwner = eventType?.users[0]?.id === session?.user?.id;

  // There should only exists one default userData variable for primaryAttendee.
  const defaultUserValues = {
    email: rescheduleUid ? booking?.attendees[0].email : parsedQuery["email"],
    name: rescheduleUid ? booking?.attendees[0].name : parsedQuery["name"],
  };

  const defaultValues = () => {
    if (!rescheduleUid) {
      const defaults = {
        responses: {} as Partial<z.infer<typeof bookingFormSchema>["responses"]>,
      };

      const responses = eventType.bookingFields.reduce((responses, field) => {
        return {
          ...responses,
          [field.name]: parsedQuery[field.name],
        };
      }, {});
      defaults.responses = {
        ...responses,
        name: defaultUserValues.name || (!loggedInIsOwner && session?.user?.name) || "",
        email: defaultUserValues.email || (!loggedInIsOwner && session?.user?.email) || "",
      };

      return defaults;
    }

    if (!booking || !booking.attendees.length) {
      return {};
    }
    const primaryAttendee = booking.attendees[0];
    if (!primaryAttendee) {
      return {};
    }

    const defaults = {
      responses: {} as Partial<z.infer<typeof bookingFormSchema>["responses"]>,
    };

    const responses = eventType.bookingFields.reduce((responses, field) => {
      return {
        ...responses,
        [field.name]: booking.responses[field.name],
      };
    }, {});
    defaults.responses = {
      ...responses,
      name: defaultUserValues.name || (!loggedInIsOwner && session?.user?.name) || "",
      email: defaultUserValues.email || (!loggedInIsOwner && session?.user?.email) || "",
    };
    return defaults;
  };

  const bookingFormSchema = z
    .object({
      responses: getBookingResponsesSchema({
        eventType: { bookingFields: getBookingFieldsWithSystemFields(eventType) },
        view: rescheduleUid ? "reschedule" : "booking",
      }),
    })
    .passthrough();

  type BookingFormValues = {
    locationType?: EventLocationType["type"];
    responses: z.infer<typeof bookingFormSchema>["responses"];
  };

  const bookingForm = useForm<BookingFormValues>({
    defaultValues: defaultValues(),
    resolver: zodResolver(bookingFormSchema), // Since this isn't set to strict we only validate the fields in the schema
  });

  // Calculate the booking date(s)
  let recurringStrings: string[] = [],
    recurringDates: Date[] = [];
  if (eventType.recurringEvent?.freq && recurringEventCount !== null) {
    [recurringStrings, recurringDates] = parseRecurringDates(
      {
        startDate: date,
        timeZone: timeZone(),
        recurringEvent: eventType.recurringEvent,
        recurringCount: parseInt(recurringEventCount.toString()),
        selectedTimeFormat: timeFormat,
      },
      i18n.language
    );
  }

  const bookEvent = (bookingValues: BookingFormValues) => {
    telemetry.event(
      top !== window ? telemetryEventTypes.embedBookingConfirmed : telemetryEventTypes.bookingConfirmed,
      { isTeamBooking: document.URL.includes("team/") }
    );
    // "metadata" is a reserved key to allow for connecting external users without relying on the email address.
    // <...url>&metadata[user_id]=123 will be send as a custom input field as the hidden type.

    // @TODO: move to metadata
    const metadata = Object.keys(router.query)
      .filter((key) => key.startsWith("metadata"))
      .reduce(
        (metadata, key) => ({
          ...metadata,
          [key.substring("metadata[".length, key.length - 1)]: router.query[key],
        }),
        {}
      );

    if (recurringDates.length) {
      // Identify set of bookings to one intance of recurring event to support batch changes
      const recurringEventId = uuidv4();
      const recurringBookings = recurringDates.map((recurringDate) => ({
        ...bookingValues,
        start: dayjs(recurringDate).utc().format(),
        end: dayjs(recurringDate).utc().add(duration, "minute").format(),
        eventTypeId: eventType.id,
        eventTypeSlug: eventType.slug,
        recurringEventId,
        // Added to track down the number of actual occurrences selected by the user
        recurringCount: recurringDates.length,
        timeZone: timeZone(),
        language: i18n.language,
        rescheduleUid,
        user: router.query.user,
        metadata,
        hasHashedBookingLink,
        hashedLink,
      }));
      recurringMutation.mutate(recurringBookings);
    } else {
      mutation.mutate({
        ...bookingValues,
        start: dayjs(date).utc().format(),
        end: dayjs(date).utc().add(duration, "minute").format(),
        eventTypeId: eventType.id,
        eventTypeSlug: eventType.slug,
        timeZone: timeZone(),
        language: i18n.language,
        rescheduleUid,
        bookingUid: (router.query.bookingUid as string) || booking?.uid,
        user: router.query.user,
        metadata,
        hasHashedBookingLink,
        hashedLink,
        seatReferenceUid: router.query.seatReferenceUid as string,
      });
    }
  };

  const showEventTypeDetails = (isEmbed && !embedUiConfig.hideEventTypeDetails) || !isEmbed;

  return (
    <>
      <Head>
        <title>
          {rescheduleUid
            ? t("booking_reschedule_confirmation", {
                eventTypeTitle: eventType.title,
                profileName: profile.name,
              })
            : t("booking_confirmation", {
                eventTypeTitle: eventType.title,
                profileName: profile.name,
              })}{" "}
          | {APP_NAME}
        </title>
        <link rel="icon" href="/favico.ico" />
      </Head>
      <BookingPageTagManager eventType={eventType} />
      <main
        className={classNames(
          shouldAlignCentrally ? "mx-auto" : "",
          isEmbed ? "" : "sm:my-24",
          "my-0 max-w-3xl"
        )}>
        <div
          className={classNames(
            "main",
            isBackgroundTransparent ? "" : "bg-default dark:bg-muted",
            "border-booker sm:border-booker-width rounded-md"
          )}>
          <div className="sm:flex">
            {showEventTypeDetails && (
              <div className="sm:border-subtle text-default flex flex-col px-6 pb-0 pt-6 sm:w-1/2 sm:border-r sm:pb-6">
                <BookingDescription isBookingPage profile={profile} eventType={eventType}>
                  <BookingDescriptionPayment eventType={eventType} t={t} i18n={i18n} />
                  {!rescheduleUid && eventType.recurringEvent?.freq && recurringEventCount && (
                    <div className="text-default items-start text-sm font-medium">
                      <RefreshCw className="ml-[2px] inline-block h-4 w-4 ltr:mr-[10px] rtl:ml-[10px]" />
                      <p className="-ml-2 inline-block items-center px-2">
                        {getEveryFreqFor({
                          t,
                          recurringEvent: eventType.recurringEvent,
                          recurringCount: recurringEventCount,
                        })}
                      </p>
                    </div>
                  )}
                  <div className="text-bookinghighlight flex items-start text-sm">
                    <Calendar className="ml-[2px] mt-[2px] inline-block h-4 w-4 ltr:mr-[10px] rtl:ml-[10px]" />
                    <div className="text-sm font-medium">
                      {isClientTimezoneAvailable &&
                        (rescheduleUid || !eventType.recurringEvent?.freq) &&
                        `${parseDate(date, i18n.language, { selectedTimeFormat: timeFormat })}`}
                      {isClientTimezoneAvailable &&
                        !rescheduleUid &&
                        eventType.recurringEvent?.freq &&
                        recurringStrings.slice(0, 5).map((timeFormatted, key) => {
                          return <p key={key}>{timeFormatted}</p>;
                        })}
                      {!rescheduleUid && eventType?.recurringEvent?.freq && recurringStrings.length > 5 && (
                        <div className="flex">
                          <Tooltip
                            content={recurringStrings.slice(5).map((timeFormatted, key) => (
                              <p key={key}>{timeFormatted}</p>
                            ))}>
                            <p className=" text-sm">
                              + {t("plus_more", { count: recurringStrings.length - 5 })}
                            </p>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                  {booking?.startTime && rescheduleUid && (
                    <div>
                      <p className="mb-2 mt-8 text-sm " data-testid="former_time_p">
                        {t("former_time")}
                      </p>
                      <p className="line-through ">
                        <Calendar className="-mt-1 ml-[2px] inline-block h-4 w-4 ltr:mr-[10px] rtl:ml-[10px]" />
                        {isClientTimezoneAvailable &&
                          typeof booking.startTime === "string" &&
                          parseDateTimeWithTimeZone(booking.startTime, i18n.language, timezone, {
                            selectedTimeFormat: timeFormat,
                          })}
                      </p>
                    </div>
                  )}
                  {!!eventType.seatsPerTimeSlot && (
                    <div className="text-bookinghighlight flex items-start text-sm">
                      <User
                        className={`ml-[2px] mt-[2px] inline-block h-4 w-4 ltr:mr-[10px] rtl:ml-[10px] ${
                          currentSlotBooking &&
                          currentSlotBooking.attendees.length / eventType.seatsPerTimeSlot >= 0.5
                            ? "text-rose-600"
                            : currentSlotBooking &&
                              currentSlotBooking.attendees.length / eventType.seatsPerTimeSlot >= 0.33
                            ? "text-yellow-500"
                            : "text-bookinghighlight"
                        }`}
                      />
                      <p
                        className={`${
                          currentSlotBooking &&
                          currentSlotBooking.attendees.length / eventType.seatsPerTimeSlot >= 0.5
                            ? "text-rose-600"
                            : currentSlotBooking &&
                              currentSlotBooking.attendees.length / eventType.seatsPerTimeSlot >= 0.33
                            ? "text-yellow-500"
                            : "text-bookinghighlight"
                        } mb-2 font-medium`}>
                        {currentSlotBooking
                          ? eventType.seatsPerTimeSlot - currentSlotBooking.attendees.length
                          : eventType.seatsPerTimeSlot}{" "}
                        / {eventType.seatsPerTimeSlot}{" "}
                        {t("seats_available", {
                          count: currentSlotBooking
                            ? eventType.seatsPerTimeSlot - currentSlotBooking.attendees.length
                            : eventType.seatsPerTimeSlot,
                        })}
                      </p>
                    </div>
                  )}
                </BookingDescription>
              </div>
            )}
            <div className={classNames("p-6", showEventTypeDetails ? "sm:w-1/2" : "w-full")}>
              <Form form={bookingForm} noValidate handleSubmit={bookEvent}>
                <BookingFields
                  isDynamicGroupBooking={isDynamicGroupBooking}
                  fields={eventType.bookingFields}
                  locations={locations}
                  rescheduleUid={rescheduleUid}
                />

                <div
                  className={classNames(
                    "flex justify-end space-x-2 rtl:space-x-reverse",
                    // HACK: If the last field is guests, we need to move Cancel, Submit buttons up because "Add Guests" being present on the left and the buttons on the right, spacing is not required
                    eventType.bookingFields[eventType.bookingFields.length - 1].name ===
                      SystemField.Enum.guests
                      ? "-mt-4"
                      : ""
                  )}>
                  <Button color="minimal" type="button" onClick={() => router.back()}>
                    {t("cancel")}
                  </Button>
                  <Button
                    type="submit"
                    data-testid={rescheduleUid ? "confirm-reschedule-button" : "confirm-book-button"}
                    loading={mutation.isLoading || recurringMutation.isLoading}>
                    {rescheduleUid ? t("reschedule") : t("confirm")}
                  </Button>
                </div>
              </Form>
              {mutation.isError || recurringMutation.isError ? (
                <ErrorMessage error={mutation.error || recurringMutation.error} />
              ) : null}
            </div>
          </div>
        </div>
      </main>
      <Toaster position="bottom-right" />
    </>
  );
};

export default BookingPage;

function ErrorMessage({ error }: { error: unknown }) {
  const { t } = useLocale();
  const { query: { rescheduleUid } = {} } = useRouter();
  const router = useRouter();

  return (
    <div data-testid="booking-fail" className="mt-2 border-l-4 border-blue-400 bg-blue-50 p-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-blue-400" aria-hidden="true" />
        </div>
        <div className="ms-3">
          <p className="text-sm text-blue-700">
            {rescheduleUid ? t("reschedule_fail") : t("booking_fail")}{" "}
            {error instanceof HttpError || error instanceof Error ? (
              <>
                {t("can_you_try_again")}{" "}
                <span className="cursor-pointer underline" onClick={() => router.back()}>
                  {t("go_back")}
                </span>
                .
              </> /* t(error.message) */
            ) : (
              "Unknown error"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
