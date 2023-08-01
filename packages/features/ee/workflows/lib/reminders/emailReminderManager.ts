import client from "@sendgrid/client";
import type { MailData } from "@sendgrid/helpers/classes/mail";
import sgMail from "@sendgrid/mail";

import dayjs from "@calcom/dayjs";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type { TimeUnit } from "@calcom/prisma/enums";
import { WorkflowActions, WorkflowMethods, WorkflowTemplates } from "@calcom/prisma/enums";
import { WorkflowTriggerEvents } from "@calcom/prisma/enums";
import { bookingMetadataSchema } from "@calcom/prisma/zod-utils";

import type { BookingInfo, timeUnitLowerCase } from "./smsReminderManager";
import type { VariablesType } from "./templates/customTemplate";
import customTemplate from "./templates/customTemplate";
import emailReminderTemplate from "./templates/emailReminderTemplate";

let sendgridAPIKey, senderEmail: string;

const log = logger.getChildLogger({ prefix: ["[emailReminderManager]"] });
if (process.env.SENDGRID_API_KEY) {
  sendgridAPIKey = process.env.SENDGRID_API_KEY as string;
  senderEmail = process.env.SENDGRID_EMAIL as string;

  sgMail.setApiKey(sendgridAPIKey);
  client.setApiKey(sendgridAPIKey);
}

