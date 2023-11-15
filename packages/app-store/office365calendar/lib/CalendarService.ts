import type { Calendar as OfficeCalendar, User } from "@microsoft/microsoft-graph-types-beta";
import type { DefaultBodyType } from "msw";
import { z } from "zod";

import dayjs from "@calcom/dayjs";
import { getLocation, getRichDescription } from "@calcom/lib/CalEventParser";
import { handleErrorsJson, handleErrorsRaw } from "@calcom/lib/errors";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type { BufferedBusyTime } from "@calcom/types/BufferedBusyTime";
import type {
  Calendar,
  CalendarEvent,
  EventBusyDate,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";

import type { ParseRefreshTokenResponse } from "../../_utils/oauth/parseRefreshTokenResponse";
import parseRefreshTokenResponse from "../../_utils/oauth/parseRefreshTokenResponse";
import refreshOAuthTokens from "../../_utils/oauth/refreshOAuthTokens";
import type { O365AuthCredentials } from "../types/Office365Calendar";
import { getOfficeAppKeys } from "./getOfficeAppKeys";

interface IRequest {
  method: string;
  url: string;
  id: number;
}

interface ISettledResponse {
  id: string;
  status: number;
  headers: {
    "Retry-After": string;
    "Content-Type": string;
  };
  body: Record<string, DefaultBodyType>;
}

interface IBatchResponse {
  responses: ISettledResponse[];
}
interface BodyValue {
  showAs: string;
  end: { dateTime: string };
  evt: { showAs: string };
  start: { dateTime: string };
}

const refreshTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z
    .number()
    .transform((currentTimeOffsetInSeconds) => Math.round(+new Date() / 1000 + currentTimeOffsetInSeconds)),
  refresh_token: z.string().optional(),
});

export default class Office365CalendarService implements Calendar {
  private url = "";
  private integrationName = "";
  private log: typeof logger;
  private accessToken: string | null = null;
  auth: { getToken: () => Promise<string> };
  private apiGraphUrl = "https://graph.microsoft.com/v1.0";
  private credential: CredentialPayload;

  constructor(credential: CredentialPayload) {
    this.integrationName = "office365_calendar";
    this.auth = this.o365Auth(credential);
    this.credential = credential;
    this.log = logger.getSubLogger({ prefix: [`[[lib] ${this.integrationName}`] });
  }

  async createEvent(event: CalendarEvent, credentialId: number): Promise<NewCalendarEventType> {
    const mainHostDestinationCalendar = event.destinationCalendar
      ? event.destinationCalendar.find((cal) => cal.credentialId === credentialId) ??
        event.destinationCalendar[0]
      : undefined;
    try {
      const eventsUrl = mainHostDestinationCalendar?.externalId
        ? `/me/calendars/${mainHostDestinationCalendar?.externalId}/events`
        : "/me/calendar/events";

      const response = await this.fetcher(eventsUrl, {
        method: "POST",
        body: JSON.stringify(this.translateEvent(event)),
      });

      const responseJson = await handleErrorsJson<NewCalendarEventType & { iCalUId: string }>(response);

      return { ...responseJson, iCalUID: responseJson.iCalUId };
    } catch (error) {
      this.log.error(error);

      throw error;
    }
  }

  async updateEvent(uid: string, event: CalendarEvent): Promise<NewCalendarEventType> {
    try {
      const response = await this.fetcher(`/me/calendar/events/${uid}`, {
        method: "PATCH",
        body: JSON.stringify(this.translateEvent(event)),
      });

      const responseJson = await handleErrorsJson<NewCalendarEventType & { iCalUId: string }>(response);

      return { ...responseJson, iCalUID: responseJson.iCalUId };
    } catch (error) {
      this.log.error(error);

      throw error;
    }
  }

  async deleteEvent(uid: string): Promise<void> {
    try {
      const response = await this.fetcher(`/me/calendar/events/${uid}`, {
        method: "DELETE",
      });

      handleErrorsRaw(response);
    } catch (error) {
      this.log.error(error);

      throw error;
    }
  }

