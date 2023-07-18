import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo } from "react";
import { shallow } from "zustand/shallow";

import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import { Button, ButtonGroup, ToggleGroup } from "@calcom/ui";
import { Calendar, Columns, Grid } from "@calcom/ui/components/icon";

import { TimeFormatToggle } from "../../components/TimeFormatToggle";
import { useBookerStore } from "../store";
import type { BookerLayout } from "../types";

export function Header({
  extraDays,
  isMobile,
  enabledLayouts,
}: {
  extraDays: number;
  isMobile: boolean;
  enabledLayouts: BookerLayouts[];
}) {
  const { t } = useLocale();
  const [layout, setLayout] = useBookerStore((state) => [state.layout, state.setLayout], shallow);
  const selectedDateString = useBookerStore((state) => state.selectedDate);
  const setSelectedDate = useBookerStore((state) => state.setSelectedDate);
  const addToSelectedDate = useBookerStore((state) => state.addToSelectedDate);
  const isMonthView = layout === BookerLayouts.MONTH_VIEW;
  const selectedDate = dayjs(selectedDateString);
  const today = dayjs();
  const selectedDateMin3DaysDifference = useMemo(() => {
    const diff = today.diff(selectedDate, "days");
    return diff > 3 || diff < -3;
  }, [today, selectedDate]);

  const onLayoutToggle = useCallback(
    (newLayout: string) => {
      if (layout === newLayout || !newLayout) return;
      setLayout(newLayout as BookerLayout);
    },
    [setLayout, layout]
  );

  if (isMobile || !enabledLayouts) return null;

  // Only reason we create this component, is because it is used 3 times in this component,
  // and this way we can't forget to update one of the props in all places :)
  const LayoutToggleWithData = () => {
    return enabledLayouts.length <= 1 ? null : (
      <LayoutToggle onLayoutToggle={onLayoutToggle} layout={layout} enabledLayouts={enabledLayouts} />
    );
  };

  // In month view we only show the layout toggle.
  if (isMonthView) {
    return <LayoutToggleWithData />;
  }

  return (
    <div className="border-default relative z-10 flex border-b border-l px-5 py-4">
      <div className="flex items-center gap-3">
        <h3 className="min-w-[150px] text-base font-semibold leading-4">
          {selectedDate.format("MMM D")}-{selectedDate.add(extraDays, "days").format("D")},{" "}
          <span className="text-subtle">{selectedDate.format("YYYY")}</span>
        </h3>
        <ButtonGroup>
          <Button
            variant="icon"
            color="minimal"
            StartIcon={ChevronLeft}
            aria-label="Previous Day"
            onClick={() => addToSelectedDate(-extraDays - 1)}
          />
          <Button
            variant="icon"
            color="minimal"
            StartIcon={ChevronRight}
            aria-label="Next Day"
            onClick={() => addToSelectedDate(extraDays + 1)}
          />
          {selectedDateMin3DaysDifference && (
            <Button
              className="capitalize"
              color="secondary"
              onClick={() => setSelectedDate(today.format("YYYY-MM-DD"))}>
              {t("today")}
            </Button>
          )}
        </ButtonGroup>
      </div>
      <div className="ml-auto flex gap-2">
        <TimeFormatToggle />
        <div className="fixed right-4 top-4">
          <LayoutToggleWithData />
        </div>
        {/*
          This second layout toggle is hidden, but needed to reserve the correct spot in the DIV
          for the fixed toggle above to fit into. If we wouldn't make it fixed in this view, the transition
          would be really weird, because the element is positioned fixed in the month view, and then
          when switching layouts wouldn't anymmore, causing it to animate from the center to the top right,
          while it actuall already was on place. That's why we have this element twice.
        */}
        <div className="pointer-events-none opacity-0" aria-hidden>
          <LayoutToggleWithData />
        </div>
      </div>
    </div>
  );
}

const LayoutToggle = ({
  onLayoutToggle,
  layout,
  enabledLayouts,
}: {
  onLayoutToggle: (layout: string) => void;
  layout: string;
  enabledLayouts?: BookerLayouts[];
}) => {
  const isEmbed = typeof window !== "undefined" && window?.isEmbed?.();

  const { t } = useLocale();
  // We don't want to show the layout toggle in embed mode as of now as it doesn't look rightly placed when embedded.
  // There is a Embed API to control the layout toggle from outside of the iframe.
  if (isEmbed) {
    return null;
  }
  const layoutOptions = useMemo(() => {
    return [
      {
        value: BookerLayouts.MONTH_VIEW,
        label: <Calendar width="16" height="16" />,
        tooltip: t("switch_monthly"),
      },
      {
        value: BookerLayouts.WEEK_VIEW,
        label: <Grid width="16" height="16" />,
        tooltip: t("switch_weekly"),
      },
      {
        value: BookerLayouts.COLUMN_VIEW,
        label: <Columns width="16" height="16" />,
        tooltip: t("switch_columnview"),
      },
    ].filter((layout) => enabledLayouts?.includes(layout.value as BookerLayouts));
  }, [t, enabledLayouts]);

  return <ToggleGroup onValueChange={onLayoutToggle} defaultValue={layout} options={layoutOptions} />;
};