export const scheduleEmailReminder = async (
  evt: BookingInfo,
  triggerEvent: WorkflowTriggerEvents,
  action: WorkflowActions,
  timeSpan: {
    time: number | null;
    timeUnit: TimeUnit | null;
  },
  sendTo: MailData["to"],
  emailSubject: string,
  emailBody: string,
  workflowStepId: number,
  template: WorkflowTemplates,
  sender: string,
  hideBranding?: boolean
) => {
  if (action === WorkflowActions.EMAIL_ADDRESS) return;
  const { startTime, endTime } = evt;
  const uid = evt.uid as string;
  const currentDate = dayjs();
  const timeUnit: timeUnitLowerCase | undefined = timeSpan.timeUnit?.toLocaleLowerCase() as timeUnitLowerCase;

  let scheduledDate = null;

  if (triggerEvent === WorkflowTriggerEvents.BEFORE_EVENT) {
    scheduledDate = timeSpan.time && timeUnit ? dayjs(startTime).subtract(timeSpan.time, timeUnit) : null;
  } else if (triggerEvent === WorkflowTriggerEvents.AFTER_EVENT) {
    scheduledDate = timeSpan.time && timeUnit ? dayjs(endTime).add(timeSpan.time, timeUnit) : null;
  }

  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_EMAIL) {
    console.error("Sendgrid credentials are missing from the .env file");
    return;
  }

  const sandboxMode = process.env.NEXT_PUBLIC_IS_E2E ? true : false;

  let name = "";
  let attendeeName = "";
  let timeZone = "";

  switch (action) {
    case WorkflowActions.EMAIL_HOST:
      name = evt.organizer.name;
      attendeeName = evt.attendees[0].name;
      timeZone = evt.organizer.timeZone;
      break;
    case WorkflowActions.EMAIL_ATTENDEE:
      name = evt.attendees[0].name;
      attendeeName = evt.organizer.name;
      timeZone = evt.attendees[0].timeZone;
      break;
  }

  let emailContent = {
    emailSubject,
    emailBody: `<body style="white-space: pre-wrap;">${emailBody}</body>`,
  };
  if (emailBody) {
    const variables: VariablesType = {
      eventName: evt.title || "",
      organizerName: evt.organizer.name,
      attendeeName: evt.attendees[0].name,
      attendeeEmail: evt.attendees[0].email,
      eventDate: dayjs(startTime).tz(timeZone),
      eventEndTime: dayjs(endTime).tz(timeZone),
      timeZone: timeZone,
      location: evt.location,
      additionalNotes: evt.additionalNotes,
      responses: evt.responses,
      meetingUrl: bookingMetadataSchema.parse(evt.metadata || {})?.videoCallUrl,
      cancelLink: `/booking/${evt.uid}?cancel=true`,
      rescheduleLink: `/${evt.organizer.username}/${evt.eventType.slug}?rescheduleUid=${evt.uid}`,
    };

    const locale =
      action === WorkflowActions.EMAIL_ATTENDEE || action === WorkflowActions.SMS_ATTENDEE
        ? evt.attendees[0].language?.locale
        : evt.organizer.language.locale;

    const emailSubjectTemplate = customTemplate(emailSubject, variables, locale, evt.organizer.timeFormat);
    emailContent.emailSubject = emailSubjectTemplate.text;
    emailContent.emailBody = customTemplate(
      emailBody,
      variables,
      locale,
      evt.organizer.timeFormat,
      hideBranding
    ).html;
  } else if (template === WorkflowTemplates.REMINDER) {
    emailContent = emailReminderTemplate(
      false,
      action,
      evt.organizer.timeFormat,
      startTime,
      endTime,
      evt.title,
      timeZone,
      attendeeName,
      name
    );
  }

  // Allows debugging generated email content without waiting for sendgrid to send emails
  log.debug(`Sending Email for trigger ${triggerEvent}`, JSON.stringify(emailContent));

  const batchIdResponse = await client.request({
    url: "/v3/mail/batch",
    method: "POST",
  });

  if (
    triggerEvent === WorkflowTriggerEvents.NEW_EVENT ||
    triggerEvent === WorkflowTriggerEvents.EVENT_CANCELLED ||
    triggerEvent === WorkflowTriggerEvents.RESCHEDULE_EVENT
  ) {
    try {
      if (Array.isArray(sendTo)) {
        for (const email of sendTo) {
          await sgMail.send({
            to: email,
            from: {
              email: senderEmail,
              name: sender,
            },
            subject: emailContent.emailSubject,
            html: emailContent.emailBody,
            batchId: batchIdResponse[1].batch_id,
            replyTo: evt.organizer.email,
            mailSettings: {
              sandboxMode: {
                enable: sandboxMode,
              },
            },
          });
        }
      } else {
        await sgMail.send({
          to: sendTo,
          from: {
            email: senderEmail,
            name: sender,
          },
          subject: emailContent.emailSubject,
          html: emailContent.emailBody,
          batchId: batchIdResponse[1].batch_id,
          replyTo: evt.organizer.email,
          mailSettings: {
            sandboxMode: {
              enable: sandboxMode,
            },
          },
        });
      }
    } catch (error) {
      console.log("Error sending Email");
    }
  } else if (
    (triggerEvent === WorkflowTriggerEvents.BEFORE_EVENT ||
      triggerEvent === WorkflowTriggerEvents.AFTER_EVENT) &&
    scheduledDate
  ) {
    // Sendgrid to schedule emails
    // Can only schedule at least 60 minutes and at most 72 hours in advance
    if (
      currentDate.isBefore(scheduledDate.subtract(1, "hour")) &&
      !scheduledDate.isAfter(currentDate.add(72, "hour"))
    ) {
      try {
        await sgMail.send({
          to: sendTo,
          from: {
            email: senderEmail,
            name: sender,
          },
          subject: emailContent.emailSubject,
          html: emailContent.emailBody,
          batchId: batchIdResponse[1].batch_id,
          sendAt: scheduledDate.unix(),
          replyTo: evt.organizer.email,
          mailSettings: {
            sandboxMode: {
              enable: sandboxMode,
            },
          },
        });

        await prisma.workflowReminder.create({
          data: {
            bookingUid: uid,
            workflowStepId: workflowStepId,
            method: WorkflowMethods.EMAIL,
            scheduledDate: scheduledDate.toDate(),
            scheduled: true,
            referenceId: batchIdResponse[1].batch_id,
          },
        });
      } catch (error) {
        console.log(`Error scheduling email with error ${error}`);
      }
    } else if (scheduledDate.isAfter(currentDate.add(72, "hour"))) {
      // Write to DB and send to CRON if scheduled reminder date is past 72 hours
      await prisma.workflowReminder.create({
        data: {
          bookingUid: uid,
          workflowStepId: workflowStepId,
          method: WorkflowMethods.EMAIL,
          scheduledDate: scheduledDate.toDate(),
          scheduled: false,
        },
      });
    }
  }
};

export const deleteScheduledEmailReminder = async (reminderId: number, referenceId: string | null) => {
  try {
    if (!referenceId) {
      await prisma.workflowReminder.delete({
        where: {
          id: reminderId,
        },
      });

      return;
    }

    await prisma.workflowReminder.update({
      where: {
        id: reminderId,
      },
      data: {
        cancelled: true,
      },
    });
  } catch (error) {
    console.log(`Error canceling reminder with error ${error}`);
  }
};
