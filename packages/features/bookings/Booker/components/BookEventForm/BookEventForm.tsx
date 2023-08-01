import { zodResolver } from "@hookform/resolvers/zod";
import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { TFunction } from "next-i18next";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FieldError } from "react-hook-form";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { EventLocationType } from "@calcom/app-store/locations";
import { createPaymentLink } from "@calcom/app-store/stripepayment/lib/client";
import dayjs from "@calcom/dayjs";
import { VerifyCodeDialog } from "@calcom/features/bookings/components/VerifyCodeDialog";
import {
  useTimePreferences,
  mapBookingToMutationInput,
  createBooking,
  createRecurringBooking,
  mapRecurringBookingToMutationInput,
} from "@calcom/features/bookings/lib";
import { getBookingFieldsWithSystemFields } from "@calcom/features/bookings/lib/getBookingFields";
import getBookingResponsesSchema, {
  getBookingResponsesPartialSchema,
} from "@calcom/features/bookings/lib/getBookingResponsesSchema";
import { getFullName } from "@calcom/features/form-builder/utils";
import { bookingSuccessRedirect } from "@calcom/lib/bookingSuccessRedirect";
import { MINUTES_TO_BOOK } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { HttpError } from "@calcom/lib/http-error";
import { trpc } from "@calcom/trpc";
import { Form, Button, Alert, EmptyScreen, showToast } from "@calcom/ui";
import { Calendar } from "@calcom/ui/components/icon";

import { useBookerStore } from "../../store";
import { useEvent } from "../../utils/event";
import { BookingFields } from "./BookingFields";
import { FormSkeleton } from "./Skeleton";

type BookEventFormProps = {
  onCancel?: () => void;
};

