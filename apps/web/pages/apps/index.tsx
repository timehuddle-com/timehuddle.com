import type { GetServerSidePropsContext } from "next";
import type { ChangeEventHandler } from "react";
import { useState } from "react";

import { getAppRegistry, getAppRegistryWithCredentials } from "@calcom/app-store/_appRegistry";
import { getLayout } from "@calcom/features/MainLayout";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import getUserAdminTeams from "@calcom/features/ee/teams/lib/getUserAdminTeams";
import type { UserAdminTeams } from "@calcom/features/ee/teams/lib/getUserAdminTeams";
import { classNames } from "@calcom/lib";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { AppCategories } from "@calcom/prisma/enums";
import type { inferSSRProps } from "@calcom/types/inferSSRProps";
import type { HorizontalTabItemProps } from "@calcom/ui";
import {
  AllApps,
  AppStoreCategories,
  HorizontalTabs,
  TextField,
  PopularAppsSlider,
  RecentAppsSlider,
} from "@calcom/ui";
import { Search } from "@calcom/ui/components/icon";

import PageWrapper from "@components/PageWrapper";
import AppsLayout from "@components/apps/layouts/AppsLayout";

import { ssrInit } from "@server/lib/ssr";

const tabs: HorizontalTabItemProps[] = [
  {
    name: "app_store",
    href: "/apps",
  },
  {
    name: "installed_apps",
    href: "/apps/installed",
  },
];

function AppsSearch({
  onChange,
  className,
}: {
  onChange: ChangeEventHandler<HTMLInputElement>;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <TextField
      className="bg-subtle !border-muted !pl-0 focus:!ring-offset-0"
      addOnLeading={<Search className="text-subtle h-4 w-4" />}
      addOnClassname="!border-muted"
      containerClassName={classNames("focus:!ring-offset-0 m-1", className)}
      type="search"
      autoComplete="false"
      onChange={onChange}
      placeholder={t("search")}
    />
  );
}

export default function Apps({
  categories,
  appStore,
  userAdminTeams,
}: inferSSRProps<typeof getServerSideProps>) {
  const { t } = useLocale();
  const [searchText, setSearchText] = useState<string | undefined>(undefined);

  return (
    <AppsLayout
      isPublic
      heading={t("app_store")}
      subtitle={t("app_store_description")}
      actions={(className) => (
        <div className="flex w-full flex-col pt-4 md:flex-row md:justify-between md:pt-0 lg:w-auto">
          <div className="ltr:mr-2 rtl:ml-2 lg:hidden">
            <HorizontalTabs tabs={tabs} />
          </div>
          <div>
            <AppsSearch className={className} onChange={(e) => setSearchText(e.target.value)} />
          </div>
        </div>
      )}
      headerClassName="sm:hidden lg:block hidden"
      emptyStore={!appStore.length}>
      <div className="flex flex-col gap-y-8">
        {!searchText && (
          <>
            <AppStoreCategories categories={categories} />
            <PopularAppsSlider items={appStore} />
            <RecentAppsSlider items={appStore} />
          </>
        )}
        <AllApps
          apps={appStore}
          searchText={searchText}
          categories={categories.map((category) => category.name)}
          userAdminTeams={userAdminTeams}
        />
      </div>
    </AppsLayout>
  );
}

Apps.PageWrapper = PageWrapper;
Apps.getLayout = getLayout;

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const { req, res } = context;

  const ssr = await ssrInit(context);

  const session = await getServerSession({ req, res });

  let appStore, userAdminTeams: UserAdminTeams;
  if (session?.user?.id) {
    userAdminTeams = await getUserAdminTeams({ userId: session.user.id, getUserInfo: true });
    appStore = await getAppRegistryWithCredentials(session.user.id, userAdminTeams);
  } else {
    appStore = await getAppRegistry();
    userAdminTeams = [];
  }

  const categoryQuery = appStore.map(({ categories }) => ({
    categories: categories || [],
  }));
  const categories = categoryQuery.reduce((c, app) => {
    for (const category of app.categories) {
      c[category] = c[category] ? c[category] + 1 : 1;
    }
    return c;
  }, {} as Record<string, number>);

  return {
    props: {
      categories: Object.entries(categories)
        .map(([name, count]): { name: AppCategories; count: number } => ({
          name: name as AppCategories,
          count,
        }))
        .sort(function (a, b) {
          return b.count - a.count;
        }),
      appStore,
      userAdminTeams,
      trpcState: ssr.dehydrate(),
    },
  };
};
