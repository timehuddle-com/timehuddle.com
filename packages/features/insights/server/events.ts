import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

interface ITimeRange {
  start: Dayjs;
  end: Dayjs;
}

type TimeViewType = "week" | "month" | "year" | "day";

class EventsInsights {
  static getBookingsInTimeRange = async (
    timeRange: ITimeRange,
    where: Prisma.BookingTimeStatusWhereInput
  ) => {
    const { start, end } = timeRange;

    const events = await prisma.bookingTimeStatus.count({
      where: {
        ...where,
        createdAt: {
          gte: start.toISOString(),
          lte: end.toISOString(),
        },
      },
    });

    return events;
  };

  static getCreatedEventsInTimeRange = async (
    timeRange: ITimeRange,
    where: Prisma.BookingTimeStatusWhereInput
  ) => {
    const result = await this.getBookingsInTimeRange(timeRange, where);

    return result;
  };

  static getCancelledEventsInTimeRange = async (
    timeRange: ITimeRange,
    where: Prisma.BookingTimeStatusWhereInput
  ) => {
    const result = await this.getBookingsInTimeRange(timeRange, {
      ...where,
      timeStatus: "cancelled",
    });

    return result;
  };

  static getCompletedEventsInTimeRange = async (
    timeRange: ITimeRange,
    where: Prisma.BookingTimeStatusWhereInput
  ) => {
    const result = await this.getBookingsInTimeRange(timeRange, {
      ...where,
      timeStatus: "completed",
    });

    return result;
  };

  static getRescheduledEventsInTimeRange = async (
    timeRange: ITimeRange,
    where: Prisma.BookingTimeStatusWhereInput
  ) => {
    const result = await this.getBookingsInTimeRange(timeRange, {
      ...where,
      timeStatus: "rescheduled",
    });

    return result;
  };

  static getBaseBookingCountForEventStatus = async (where: Prisma.BookingTimeStatusWhereInput) => {
    const baseBookings = await prisma.bookingTimeStatus.count({
      where,
    });

    return baseBookings;
  };

  static getTotalCompletedEvents = async (whereConditional: Prisma.BookingTimeStatusWhereInput) => {
    return await prisma.bookingTimeStatus.count({
      where: {
        ...whereConditional,
        timeStatus: "completed",
      },
    });
  };

  static getTotalRescheduledEvents = async (whereConditional: Prisma.BookingTimeStatusWhereInput) => {
    return await prisma.bookingTimeStatus.count({
      where: {
        ...whereConditional,
        timeStatus: "rescheduled",
      },
    });
  };

  static getTotalCancelledEvents = async (whereConditional: Prisma.BookingTimeStatusWhereInput) => {
    return await prisma.bookingTimeStatus.count({
      where: {
        ...whereConditional,
        timeStatus: "cancelled",
      },
    });
  };

  static getTimeLine = async (timeView: TimeViewType, startDate: Dayjs, endDate: Dayjs) => {
    let resultTimeLine: string[] = [];

    if (timeView) {
      switch (timeView) {
        case "day":
          resultTimeLine = this.getDailyTimeline(startDate, endDate);
          break;
        case "week":
          resultTimeLine = this.getWeekTimeline(startDate, endDate);
          break;
        case "month":
          resultTimeLine = this.getMonthTimeline(startDate, endDate);
          break;
        case "year":
          resultTimeLine = this.getYearTimeline(startDate, endDate);
          break;
        default:
          resultTimeLine = this.getWeekTimeline(startDate, endDate);
          break;
      }
    }

    return resultTimeLine;
  };

  static getTimeView = (timeView: TimeViewType, startDate: Dayjs, endDate: Dayjs) => {
    let resultTimeView = timeView;

    if (startDate.diff(endDate, "day") > 90) {
      resultTimeView = "month";
    } else if (startDate.diff(endDate, "day") > 365) {
      resultTimeView = "year";
    }

    return resultTimeView;
  };

  static getDailyTimeline(startDate: Dayjs, endDate: Dayjs): string[] {
    const now = dayjs();
    const endOfDay = now.endOf("day");
    let pivotDate = dayjs(startDate);
    const dates: string[] = [];
    while ((pivotDate.isBefore(endDate) || pivotDate.isSame(endDate)) && pivotDate.isBefore(endOfDay)) {
      dates.push(pivotDate.format("YYYY-MM-DD"));
      pivotDate = pivotDate.add(1, "day");
    }
    return dates;
  }

  static getWeekTimeline(startDate: Dayjs, endDate: Dayjs): string[] {
    const now = dayjs();
    const endOfDay = now.endOf("day");
    let pivotDate = dayjs(startDate);
    const dates: string[] = [];

    while (pivotDate.isBefore(endDate) || pivotDate.isSame(endDate)) {
      const pivotAdded = pivotDate.add(6, "day");
      const weekEndDate = pivotAdded.isBefore(endOfDay) ? pivotAdded : endOfDay;
      dates.push(pivotDate.format("YYYY-MM-DD"));

      if (pivotDate.isSame(endDate)) {
        break;
      }

      pivotDate = weekEndDate.add(1, "day");
    }

    return dates;
  }

  static getMonthTimeline(startDate: Dayjs, endDate: Dayjs) {
    let pivotDate = dayjs(startDate);
    const dates = [];
    while (pivotDate.isBefore(endDate)) {
      pivotDate = pivotDate.set("month", pivotDate.get("month") + 1);

      dates.push(pivotDate.format("YYYY-MM-DD"));
    }
    return dates;
  }

  static getYearTimeline(startDate: Dayjs, endDate: Dayjs) {
    const pivotDate = dayjs(startDate);
    const dates = [];
    while (pivotDate.isBefore(endDate)) {
      pivotDate.set("year", pivotDate.get("year") + 1);
      dates.push(pivotDate.format("YYYY-MM-DD"));
    }
    return dates;
  }

  static getPercentage = (actualMetric: number, previousMetric: number) => {
    const differenceActualVsPrevious = actualMetric - previousMetric;
    if (differenceActualVsPrevious === 0) {
      return 0;
    }
    const result = (differenceActualVsPrevious * 100) / previousMetric;
    if (isNaN(result) || !isFinite(result)) {
      return 0;
    }
    return result;
  };
}

export { EventsInsights };