  async getAvailability(
    dateFrom: string,
    dateTo: string,
    selectedCalendars: IntegrationCalendar[]
  ): Promise<EventBusyDate[]> {
    const dateFromParsed = new Date(dateFrom);
    const dateToParsed = new Date(dateTo);

    const filter = `?startDateTime=${encodeURIComponent(
      dateFromParsed.toISOString()
    )}&endDateTime=${encodeURIComponent(dateToParsed.toISOString())}`;

    const calendarSelectParams = "$select=showAs,start,end";

    try {
      const selectedCalendarIds = selectedCalendars
        .filter((e) => e.integration === this.integrationName)
        .map((e) => e.externalId)
        .filter(Boolean);
      if (selectedCalendarIds.length === 0 && selectedCalendars.length > 0) {
        // Only calendars of other integrations selected
        return Promise.resolve([]);
      }

      const ids = await (selectedCalendarIds.length === 0
        ? this.listCalendars().then((cals) => cals.map((e_2) => e_2.externalId).filter(Boolean) || [])
        : Promise.resolve(selectedCalendarIds));
      const requests = ids.map((calendarId, id) => ({
        id,
        method: "GET",
        url: `/me/calendars/${calendarId}/calendarView${filter}&${calendarSelectParams}`,
      }));
      const response = await this.apiGraphBatchCall(requests);
      const responseBody = await this.handleErrorJsonOffice365Calendar(response);
      let responseBatchApi: IBatchResponse = { responses: [] };
      if (typeof responseBody === "string") {
        responseBatchApi = this.handleTextJsonResponseWithHtmlInBody(responseBody);
      }
      let alreadySuccessResponse = [] as ISettledResponse[];

      // Validate if any 429 status Retry-After is present
      const retryAfter =
        !!responseBatchApi?.responses && this.findRetryAfterResponse(responseBatchApi.responses);

      if (retryAfter && responseBatchApi.responses) {
        responseBatchApi = await this.fetchRequestWithRetryAfter(requests, responseBatchApi.responses, 2);
      }

      // Recursively fetch nextLink responses
      alreadySuccessResponse = await this.fetchResponsesWithNextLink(responseBatchApi.responses);

      return alreadySuccessResponse ? this.processBusyTimes(alreadySuccessResponse) : [];
    } catch (err) {
      console.log(err);
      return Promise.reject([]);
    }
  }

  async listCalendars(): Promise<IntegrationCalendar[]> {
    const officeCalendars: OfficeCalendar[] = [];
    // List calendars from MS are paginated
    let finishedParsingCalendars = false;
    const calendarFilterParam = "$select=id,name,isDefaultCalendar,canEdit";

    // Store @odata.nextLink if in response
    let requestLink = `/me/calendars?${calendarFilterParam}`;

    while (!finishedParsingCalendars) {
      const response = await this.fetcher(requestLink);
      let responseBody = await handleErrorsJson<{ value: OfficeCalendar[]; "@odata.nextLink"?: string }>(
        response
      );
      // If responseBody is valid then parse the JSON text
      if (typeof responseBody === "string") {
        responseBody = JSON.parse(responseBody) as { value: OfficeCalendar[] };
      }

      officeCalendars.push(...responseBody.value);

      if (responseBody["@odata.nextLink"]) {
        requestLink = responseBody["@odata.nextLink"].replace(this.apiGraphUrl, "");
      } else {
        finishedParsingCalendars = true;
      }
    }

    const user = await this.fetcher("/me");
    const userResponseBody = await handleErrorsJson<User>(user);
    const email = userResponseBody.mail ?? userResponseBody.userPrincipalName;

    return officeCalendars.map((cal: OfficeCalendar) => {
      const calendar: IntegrationCalendar = {
        externalId: cal.id ?? "No Id",
        integration: this.integrationName,
        name: cal.name ?? "No calendar name",
        primary: cal.isDefaultCalendar ?? false,
        readOnly: !cal.canEdit && true,
        email: email ?? "",
      };
      return calendar;
    });
  }

