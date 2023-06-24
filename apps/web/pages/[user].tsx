import classNames from "classnames";
import type { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { Toaster } from "react-hot-toast";

import {
  sdkActionManager,
  useEmbedNonStylesConfig,
  useEmbedStyles,
  useIsEmbed,
} from "@calcom/embed-core/embed-iframe";
import { orgDomainConfig } from "@calcom/features/ee/organizations/lib/orgDomains";
import { EventTypeDescriptionLazy as EventTypeDescription } from "@calcom/features/eventtypes/components";
import EmptyPage from "@calcom/features/eventtypes/components/EmptyPage";
import { WEBAPP_URL } from "@calcom/lib/constants";
import defaultEvents, {
  getDynamicEventDescription,
  getGroupName,
  getUsernameList,
  getUsernameSlugLink,
} from "@calcom/lib/defaultEvents";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import useTheme from "@calcom/lib/hooks/useTheme";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import { stripMarkdown } from "@calcom/lib/stripMarkdown";
import prisma from "@calcom/prisma";
import { baseEventTypeSelect } from "@calcom/prisma/selects";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import { Avatar, AvatarGroup, HeadSeo } from "@calcom/ui";
import { Verified, ArrowRight } from "@calcom/ui/components/icon";

import type { inferSSRProps } from "@lib/types/inferSSRProps";
import type { EmbedProps } from "@lib/withEmbedSsr";

import PageWrapper from "@components/PageWrapper";

import { ssrInit } from "@server/lib/ssr";

export type UserPageProps = inferSSRProps<typeof getServerSideProps> & EmbedProps;
export function UserPage(props: UserPageProps) {
  const {
    users,
    profile,
    eventTypes,
    isDynamicGroup,
    dynamicNames,
    dynamicUsernames,
    isSingleUser,
    markdownStrippedBio,
  } = props;
  const [user] = users; //To be used when we only have a single user, not dynamic group
  useTheme(user.theme);
  const { t } = useLocale();
  const router = useRouter();

  const isBioEmpty = !user.bio || !user.bio.replace("<p><br></p>", "").length;

  const groupEventTypes = props.users.some((user) => !user.allowDynamicBooking) ? (
    <div className="space-y-6" data-testid="event-types">
      <div className="overflow-hidden rounded-sm border ">
        <div className="text-muted p-8 text-center">
          <h2 className="font-cal text-default  mb-2 text-3xl">{" " + t("unavailable")}</h2>
          <p className="mx-auto max-w-md">{t("user_dynamic_booking_disabled") as string}</p>
        </div>
      </div>
    </div>
  ) : (
    <ul>
      {eventTypes.map((type, index) => (
        <li
          key={index}
          className=" border-subtle bg-default dark:bg-muted dark:hover:bg-emphasis hover:bg-muted group relative border-b first:rounded-t-md last:rounded-b-md last:border-b-0">
          <ArrowRight className="text-emphasis absolute right-3 top-3 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
          <Link
            href={getUsernameSlugLink({ users: props.users, slug: type.slug })}
            className="flex justify-between px-6 py-4"
            data-testid="event-type-link">
            <div className="flex-shrink">
              <p className=" text-emphasis text-sm font-semibold">{type.title}</p>
              <EventTypeDescription className="text-sm" eventType={type} />
            </div>
            <div className="mt-1 self-center">
              <AvatarGroup
                truncateAfter={4}
                className="flex flex-shrink-0"
                size="sm"
                items={props.users.map((user) => ({
                  alt: user.name || "",
                  image: user.avatar,
                }))}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );

  const isEmbed = useIsEmbed(props.isEmbed);
  const eventTypeListItemEmbedStyles = useEmbedStyles("eventTypeListItem");
  const shouldAlignCentrallyInEmbed = useEmbedNonStylesConfig("align") !== "left";
  const shouldAlignCentrally = !isEmbed || shouldAlignCentrallyInEmbed;
  const query = { ...router.query };
  delete query.user; // So it doesn't display in the Link (and make tests fail)
  delete query.orgSlug;
  const nameOrUsername = user.name || user.username || "";

  /*
   const telemetry = useTelemetry();
   useEffect(() => {
    if (top !== window) {
      //page_view will be collected automatically by _middleware.ts
      telemetry.event(telemetryEventTypes.embedView, collectPageParameters("/[user]"));
    }
  }, [telemetry, router.asPath]); */
  const isEventListEmpty = eventTypes.length === 0;
  return (
    <>
      <HeadSeo
        title={isDynamicGroup ? dynamicNames.join(", ") : nameOrUsername}
        description={isDynamicGroup ? `Book events with ${dynamicUsernames.join(", ")}` : markdownStrippedBio}
        meeting={{
          title: isDynamicGroup ? "" : markdownStrippedBio,
          profile: { name: `${profile.name}`, image: null },
          users: isDynamicGroup
            ? dynamicUsernames.map((username, index) => ({ username, name: dynamicNames[index] }))
            : [{ username: `${user.username}`, name: `${user.name}` }],
        }}
      />

      <div className={classNames(shouldAlignCentrally ? "mx-auto" : "", isEmbed ? "max-w-3xl" : "")}>
        <main
          className={classNames(
            shouldAlignCentrally ? "mx-auto" : "",
            isEmbed ? "border-booker border-booker-width  bg-default rounded-md border" : "",
            "max-w-3xl px-4 py-24"
          )}>
          {isSingleUser && ( // When we deal with a single user, not dynamic group
            <div className="mb-8 text-center">
              <Avatar imageSrc={user.avatar} size="xl" alt={nameOrUsername} />
              <h1 className="font-cal text-emphasis mb-1 text-3xl">
                {nameOrUsername}
                {user.verified && (
                  <Verified className=" mx-1 -mt-1 inline h-6 w-6 fill-blue-500 text-white dark:text-black" />
                )}
              </h1>
              {!isBioEmpty && (
                <>
                  <div
                    className="  text-subtle break-words text-sm [&_a]:text-blue-500 [&_a]:underline [&_a]:hover:text-blue-600"
                    dangerouslySetInnerHTML={{ __html: props.safeBio }}
                  />
                </>
              )}
            </div>
          )}

          <div
            className={classNames("rounded-md ", !isEventListEmpty && "border-subtle border")}
            data-testid="event-types">
            {user.away ? (
              <div className="overflow-hidden rounded-sm border ">
                <div className="text-muted  p-8 text-center">
                  <h2 className="font-cal text-default mb-2 text-3xl">😴{" " + t("user_away")}</h2>
                  <p className="mx-auto max-w-md">{t("user_away_description") as string}</p>
                </div>
              </div>
            ) : isDynamicGroup ? ( //When we deal with dynamic group (users > 1)
              groupEventTypes
            ) : (
              eventTypes.map((type) => (
                <div
                  key={type.id}
                  style={{ display: "flex", ...eventTypeListItemEmbedStyles }}
                  className="bg-default border-subtle dark:bg-muted dark:hover:bg-emphasis hover:bg-muted group relative border-b first:rounded-t-md last:rounded-b-md last:border-b-0">
                  <ArrowRight className="text-emphasis  absolute right-4 top-4 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  {/* Don't prefetch till the time we drop the amount of javascript in [user][type] page which is impacting score for [user] page */}
                  <div className="block w-full p-5">
                    <Link
                      prefetch={false}
                      href={{
                        pathname: `/${user.username}/${type.slug}`,
                        query,
                      }}
                      passHref
                      onClick={async () => {
                        sdkActionManager?.fire("eventTypeSelected", {
                          eventType: type,
                        });
                      }}
                      data-testid="event-type-link">
                      <div className="flex flex-wrap items-center">
                        <h2 className=" text-default pr-2 text-sm font-semibold">{type.title}</h2>
                      </div>
                      <EventTypeDescription eventType={type} isPublic={true} />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          {isEventListEmpty && <EmptyPage name={user.name ?? "User"} />}
        </main>
        <Toaster position="bottom-right" />
      </div>
    </>
  );
}

UserPage.isBookingPage = true;
UserPage.PageWrapper = PageWrapper;

const getEventTypesWithHiddenFromDB = async (userId: number) => {
  return (
    await prisma.eventType.findMany({
      where: {
        AND: [
          {
            teamId: null,
          },
          {
            OR: [
              {
                userId,
              },
              {
                users: {
                  some: {
                    id: userId,
                  },
                },
              },
            ],
          },
        ],
      },
      orderBy: [
        {
          position: "desc",
        },
        {
          id: "asc",
        },
      ],
      select: {
        ...baseEventTypeSelect,
        metadata: true,
      },
    })
  ).map((eventType) => ({
    ...eventType,
    metadata: EventTypeMetaDataSchema.parse(eventType.metadata),
  }));
};

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const ssr = await ssrInit(context);
  const crypto = await import("crypto");
  const { currentOrgDomain, isValidOrgDomain } = orgDomainConfig(context.req.headers.host ?? "");

  const usernameList = getUsernameList(context.query.user as string);
  const dataFetchStart = Date.now();
  const usersWithoutAvatar = await prisma.user.findMany({
    where: {
      username: {
        in: usernameList,
      },
      organization: isValidOrgDomain
        ? {
            slug: currentOrgDomain,
          }
        : null,
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      bio: true,
      brandColor: true,
      darkBrandColor: true,
      organizationId: true,
      theme: true,
      away: true,
      verified: true,
      allowDynamicBooking: true,
    },
  });

  const users = usersWithoutAvatar.map((user) => ({
    ...user,
    avatar: `${WEBAPP_URL}/${user.username}/avatar.png`,
  }));

  if (!users.length || (!isValidOrgDomain && !users.some((user) => user.organizationId === null))) {
    return {
      notFound: true,
    } as {
      notFound: true;
    };
  }
  const isDynamicGroup = users.length > 1;

  if (isDynamicGroup) {
    // sort and be in the same order as usernameList so first user is the first user in the list
    users.sort((a, b) => {
      const aIndex = (a.username && usernameList.indexOf(a.username)) || 0;
      const bIndex = (b.username && usernameList.indexOf(b.username)) || 0;
      return aIndex - bIndex;
    });
  }

  const dynamicNames = isDynamicGroup
    ? users.map((user) => {
        return user.name || "";
      })
    : [];
  const [user] = users; //to be used when dealing with single user, not dynamic group

  const profile = isDynamicGroup
    ? {
        name: getGroupName(dynamicNames),
        image: null,
        theme: null,
        weekStart: "Sunday",
        brandColor: "",
        darkBrandColor: "",
        allowDynamicBooking: !users.some((user) => {
          return !user.allowDynamicBooking;
        }),
      }
    : {
        name: user.name || user.username,
        image: user.avatar,
        theme: user.theme,
        brandColor: user.brandColor,
        darkBrandColor: user.darkBrandColor,
      };

  const eventTypesWithHidden = isDynamicGroup ? [] : await getEventTypesWithHiddenFromDB(user.id);
  const dataFetchEnd = Date.now();
  if (context.query.log === "1") {
    context.res.setHeader("X-Data-Fetch-Time", `${dataFetchEnd - dataFetchStart}ms`);
  }
  const eventTypesRaw = eventTypesWithHidden.filter((evt) => !evt.hidden);

  const eventTypes = eventTypesRaw.map((eventType) => ({
    ...eventType,
    metadata: EventTypeMetaDataSchema.parse(eventType.metadata || {}),
    descriptionAsSafeHTML: markdownToSafeHTML(eventType.description),
  }));

  const isSingleUser = users.length === 1;
  const dynamicUsernames = isDynamicGroup
    ? users.map((user) => {
        return user.username || "";
      })
    : [];

  const safeBio = markdownToSafeHTML(user.bio) || "";

  const markdownStrippedBio = stripMarkdown(user?.bio || "");

  return {
    props: {
      users,
      safeBio,
      profile,
      // Dynamic group has no theme preference right now. It uses system theme.
      themeBasis: isDynamicGroup ? null : user.username,
      user: {
        emailMd5: crypto.createHash("md5").update(user.email).digest("hex"),
      },
      eventTypes: isDynamicGroup
        ? defaultEvents.map((event) => {
            event.description = getDynamicEventDescription(dynamicUsernames, event.slug);
            return event;
          })
        : eventTypes,
      trpcState: ssr.dehydrate(),
      isDynamicGroup,
      dynamicNames,
      dynamicUsernames,
      isSingleUser,
      markdownStrippedBio,
    },
  };
};

export default UserPage;
