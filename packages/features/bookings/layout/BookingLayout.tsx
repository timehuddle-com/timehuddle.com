import type { ComponentProps } from "react";
import React from "react";

import Shell from "@calcom/features/shell/Shell";
import { HorizontalTabs } from "@calcom/ui";
import type { VerticalTabItemProps, HorizontalTabItemProps } from "@calcom/ui";

import { FiltersContainer } from "../components/FiltersContainer";

const tabs: (VerticalTabItemProps | HorizontalTabItemProps)[] = [
  {
    name: "upcoming",
    href: "/bookings/upcoming",
  },
  {
    name: "unconfirmed",
    href: "/bookings/unconfirmed",
  },
  {
    name: "recurring",
    href: "/bookings/recurring",
  },
  {
    name: "past",
    href: "/bookings/past",
  },
  {
    name: "cancelled",
    href: "/bookings/cancelled",
  },
];

export default function BookingLayout({
  children,
  ...rest
}: { children: React.ReactNode } & ComponentProps<typeof Shell>) {
  return (
    <Shell {...rest} hideHeadingOnMobile>
      <div className="flex flex-col">
        <div className="flex flex-col flex-wrap lg:flex-row">
          <HorizontalTabs tabs={tabs} />
          <div className="max-w-full overflow-x-auto xl:ml-auto">
            <FiltersContainer />
          </div>
        </div>
        <main className="w-full">{children}</main>
      </div>
    </Shell>
  );
}
export const getLayout = (page: React.ReactElement) => <BookingLayout>{page}</BookingLayout>;