  private o365Auth = (credential: CredentialPayload) => {
    const isExpired = (expiryDate: number) => {
      if (!expiryDate) {
        return true;
      } else {
        return expiryDate < Math.round(+new Date() / 1000);
      }
    };
    const o365AuthCredentials = credential.key as O365AuthCredentials;

    const refreshAccessToken = async (o365AuthCredentials: O365AuthCredentials) => {
      const { client_id, client_secret } = await getOfficeAppKeys();
      const response = await refreshOAuthTokens(
        async () =>
          await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              scope: "User.Read Calendars.Read Calendars.ReadWrite",
              client_id,
              refresh_token: o365AuthCredentials.refresh_token,
              grant_type: "refresh_token",
              client_secret,
            }),
          }),
        "office365-calendar",
        credential.userId
      );
      const responseJson = await handleErrorsJson(response);
      const tokenResponse: ParseRefreshTokenResponse<typeof refreshTokenResponseSchema> =
        parseRefreshTokenResponse(responseJson, refreshTokenResponseSchema);
      o365AuthCredentials = { ...o365AuthCredentials, ...tokenResponse };
      await prisma.credential.update({
        where: {
          id: credential.id,
        },
        data: {
          key: o365AuthCredentials,
        },
      });
      return o365AuthCredentials.access_token;
    };

    return {
      getToken: () =>
        refreshTokenResponseSchema.safeParse(o365AuthCredentials).success &&
        !isExpired(o365AuthCredentials.expires_in)
          ? Promise.resolve(o365AuthCredentials.access_token)
          : refreshAccessToken(o365AuthCredentials),
    };
  };

  private translateEvent = (event: CalendarEvent) => {
    return {
      subject: event.title,
      body: {
        contentType: "HTML",
        content: getRichDescription(event),
      },
      start: {
        dateTime: dayjs(event.startTime).tz(event.organizer.timeZone).format("YYYY-MM-DDTHH:mm:ss"),
        timeZone: event.organizer.timeZone,
      },
      end: {
        dateTime: dayjs(event.endTime).tz(event.organizer.timeZone).format("YYYY-MM-DDTHH:mm:ss"),
        timeZone: event.organizer.timeZone,
      },
      attendees: [
        // Add the calEvent organizer
        {
          emailAddress: {
            address: event.destinationCalendar
              ? event.destinationCalendar.find((cal) => cal.userId === event.organizer.id)?.externalId ??
                event.organizer.email
              : event.organizer.email,
            name: event.organizer.name,
          },
        },
        ...event.attendees.map((attendee) => ({
          emailAddress: {
            address: attendee.email,
            name: attendee.name,
          },
          type: "required",
        })),
        ...(event.team?.members
          ? event.team?.members
              .filter((member) => member.email !== this.credential.user?.email)
              .map((member) => {
                const destinationCalendar =
                  event.destinationCalendar &&
                  event.destinationCalendar.find((cal) => cal.userId === member.id);
                return {
                  emailAddress: {
                    address: destinationCalendar?.externalId ?? member.email,
                    name: member.name,
                  },
                  type: "required",
                };
              })
          : []),
      ],
      location: event.location ? { displayName: getLocation(event) } : undefined,
    };
  };

  private fetcher = async (endpoint: string, init?: RequestInit | undefined) => {
    this.accessToken = await this.auth.getToken();
    return fetch(`${this.apiGraphUrl}${endpoint}`, {
      method: "get",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      ...init,
    });
  };

  private fetchResponsesWithNextLink = async (
    settledResponses: ISettledResponse[]
  ): Promise<ISettledResponse[]> => {
    const alreadySuccess = [] as ISettledResponse[];
    const newLinkRequest = [] as IRequest[];
    settledResponses?.forEach((response) => {
      if (response.status === 200 && response.body["@odata.nextLink"] === undefined) {
        alreadySuccess.push(response);
      } else {
        const nextLinkUrl = response.body["@odata.nextLink"]
          ? String(response.body["@odata.nextLink"]).replace(this.apiGraphUrl, "")
          : "";
        if (nextLinkUrl) {
          // Saving link for later use
          newLinkRequest.push({
            id: Number(response.id),
            method: "GET",
            url: nextLinkUrl,
          });
        }
        delete response.body["@odata.nextLink"];
        // Pushing success body content
        alreadySuccess.push(response);
      }
    });

    if (newLinkRequest.length === 0) {
      return alreadySuccess;
    }

    const newResponse = await this.apiGraphBatchCall(newLinkRequest);
    let newResponseBody = await handleErrorsJson<IBatchResponse | string>(newResponse);

    if (typeof newResponseBody === "string") {
      newResponseBody = this.handleTextJsonResponseWithHtmlInBody(newResponseBody);
    }

    // Going recursive to fetch next link
    const newSettledResponses = await this.fetchResponsesWithNextLink(newResponseBody.responses);
    return [...alreadySuccess, ...newSettledResponses];
  };

  private fetchRequestWithRetryAfter = async (
    originalRequests: IRequest[],
    settledPromises: ISettledResponse[],
    maxRetries: number,
    retryCount = 0
  ): Promise<IBatchResponse> => {
    let retryAfterTimeout = 0;
    if (retryCount >= maxRetries) {
      return { responses: settledPromises };
    }
    const alreadySuccessRequest = [] as ISettledResponse[];
    const failedRequest = [] as IRequest[];
    settledPromises.forEach((item) => {
      if (item.status === 200) {
        alreadySuccessRequest.push(item);
      } else if (item.status === 429) {
        const newTimeout = Number(item.headers["Retry-After"]) * 1000 || 0;
        retryAfterTimeout = newTimeout > retryAfterTimeout ? newTimeout : retryAfterTimeout;
        failedRequest.push(originalRequests[Number(item.id)]);
      }
    });

    if (failedRequest.length === 0) {
      return { responses: alreadySuccessRequest };
    }

    // Await certain time from retry-after header
    await new Promise((r) => setTimeout(r, retryAfterTimeout));

    const newResponses = await this.apiGraphBatchCall(failedRequest);
    let newResponseBody = await handleErrorsJson<IBatchResponse | string>(newResponses);
    if (typeof newResponseBody === "string") {
      newResponseBody = this.handleTextJsonResponseWithHtmlInBody(newResponseBody);
    }
    const retryAfter = !!newResponseBody?.responses && this.findRetryAfterResponse(newResponseBody.responses);

    if (retryAfter && newResponseBody.responses) {
      newResponseBody = await this.fetchRequestWithRetryAfter(
        failedRequest,
        newResponseBody.responses,
        maxRetries,
        retryCount + 1
      );
    }
    return { responses: [...alreadySuccessRequest, ...(newResponseBody?.responses || [])] };
  };

  private apiGraphBatchCall = async (requests: IRequest[]): Promise<Response> => {
    const response = await this.fetcher(`/$batch`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });

    return response;
  };

  private handleTextJsonResponseWithHtmlInBody = (response: string): IBatchResponse => {
    try {
      const parsedJson = JSON.parse(response);
      return parsedJson;
    } catch (error) {
      // Looking for html in body
      const openTag = '"body":<';
      const closeTag = "</html>";
      const htmlBeginning = response.indexOf(openTag) + openTag.length - 1;
      const htmlEnding = response.indexOf(closeTag) + closeTag.length + 2;
      const resultString = `${response.repeat(1).substring(0, htmlBeginning)} ""${response
        .repeat(1)
        .substring(htmlEnding, response.length)}`;

      return JSON.parse(resultString);
    }
  };

  private findRetryAfterResponse = (response: ISettledResponse[]) => {
    const foundRetry = response.find((request: ISettledResponse) => request.status === 429);
    return !!foundRetry;
  };

  private processBusyTimes = (responses: ISettledResponse[]) => {
    return responses.reduce(
      (acc: BufferedBusyTime[], subResponse: { body: { value?: BodyValue[]; error?: Error[] } }) => {
        if (!subResponse.body?.value) return acc;
        return acc.concat(
          subResponse.body.value.reduce((acc: BufferedBusyTime[], evt: BodyValue) => {
            if (evt.showAs === "free" || evt.showAs === "workingElsewhere") return acc;
            return acc.concat({
              start: `${evt.start.dateTime}Z`,
              end: `${evt.end.dateTime}Z`,
            });
          }, [])
        );
      },
      []
    );
  };

  private handleErrorJsonOffice365Calendar = <Type>(response: Response): Promise<Type | string> => {
    if (response.headers.get("content-encoding") === "gzip") {
      return response.text();
    }

    if (response.status === 204) {
      return new Promise((resolve) => resolve({} as Type));
    }

    if (!response.ok && response.status < 200 && response.status >= 300) {
      response.json().then(console.log);
      throw Error(response.statusText);
    }

    return response.json();
  };
}
