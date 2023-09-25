import type { DateArray, ParticipationStatus, ParticipationRole } from "ics";
import { createEvent } from "ics";
// eslint-disable-next-line no-restricted-imports
import { cloneDeep } from "lodash";
import type { TFunction } from "next-i18next";
import { RRule } from "rrule";

import dayjs from "@calcom/dayjs";
import { getRichDescription } from "@calcom/lib/CalEventParser";
import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";

import { renderEmail } from "../";
import BaseEmail from "./_base-email";

export default class AttendeeScheduledEmail extends BaseEmail {
  calEvent: CalendarEvent;
  attendee: Person;
  showAttendees: boolean | undefined;
  t: TFunction;

  constructor(calEvent: CalendarEvent, attendee: Person, showAttendees?: boolean | undefined) {
    super();
    if (!showAttendees && calEvent.seatsPerTimeSlot) {
      this.calEvent = cloneDeep(calEvent);
      this.calEvent.attendees = [attendee];
    } else {
      this.calEvent = calEvent;
    }
    this.name = "SEND_BOOKING_CONFIRMATION";
    this.attendee = attendee;
    this.t = attendee.language.translate;
  }

  protected getiCalEventAsString(): string | undefined {
    // Taking care of recurrence rule
    let recurrenceRule: string | undefined = undefined;
    if (this.calEvent.recurringEvent?.count) {
      // ics appends "RRULE:" already, so removing it from RRule generated string
      recurrenceRule = new RRule(this.calEvent.recurringEvent).toString().replace("RRULE:", "");
    }
    const partstat: ParticipationStatus = "ACCEPTED";
    const role: ParticipationRole = "REQ-PARTICIPANT";
    const icsEvent = createEvent({
      uid: this.calEvent.iCalUID || this.calEvent.uid!,
      start: dayjs(this.calEvent.startTime)
        .utc()
        .toArray()
        .slice(0, 6)
        .map((v, i) => (i === 1 ? v + 1 : v)) as DateArray,
      startInputType: "utc",
      productId: "calcom/ics",
      title: this.calEvent.title,
      description: this.getTextBody(),
      duration: { minutes: dayjs(this.calEvent.endTime).diff(dayjs(this.calEvent.startTime), "minute") },
      organizer: { name: this.calEvent.organizer.name, email: this.calEvent.organizer.email },
      attendees: [
        ...this.calEvent.attendees.map((attendee: Person) => ({
          name: attendee.name,
          email: attendee.email,
          partstat,
          role,
          rsvp: true,
        })),
        ...(this.calEvent.team?.members
          ? this.calEvent.team?.members.map((member: Person) => ({
              name: member.name,
              email: member.email,
              partstat,
              role,
              rsvp: true,
            }))
          : []),
      ],
      method: "REQUEST",
      ...{ recurrenceRule },
      status: "CONFIRMED",
    });
    if (icsEvent.error) {
      throw icsEvent.error;
    }
    return icsEvent.value;
  }

  protected getNodeMailerPayload(): Record<string, unknown> {
    const clonedCalEvent = cloneDeep(this.calEvent);

    this.getiCalEventAsString();

    return {
      icalEvent: {
        filename: "event.ics",
        content: this.getiCalEventAsString(),
        method: "REQUEST",
      },
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${this.calEvent.organizer.name} <${this.getMailerOptions().from}>`,
      replyTo: [...this.calEvent.attendees.map(({ email }) => email), this.calEvent.organizer.email],
      subject: `${this.calEvent.title}`,
      html: renderEmail("AttendeeScheduledEmail", {
        calEvent: clonedCalEvent,
        attendee: this.attendee,
      }),
      text: this.getTextBody(),
    };
  }

  protected getTextBody(title = "", subtitle = "emailed_you_and_any_other_attendees"): string {
    return `
${this.t(
  title || this.calEvent.recurringEvent?.count
    ? "your_event_has_been_scheduled_recurring"
    : "your_event_has_been_scheduled"
)}
${this.t(subtitle)}

${getRichDescription(this.calEvent, this.t)}
`.trim();
  }

  protected getTimezone(): string {
    // Timezone is based on the first attendee in the attendee list
    // as the first attendee is the one who created the booking
    return this.calEvent.attendees[0].timeZone;
  }

  protected getLocale(): string {
    return this.calEvent.attendees[0].language.locale;
  }

  protected getInviteeStart(format: string) {
    return this.getFormattedRecipientTime({
      time: this.calEvent.startTime,
      format,
    });
  }

  protected getInviteeEnd(format: string) {
    return this.getFormattedRecipientTime({
      time: this.calEvent.endTime,
      format,
    });
  }

  public getFormattedDate() {
    const inviteeTimeFormat = this.calEvent.organizer.timeFormat || TimeFormat.TWELVE_HOUR;

    return `${this.getInviteeStart(inviteeTimeFormat)} - ${this.getInviteeEnd(inviteeTimeFormat)}, ${this.t(
      this.getInviteeStart("dddd").toLowerCase()
    )}, ${this.t(this.getInviteeStart("MMMM").toLowerCase())} ${this.getInviteeStart("D, YYYY")}`;
  }
}