export const BookEventForm = ({ onCancel }: BookEventFormProps) => {
  const session = useSession();
  const reserveSlotMutation = trpc.viewer.public.slots.reserveSlot.useMutation({
    trpc: { context: { skipBatch: true } },
  });
  const removeSelectedSlot = trpc.viewer.public.slots.removeSelectedSlotMark.useMutation({
    trpc: { context: { skipBatch: true } },
  });
  const router = useRouter();
  const { t, i18n } = useLocale();
  const { timezone } = useTimePreferences();
  const errorRef = useRef<HTMLDivElement>(null);
  const rescheduleUid = useBookerStore((state) => state.rescheduleUid);
  const bookingData = useBookerStore((state) => state.bookingData);
  const eventSlug = useBookerStore((state) => state.eventSlug);
  const duration = useBookerStore((state) => state.selectedDuration);
  const timeslot = useBookerStore((state) => state.selectedTimeslot);
  const recurringEventCount = useBookerStore((state) => state.recurringEventCount);
  const username = useBookerStore((state) => state.username);
  const formValues = useBookerStore((state) => state.formValues);
  const setFormValues = useBookerStore((state) => state.setFormValues);
  const seatedEventData = useBookerStore((state) => state.seatedEventData);
  const verifiedEmail = useBookerStore((state) => state.verifiedEmail);
  const setVerifiedEmail = useBookerStore((state) => state.setVerifiedEmail);
  const isRescheduling = !!rescheduleUid && !!bookingData;
  const event = useEvent();
  const eventType = event.data;

  const reserveSlot = () => {
    if (eventType?.id && timeslot && (duration || eventType?.length)) {
      reserveSlotMutation.mutate({
        slotUtcStartDate: dayjs(timeslot).utc().format(),
        eventTypeId: eventType?.id,
        slotUtcEndDate: dayjs(timeslot)
          .utc()
          .add(duration || eventType?.length, "minutes")
          .format(),
      });
    }
  };

  useEffect(() => {
    reserveSlot();

    const interval = setInterval(() => {
      reserveSlot();
    }, parseInt(MINUTES_TO_BOOK) * 60 * 1000 - 2000);

    return () => {
      if (eventType) {
        removeSelectedSlot.mutate();
      }
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType?.id, timeslot]);

  const defaultValues = useMemo(() => {
    if (Object.keys(formValues).length) return formValues;

    if (!eventType?.bookingFields) {
      return {};
    }
    const querySchema = getBookingResponsesPartialSchema({
      eventType: {
        bookingFields: eventType.bookingFields,
      },
      view: rescheduleUid ? "reschedule" : "booking",
    });

    const parsedQuery = querySchema.parse({
      ...router.query,
      // `guest` because we need to support legacy URL with `guest` query param support
      // `guests` because the `name` of the corresponding bookingField is `guests`
      guests: router.query.guests || router.query.guest,
    });

    const defaultUserValues = {
      email: rescheduleUid
        ? bookingData?.attendees[0].email
        : parsedQuery["email"] || session.data?.user?.email || "",
      name: rescheduleUid
        ? bookingData?.attendees[0].name
        : parsedQuery["name"] || session.data?.user?.name || "",
    };

    if (!isRescheduling) {
      const defaults = {
        responses: {} as Partial<z.infer<typeof bookingFormSchema>["responses"]>,
      };

      const responses = eventType.bookingFields.reduce((responses, field) => {
        return {
          ...responses,
          [field.name]: parsedQuery[field.name] || undefined,
        };
      }, {});

      defaults.responses = {
        ...responses,
        name: defaultUserValues.name,
        email: defaultUserValues.email,
      };

      return defaults;
    }

    if ((!rescheduleUid && !bookingData) || !bookingData.attendees.length) {
      return {};
    }
    const primaryAttendee = bookingData.attendees[0];
    if (!primaryAttendee) {
      return {};
    }

    const defaults = {
      responses: {} as Partial<z.infer<typeof bookingFormSchema>["responses"]>,
    };

    const responses = eventType.bookingFields.reduce((responses, field) => {
      return {
        ...responses,
        [field.name]: bookingData.responses[field.name],
      };
    }, {});
    defaults.responses = {
      ...responses,
      name: defaultUserValues.name,
      email: defaultUserValues.email,
    };
    return defaults;
  }, [eventType?.bookingFields, formValues, isRescheduling, bookingData, rescheduleUid]);

  const disableBookingTitle = !!event.data?.isDynamic;
  const bookingFormSchema = z
    .object({
      responses: event?.data
        ? getBookingResponsesSchema({
            eventType: {
              bookingFields: getBookingFieldsWithSystemFields({ ...event.data, disableBookingTitle }),
            },
            view: rescheduleUid ? "reschedule" : "booking",
          })
        : // Fallback until event is loaded.
          z.object({}),
    })
    .passthrough();

  type BookingFormValues = {
    locationType?: EventLocationType["type"];
    responses: z.infer<typeof bookingFormSchema>["responses"];
    // Key is not really part of form values, but only used to have a key
    // to set generic error messages on. Needed until RHF has implemented root error keys.
    globalError: undefined;
  };

  const bookingForm = useForm<BookingFormValues>({
    defaultValues,
    resolver: zodResolver(bookingFormSchema), // Since this isn't set to strict we only validate the fields in the schema
  });

  const createBookingMutation = useMutation(createBooking, {
    onSuccess: async (responseData) => {
      const { uid, paymentUid } = responseData;
      const fullName = getFullName(bookingForm.getValues("responses.name"));
      if (paymentUid) {
        return await router.push(
          createPaymentLink({
            paymentUid,
            date: timeslot,
            name: fullName,
            email: bookingForm.getValues("responses.email"),
            absolute: false,
          })
        );
      }

      if (!uid) {
        console.error("No uid returned from createBookingMutation");
        return;
      }

      const query = {
        isSuccessBookingPage: true,
        email: bookingForm.getValues("responses.email"),
        eventTypeSlug: eventSlug,
        seatReferenceUid: "seatReferenceUid" in responseData ? responseData.seatReferenceUid : null,
        formerTime:
          isRescheduling && bookingData?.startTime ? dayjs(bookingData.startTime).toString() : undefined,
      };

      return bookingSuccessRedirect({
        router,
        successRedirectUrl: eventType?.successRedirectUrl || "",
        query,
        bookingUid: uid,
      });
    },
    onError: () => {
      errorRef && errorRef.current?.scrollIntoView({ behavior: "smooth" });
    },
  });

  const createRecurringBookingMutation = useMutation(createRecurringBooking, {
    onSuccess: async (responseData) => {
      const { uid } = responseData[0] || {};

      if (!uid) {
        console.error("No uid returned from createRecurringBookingMutation");
        return;
      }

      const query = {
        isSuccessBookingPage: true,
        allRemainingBookings: true,
        email: bookingForm.getValues("responses.email"),
        eventTypeSlug: eventSlug,
        formerTime:
          isRescheduling && bookingData?.startTime ? dayjs(bookingData.startTime).toString() : undefined,
      };

      return bookingSuccessRedirect({
        router,
        successRedirectUrl: eventType?.successRedirectUrl || "",
        query,
        bookingUid: uid,
      });
    },
  });

  const [isEmailVerificationModalVisible, setEmailVerificationModalVisible] = useState(false);
  const email = bookingForm.watch("responses.email");

  const sendEmailVerificationByCodeMutation = trpc.viewer.auth.sendVerifyEmailCode.useMutation({
    onSuccess() {
      showToast(t("email_sent"), "success");
    },
    onError() {
      showToast(t("email_not_sent"), "error");
    },
  });

  const verifyEmail = () => {
    bookingForm.clearErrors();

    // It shouldn't be possible that this method is fired without having event data,
    // but since in theory (looking at the types) it is possible, we still handle that case.
    if (!event?.data) {
      bookingForm.setError("globalError", { message: t("error_booking_event") });
      return;
    }

    const name = bookingForm.getValues("responses.name");

    sendEmailVerificationByCodeMutation.mutate({
      email,
      username: typeof name === "string" ? name : name.firstName,
    });
    setEmailVerificationModalVisible(true);
  };

  if (event.isError) return <Alert severity="warning" message={t("error_booking_event")} />;
  if (event.isLoading || !event.data) return <FormSkeleton />;
  if (!timeslot)
    return (
      <EmptyScreen
        headline={t("timeslot_missing_title")}
        description={t("timeslot_missing_description")}
        Icon={Calendar}
        buttonText={t("timeslot_missing_cta")}
        buttonOnClick={onCancel}
      />
    );

  const bookEvent = (values: BookingFormValues) => {
    // Clears form values stored in store, so old values won't stick around.
    setFormValues({});
    bookingForm.clearErrors();

    // It shouldn't be possible that this method is fired without having event data,
    // but since in theory (looking at the types) it is possible, we still handle that case.
    if (!event?.data) {
      bookingForm.setError("globalError", { message: t("error_booking_event") });
      return;
    }

    // Ensures that duration is an allowed value, if not it defaults to the
    // default event duration.
    const validDuration =
      duration &&
      event.data.metadata?.multipleDuration &&
      event.data.metadata?.multipleDuration.includes(duration)
        ? duration
        : event.data.length;

    const bookingInput = {
      values,
      duration: validDuration,
      event: event.data,
      date: timeslot,
      timeZone: timezone,
      language: i18n.language,
      rescheduleUid: rescheduleUid || undefined,
      bookingUid: (bookingData && bookingData.uid) || seatedEventData?.bookingUid || undefined,
      username: username || "",
      metadata: Object.keys(router.query)
        .filter((key) => key.startsWith("metadata"))
        .reduce(
          (metadata, key) => ({
            ...metadata,
            [key.substring("metadata[".length, key.length - 1)]: router.query[key],
          }),
          {}
        ),
    };

    if (event.data?.recurringEvent?.freq && recurringEventCount) {
      createRecurringBookingMutation.mutate(
        mapRecurringBookingToMutationInput(bookingInput, recurringEventCount)
      );
    } else {
      createBookingMutation.mutate(mapBookingToMutationInput(bookingInput));
    }
  };

  if (!eventType) {
    console.warn("No event type found for event", router.query);
    return <Alert severity="warning" message={t("error_booking_event")} />;
  }

  const renderConfirmNotVerifyEmailButtonCond =
    !eventType?.requiresBookerEmailVerification || (email && verifiedEmail && verifiedEmail === email);

  return (
    <div className="flex h-full flex-col">
      <Form
        className="flex h-full flex-col"
        onChange={() => {
          // Form data is saved in store. This way when user navigates back to
          // still change the timeslot, and comes back to the form, all their values
          // still exist. This gets cleared when the form is submitted.
          const values = bookingForm.getValues();
          setFormValues(values);
        }}
        form={bookingForm}
        handleSubmit={renderConfirmNotVerifyEmailButtonCond ? bookEvent : verifyEmail}
        noValidate>
        <BookingFields
          isDynamicGroupBooking={!!(username && username.indexOf("+") > -1)}
          fields={eventType.bookingFields}
          locations={eventType.locations}
          rescheduleUid={rescheduleUid || undefined}
        />
        {(createBookingMutation.isError ||
          createRecurringBookingMutation.isError ||
          bookingForm.formState.errors["globalError"]) && (
          <div data-testid="booking-fail">
            <Alert
              ref={errorRef}
              className="my-2"
              severity="info"
              title={rescheduleUid ? t("reschedule_fail") : t("booking_fail")}
              message={getError(
                bookingForm.formState.errors["globalError"],
                createBookingMutation,
                createRecurringBookingMutation,
                t
              )}
            />
          </div>
        )}
        <div className="modalsticky mt-auto flex justify-end space-x-2 rtl:space-x-reverse">
          {!!onCancel && (
            <Button color="minimal" type="button" onClick={onCancel} data-testid="back">
              {t("back")}
            </Button>
          )}
          <Button
            type="submit"
            color="primary"
            loading={createBookingMutation.isLoading || createRecurringBookingMutation.isLoading}
            data-testid={rescheduleUid ? "confirm-reschedule-button" : "confirm-book-button"}>
            {rescheduleUid
              ? t("reschedule")
              : renderConfirmNotVerifyEmailButtonCond
              ? t("confirm")
              : t("verify_email_email_button")}
          </Button>
        </div>
      </Form>
      <VerifyCodeDialog
        isOpenDialog={isEmailVerificationModalVisible}
        setIsOpenDialog={setEmailVerificationModalVisible}
        email={email}
        onSuccess={() => {
          setVerifiedEmail(email);
          setEmailVerificationModalVisible(false);
        }}
        isUserSessionRequiredToVerify={false}
      />
    </div>
  );
};

const getError = (
  globalError: FieldError | undefined,
  // It feels like an implementation detail to reimplement the types of useMutation here.
  // Since they don't matter for this function, I'd rather disable them then giving you
  // the cognitive overload of thinking to update them here when anything changes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bookingMutation: UseMutationResult<any, any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recurringBookingMutation: UseMutationResult<any, any, any, any>,
  t: TFunction
) => {
  if (globalError) return globalError.message;

  const error = bookingMutation.error || recurringBookingMutation.error;

  return error instanceof HttpError || error instanceof Error ? (
    <>{t("can_you_try_again")}</>
  ) : (
    "Unknown error"
  );
};
