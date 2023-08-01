import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { User } from "@prisma/client";
import { Trans } from "next-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { FC } from "react";
import { useEffect, useState, memo } from "react";
import { z } from "zod";

import { useOrgBranding } from "@calcom/features/ee/organizations/context/provider";
import useIntercom from "@calcom/features/ee/support/lib/intercom/useIntercom";
import { EventTypeDescriptionLazy as EventTypeDescription } from "@calcom/features/eventtypes/components";
import CreateEventTypeDialog from "@calcom/features/eventtypes/components/CreateEventTypeDialog";
import { DuplicateDialog } from "@calcom/features/eventtypes/components/DuplicateDialog";
import { TeamsFilter } from "@calcom/features/filters/components/TeamsFilter";
import { getTeamsFiltersFromQuery } from "@calcom/features/filters/lib/getTeamsFiltersFromQuery";
import Shell from "@calcom/features/shell/Shell";
import { APP_NAME, CAL_URL, WEBAPP_URL } from "@calcom/lib/constants";
import { useBookerUrl } from "@calcom/lib/hooks/useBookerUrl";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import useMediaQuery from "@calcom/lib/hooks/useMediaQuery";
import { useTypedQuery } from "@calcom/lib/hooks/useTypedQuery";
import { HttpError } from "@calcom/lib/http-error";
import { SchedulingType } from "@calcom/prisma/enums";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc, TRPCClientError } from "@calcom/trpc/react";
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  ButtonGroup,
  ConfirmationDialogContent,
  Dialog,
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyScreen,
  showToast,
  Switch,
  Tooltip,
  CreateButton,
  HorizontalTabs,
  HeadSeo,
  Skeleton,
  Label,
  Alert,
} from "@calcom/ui";
import {
  ArrowDown,
  ArrowUp,
  Clipboard,
  Code,
  Copy,
  Edit,
  Edit2,
  ExternalLink,
  Link as LinkIcon,
  MoreHorizontal,
  Trash,
  Upload,
  Users,
  User as UserIcon,
} from "@calcom/ui/components/icon";

import useMeQuery from "@lib/hooks/useMeQuery";

import { EmbedButton, EmbedDialog } from "@components/Embed";
import PageWrapper from "@components/PageWrapper";
import SkeletonLoader from "@components/eventtype/SkeletonLoader";

type EventTypeGroups = RouterOutputs["viewer"]["eventTypes"]["getByViewer"]["eventTypeGroups"];
type EventTypeGroupProfile = EventTypeGroups[number]["profile"];
type GetByViewerResponse = RouterOutputs["viewer"]["eventTypes"]["getByViewer"] | undefined;

interface EventTypeListHeadingProps {
  profile: EventTypeGroupProfile;
  membershipCount: number;
  teamId?: number | null;
  orgSlug?: string;
}

type EventTypeGroup = EventTypeGroups[number];
type EventType = EventTypeGroup["eventTypes"][number];

interface EventTypeListProps {
  group: EventTypeGroup;
  groupIndex: number;
  readOnly: boolean;
  types: EventType[];
}

interface MobileTeamsTabProps {
  eventTypeGroups: EventTypeGroups;
}

const querySchema = z.object({
  teamId: z.nullable(z.coerce.number()).optional().default(null),
});

const MobileTeamsTab: FC<MobileTeamsTabProps> = (props) => {
  const { eventTypeGroups } = props;
  const orgBranding = useOrgBranding();
  const tabs = eventTypeGroups.map((item) => ({
    name: item.profile.name ?? "",
    href: item.teamId ? `/event-types?teamId=${item.teamId}` : "/event-types",
    avatar: item.profile.image ?? `${orgBranding?.fullDomain ?? WEBAPP_URL}/${item.profile.slug}/avatar.png`,
  }));
  const { data } = useTypedQuery(querySchema);
  const events = eventTypeGroups.filter((item) => item.teamId === data.teamId);

  return (
    <div>
      <HorizontalTabs tabs={tabs} />
      {events.length && (
        <EventTypeList
          types={events[0].eventTypes}
          group={events[0]}
          groupIndex={0}
          readOnly={events[0].metadata.readOnly}
        />
      )}
    </div>
  );
};

const Item = ({ type, group, readOnly }: { type: EventType; group: EventTypeGroup; readOnly: boolean }) => {
  const { t } = useLocale();

  const content = () => (
    <div>
      <span
        className="text-default font-semibold ltr:mr-1 rtl:ml-1"
        data-testid={"event-type-title-" + type.id}>
        {type.title}
      </span>
      {group.profile.slug ? (
        <small
          className="text-subtle hidden font-normal leading-4 sm:inline"
          data-testid={"event-type-slug-" + type.id}>
          {`/${
            type.schedulingType !== SchedulingType.MANAGED ? group.profile.slug : t("username_placeholder")
          }/${type.slug}`}
        </small>
      ) : null}
      {readOnly && (
        <Badge variant="gray" className="ml-2">
          {t("readonly")}
        </Badge>
      )}
    </div>
  );

  return readOnly ? (
    <div className="flex-1 overflow-hidden pr-4 text-sm">
      {content()}
      <EventTypeDescription
        // @ts-expect-error FIXME: We have a type mismatch here @hariombalhara @sean-brydon
        eventType={type}
        shortenDescription
      />
    </div>
  ) : (
    <Link
      href={`/event-types/${type.id}?tabName=setup`}
      className="flex-1 overflow-hidden pr-4 text-sm"
      title={type.title}>
      <div>
        <span
          className="text-default font-semibold ltr:mr-1 rtl:ml-1"
          data-testid={"event-type-title-" + type.id}>
          {type.title}
        </span>
        {group.profile.slug ? (
          <small
            className="text-subtle hidden font-normal leading-4 sm:inline"
            data-testid={"event-type-slug-" + type.id}>
            {`/${group.profile.slug}/${type.slug}`}
          </small>
        ) : null}
        {readOnly && (
          <Badge variant="gray" className="ml-2">
            {t("readonly")}
          </Badge>
        )}
      </div>
      <EventTypeDescription
        // @ts-expect-error FIXME: We have a type mismatch here @hariombalhara @sean-brydon
        eventType={{ ...type, descriptionAsSafeHTML: type.safeDescription }}
        shortenDescription
      />
    </Link>
  );
};

const MemoizedItem = memo(Item);

export const EventTypeList = ({ group, groupIndex, readOnly, types }: EventTypeListProps): JSX.Element => {
  const { t } = useLocale();
  const router = useRouter();
  const orgBranding = useOrgBranding();
  const [parent] = useAutoAnimate<HTMLUListElement>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogTypeId, setDeleteDialogTypeId] = useState(0);
  const [deleteDialogTypeSchedulingType, setDeleteDialogSchedulingType] = useState<SchedulingType | null>(
    null
  );
  const utils = trpc.useContext();
  const mutation = trpc.viewer.eventTypeOrder.useMutation({
    onError: async (err) => {
      console.error(err.message);
      await utils.viewer.eventTypes.getByViewer.cancel();
      // REVIEW: Should we invalidate the entire router or just the `getByViewer` query?
      await utils.viewer.eventTypes.invalidate();
    },
    onSettled: () => {
      // REVIEW: Should we invalidate the entire router or just the `getByViewer` query?
      utils.viewer.eventTypes.invalidate();
    },
  });

  const setHiddenMutation = trpc.viewer.eventTypes.update.useMutation({
    onMutate: async ({ id }) => {
      await utils.viewer.eventTypes.getByViewer.cancel();
      const previousValue = utils.viewer.eventTypes.getByViewer.getData();
      if (previousValue) {
        const newList = [...types];
        const itemIndex = newList.findIndex((item) => item.id === id);
        if (itemIndex !== -1 && newList[itemIndex]) {
          newList[itemIndex].hidden = !newList[itemIndex].hidden;
        }
        utils.viewer.eventTypes.getByViewer.setData(undefined, {
          ...previousValue,
          eventTypeGroups: [
            ...previousValue.eventTypeGroups.slice(0, groupIndex),
            { ...group, eventTypes: newList },
            ...previousValue.eventTypeGroups.slice(groupIndex + 1),
          ],
        });
      }
      return { previousValue };
    },
    onError: async (err, _, context) => {
      if (context?.previousValue) {
        utils.viewer.eventTypes.getByViewer.setData(undefined, context.previousValue);
      }
      console.error(err.message);
    },
    onSettled: () => {
      // REVIEW: Should we invalidate the entire router or just the `getByViewer` query?
      utils.viewer.eventTypes.invalidate();
    },
  });

  async function moveEventType(index: number, increment: 1 | -1) {
    const newList = [...types];

    const type = types[index];
    const tmp = types[index + increment];
    if (tmp) {
      newList[index] = tmp;
      newList[index + increment] = type;
    }

    await utils.viewer.eventTypes.getByViewer.cancel();

    const previousValue = utils.viewer.eventTypes.getByViewer.getData();
    if (previousValue) {
      utils.viewer.eventTypes.getByViewer.setData(undefined, {
        ...previousValue,
        eventTypeGroups: [
          ...previousValue.eventTypeGroups.slice(0, groupIndex),
          { ...group, eventTypes: newList },
          ...previousValue.eventTypeGroups.slice(groupIndex + 1),
        ],
      });
    }

    mutation.mutate({
      ids: newList.map((type) => type.id),
    });
  }

  async function deleteEventTypeHandler(id: number) {
    const payload = { id };
    deleteMutation.mutate(payload);
  }

  // inject selection data into url for correct router history
  const openDuplicateModal = (eventType: EventType, group: EventTypeGroup) => {
    const query = {
      ...router.query,
      dialog: "duplicate",
      title: eventType.title,
      description: eventType.description,
      slug: eventType.slug,
      id: eventType.id,
      length: eventType.length,
      pageSlug: group.profile.slug,
    };

    router.push(
      {
        pathname: router.pathname,
        query,
      },
      undefined,
      { shallow: true }
    );
  };

  const deleteMutation = trpc.viewer.eventTypes.delete.useMutation({
    onSuccess: () => {
      showToast(t("event_type_deleted_successfully"), "success");
      setDeleteDialogOpen(false);
    },
    onMutate: async ({ id }) => {
      await utils.viewer.eventTypes.getByViewer.cancel();
      const previousValue = utils.viewer.eventTypes.getByViewer.getData();
      if (previousValue) {
        const newList = types.filter((item) => item.id !== id);

        utils.viewer.eventTypes.getByViewer.setData(undefined, {
          ...previousValue,
          eventTypeGroups: [
            ...previousValue.eventTypeGroups.slice(0, groupIndex),
            { ...group, eventTypes: newList },
            ...previousValue.eventTypeGroups.slice(groupIndex + 1),
          ],
        });
      }
      return { previousValue };
    },
    onError: (err, _, context) => {
      if (context?.previousValue) {
        utils.viewer.eventTypes.getByViewer.setData(undefined, context.previousValue);
      }
      if (err instanceof HttpError) {
        const message = `${err.statusCode}: ${err.message}`;
        showToast(message, "error");
        setDeleteDialogOpen(false);
      } else if (err instanceof TRPCClientError) {
        showToast(err.message, "error");
      }
    },
    onSettled: () => {
      // REVIEW: Should we invalidate the entire router or just the `getByViewer` query?
      utils.viewer.eventTypes.invalidate();
    },
  });

  const [isNativeShare, setNativeShare] = useState(true);

  useEffect(() => {
    if (!navigator.share) {
      setNativeShare(false);
    }
  }, []);

  const firstItem = types[0];
  const lastItem = types[types.length - 1];
  const isManagedEventPrefix = () => {
    return deleteDialogTypeSchedulingType === SchedulingType.MANAGED ? "_managed" : "";
  };
  return (
    <div className="bg-default border-subtle mb-16 flex overflow-hidden rounded-md border">
      <ul ref={parent} className="divide-subtle !static w-full divide-y" data-testid="event-types">
        {types.map((type, index) => {
          const embedLink = `${group.profile.slug}/${type.slug}`;
          const calLink = `${orgBranding?.fullDomain ?? CAL_URL}/${embedLink}`;
          const isManagedEventType = type.schedulingType === SchedulingType.MANAGED;
          const isChildrenManagedEventType =
            type.metadata?.managedEventConfig !== undefined && type.schedulingType !== SchedulingType.MANAGED;
          return (
            <li key={type.id}>
              <div className="hover:bg-muted flex w-full items-center justify-between">
                <div className="group flex w-full max-w-full items-center justify-between overflow-hidden px-4 py-4 sm:px-6">
                  {!(firstItem && firstItem.id === type.id) && (
                    <button
                      className="bg-default text-muted hover:text-emphasis border-default hover:border-emphasis invisible absolute left-[5px] -ml-4 -mt-4 mb-4 hidden h-6 w-6 scale-0 items-center justify-center rounded-md border p-1 transition-all group-hover:visible group-hover:scale-100 sm:ml-0 sm:flex lg:left-[36px]"
                      onClick={() => moveEventType(index, -1)}>
                      <ArrowUp className="h-5 w-5" />
                    </button>
                  )}

                  {!(lastItem && lastItem.id === type.id) && (
                    <button
                      className="bg-default text-muted border-default hover:text-emphasis hover:border-emphasis invisible absolute left-[5px] -ml-4 mt-8 hidden h-6 w-6  scale-0 items-center justify-center rounded-md border p-1 transition-all  group-hover:visible group-hover:scale-100 sm:ml-0 sm:flex lg:left-[36px]"
                      onClick={() => moveEventType(index, 1)}>
                      <ArrowDown className="h-5 w-5" />
                    </button>
                  )}
                  <MemoizedItem type={type} group={group} readOnly={readOnly} />
                  <div className="mt-4 hidden sm:mt-0 sm:flex">
                    <div className="flex justify-between space-x-2 rtl:space-x-reverse">
                      {type.team && !isManagedEventType && (
                        <AvatarGroup
                          className="relative right-3 top-1"
                          size="sm"
                          truncateAfter={4}
                          items={type.users.map(
                            (organizer: { name: string | null; username: string | null }) => ({
                              alt: organizer.name || "",
                              image: `${orgBranding?.fullDomain ?? WEBAPP_URL}/${
                                organizer.username
                              }/avatar.png`,
                              title: organizer.name || "",
                            })
                          )}
                        />
                      )}
                      {isManagedEventType && (
                        <AvatarGroup
                          className="relative right-3 top-1"
                          size="sm"
                          truncateAfter={4}
                          items={type.children
                            .flatMap((ch) => ch.users)
                            .map((user: Pick<User, "name" | "username">) => ({
                              alt: user.name || "",
                              image: `${orgBranding?.fullDomain ?? WEBAPP_URL}/${user.username}/avatar.png`,
                              title: user.name || "",
                            }))}
                        />
                      )}
                      <div className="flex items-center justify-between space-x-2 rtl:space-x-reverse">
                        {!isManagedEventType && (
                          <>
                            {type.hidden && <Badge variant="gray">{t("hidden")}</Badge>}
                            <Tooltip
                              content={type.hidden ? t("show_eventtype_on_profile") : t("hide_from_profile")}>
                              <div className="self-center rounded-md p-2">
                                <Switch
                                  name="Hidden"
                                  checked={!type.hidden}
                                  onCheckedChange={() => {
                                    setHiddenMutation.mutate({ id: type.id, hidden: !type.hidden });
                                  }}
                                />
                              </div>
                            </Tooltip>
                          </>
                        )}

                        <ButtonGroup combined>
                          {!isManagedEventType && (
                            <>
                              <Tooltip content={t("preview")}>
                                <Button
                                  data-testid="preview-link-button"
                                  color="secondary"
                                  target="_blank"
                                  variant="icon"
                                  href={calLink}
                                  StartIcon={ExternalLink}
                                />
                              </Tooltip>

                              <Tooltip content={t("copy_link")}>
                                <Button
                                  color="secondary"
                                  variant="icon"
                                  StartIcon={LinkIcon}
                                  onClick={() => {
                                    showToast(t("link_copied"), "success");
                                    navigator.clipboard.writeText(calLink);
                                  }}
                                />
                              </Tooltip>
                            </>
                          )}
                          <Dropdown modal={false}>
                            <DropdownMenuTrigger asChild data-testid={"event-type-options-" + type.id}>
                              <Button
                                type="button"
                                variant="icon"
                                color="secondary"
                                StartIcon={MoreHorizontal}
                                className="ltr:radix-state-open:rounded-r-md rtl:radix-state-open:rounded-l-md"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {!readOnly && (
                                <DropdownMenuItem>
                                  <DropdownItem
                                    type="button"
                                    data-testid={"event-type-edit-" + type.id}
                                    StartIcon={Edit2}
                                    onClick={() => router.push("/event-types/" + type.id)}>
                                    {t("edit")}
                                  </DropdownItem>
                                </DropdownMenuItem>
                              )}
                              {!isManagedEventType && !isChildrenManagedEventType && (
                                <>
                                  <DropdownMenuItem className="outline-none">
                                    <DropdownItem
                                      type="button"
                                      data-testid={"event-type-duplicate-" + type.id}
                                      StartIcon={Copy}
                                      onClick={() => openDuplicateModal(type, group)}>
                                      {t("duplicate")}
                                    </DropdownItem>
                                  </DropdownMenuItem>
                                </>
                              )}
                              {!isManagedEventType && (
                                <DropdownMenuItem className="outline-none">
                                  <EmbedButton
                                    as={DropdownItem}
                                    type="button"
                                    StartIcon={Code}
                                    className="w-full rounded-none"
                                    embedUrl={encodeURIComponent(embedLink)}
                                    eventId={type.id}>
                                    {t("embed")}
                                  </EmbedButton>
                                </DropdownMenuItem>
                              )}
                              {/* readonly is only set when we are on a team - if we are on a user event type null will be the value. */}
                              {(group.metadata?.readOnly === false || group.metadata.readOnly === null) &&
                                !isChildrenManagedEventType && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                      <DropdownItem
                                        color="destructive"
                                        onClick={() => {
                                          setDeleteDialogOpen(true);
                                          setDeleteDialogTypeId(type.id);
                                          setDeleteDialogSchedulingType(type.schedulingType);
                                        }}
                                        StartIcon={Trash}
                                        className="w-full rounded-none">
                                        {t("delete")}
                                      </DropdownItem>
                                    </DropdownMenuItem>
                                  </>
                                )}
                            </DropdownMenuContent>
                          </Dropdown>
                        </ButtonGroup>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="min-w-9 mx-5 flex sm:hidden">
                  <Dropdown>
                    <DropdownMenuTrigger asChild data-testid={"event-type-options-" + type.id}>
                      <Button type="button" variant="icon" color="secondary" StartIcon={MoreHorizontal} />
                    </DropdownMenuTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuContent>
                        {!isManagedEventType && (
                          <>
                            <DropdownMenuItem className="outline-none">
                              <DropdownItem
                                href={calLink}
                                target="_blank"
                                StartIcon={ExternalLink}
                                className="w-full rounded-none">
                                {t("preview")}
                              </DropdownItem>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="outline-none">
                              <DropdownItem
                                data-testid={"event-type-duplicate-" + type.id}
                                onClick={() => {
                                  navigator.clipboard.writeText(calLink);
                                  showToast(t("link_copied"), "success");
                                }}
                                StartIcon={Clipboard}
                                className="w-full rounded-none text-left">
                                {t("copy_link")}
                              </DropdownItem>
                            </DropdownMenuItem>
                          </>
                        )}
                        {isNativeShare ? (
                          <DropdownMenuItem className="outline-none">
                            <DropdownItem
                              data-testid={"event-type-duplicate-" + type.id}
                              onClick={() => {
                                navigator
                                  .share({
                                    title: t("share"),
                                    text: t("share_event", { appName: APP_NAME }),
                                    url: calLink,
                                  })
                                  .then(() => showToast(t("link_shared"), "success"))
                                  .catch(() => showToast(t("failed"), "error"));
                              }}
                              StartIcon={Upload}
                              className="w-full rounded-none">
                              {t("share")}
                            </DropdownItem>
                          </DropdownMenuItem>
                        ) : null}
                        {!readOnly && (
                          <DropdownMenuItem className="outline-none">
                            <DropdownItem
                              onClick={() => router.push("/event-types/" + type.id)}
                              StartIcon={Edit}
                              className="w-full rounded-none">
                              {t("edit")}
                            </DropdownItem>
                          </DropdownMenuItem>
                        )}
                        {!isManagedEventType && !isChildrenManagedEventType && (
                          <DropdownMenuItem className="outline-none">
                            <DropdownItem
                              onClick={() => openDuplicateModal(type, group)}
                              StartIcon={Copy}
                              data-testid={"event-type-duplicate-" + type.id}>
                              {t("duplicate")}
                            </DropdownItem>
                          </DropdownMenuItem>
                        )}
                        {/* readonly is only set when we are on a team - if we are on a user event type null will be the value. */}
                        {(group.metadata?.readOnly === false || group.metadata.readOnly === null) &&
                          !isChildrenManagedEventType && (
                            <>
                              <DropdownMenuItem className="outline-none">
                                <DropdownItem
                                  color="destructive"
                                  onClick={() => {
                                    setDeleteDialogOpen(true);
                                    setDeleteDialogTypeId(type.id);
                                    setDeleteDialogSchedulingType(type.schedulingType);
                                  }}
                                  StartIcon={Trash}
                                  className="w-full rounded-none">
                                  {t("delete")}
                                </DropdownItem>
                              </DropdownMenuItem>
                            </>
                          )}
                        <DropdownMenuSeparator />
                        {!isManagedEventType && (
                          <div className="hover:bg-subtle flex h-9 cursor-pointer flex-row items-center justify-between px-4 py-2">
                            <Skeleton
                              as={Label}
                              htmlFor="hiddenSwitch"
                              className="mt-2 inline cursor-pointer self-center pr-2 ">
                              {type.hidden ? t("show_eventtype_on_profile") : t("hide_from_profile")}
                            </Skeleton>
                            <Switch
                              id="hiddenSwitch"
                              name="Hidden"
                              checked={!type.hidden}
                              onCheckedChange={() => {
                                setHiddenMutation.mutate({ id: type.id, hidden: !type.hidden });
                              }}
                            />
                          </div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenuPortal>
                  </Dropdown>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <ConfirmationDialogContent
          variety="danger"
          title={t(`delete${isManagedEventPrefix()}_event_type`)}
          confirmBtnText={t(`confirm_delete_event_type`)}
          loadingText={t(`confirm_delete_event_type`)}
          onConfirm={(e) => {
            e.preventDefault();
            deleteEventTypeHandler(deleteDialogTypeId);
          }}>
          <p className="mt-5">
            <Trans
              i18nKey={`delete${isManagedEventPrefix()}_event_type_description`}
              components={{ li: <li />, ul: <ul className="ml-4 list-disc" /> }}>
              <ul>
                <li>Members assigned to this event type will also have their event types deleted.</li>
                <li>
                  Anyone who they&apos;ve shared their link with will no longer be able to book using it.
                </li>
              </ul>
            </Trans>
          </p>
        </ConfirmationDialogContent>
      </Dialog>
    </div>
  );
};

const EventTypeListHeading = ({
  profile,
  membershipCount,
  teamId,
}: EventTypeListHeadingProps): JSX.Element => {
  const { t } = useLocale();
  const router = useRouter();
  const orgBranding = useOrgBranding();

  const publishTeamMutation = trpc.viewer.teams.publish.useMutation({
    onSuccess(data) {
      router.push(data.url);
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });
  const bookerUrl = useBookerUrl();
  return (
    <div className="mb-4 flex items-center space-x-2">
      <Avatar
        alt={profile?.name || ""}
        href={teamId ? `/settings/teams/${teamId}/profile` : "/settings/my-account/profile"}
        imageSrc={
          `${orgBranding?.fullDomain ?? WEBAPP_URL}/${teamId ? "team/" : ""}${profile.slug}/avatar.png` ||
          undefined
        }
        size="md"
        className="mt-1 inline-flex justify-center"
      />
      <div>
        <Link
          href={teamId ? `/settings/teams/${teamId}/profile` : "/settings/my-account/profile"}
          className="text-emphasis font-bold">
          {profile?.name || ""}
        </Link>
        {membershipCount && teamId && (
          <span className="text-subtle relative -top-px me-2 ms-2 text-xs">
            <Link href={`/settings/teams/${teamId}/members`}>
              <Badge variant="gray">
                <Users className="-mt-px mr-1 inline h-3 w-3" />
                {membershipCount}
              </Badge>
            </Link>
          </span>
        )}
        {profile?.slug && (
          <Link href={`${CAL_URL}/${profile.slug}`} className="text-subtle block text-xs">
            {`${bookerUrl.replace("https://", "").replace("http://", "")}/${profile.slug}`}
          </Link>
        )}
      </div>
      {!profile?.slug && !!teamId && (
        <button onClick={() => publishTeamMutation.mutate({ teamId })}>
          <Badge variant="gray" className="-ml-2 mb-1">
            {t("upgrade")}
          </Badge>
        </button>
      )}
    </div>
  );
};

const CreateFirstEventTypeView = () => {
  const { t } = useLocale();

  return (
    <EmptyScreen
      Icon={LinkIcon}
      headline={t("new_event_type_heading")}
      description={t("new_event_type_description")}
    />
  );
};

const CTA = ({ data }: { data: GetByViewerResponse }) => {
  const { t } = useLocale();

  if (!data) return null;

  const profileOptions = data.profiles
    .filter((profile) => !profile.readOnly)
    .map((profile) => {
      return {
        teamId: profile.teamId,
        label: profile.name || profile.slug,
        image: profile.image,
        membershipRole: profile.membershipRole,
        slug: profile.slug,
      };
    });

  return (
    <CreateButton
      data-testid="new-event-type"
      subtitle={t("create_event_on").toUpperCase()}
      options={profileOptions}
      createDialog={() => <CreateEventTypeDialog profileOptions={profileOptions} />}
    />
  );
};

const Actions = () => {
  return (
    <div className="hidden items-center md:flex">
      <TeamsFilter popoverTriggerClassNames="mb-0" showVerticalDivider={true} />
    </div>
  );
};

const SetupProfileBanner = ({ closeAction }: { closeAction: () => void }) => {
  const { t } = useLocale();
  const orgBranding = useOrgBranding();

  return (
    <Alert
      className="my-4"
      severity="info"
      title={t("set_up_your_profile")}
      message={t("set_up_your_profile_description", { orgName: orgBranding?.name })}
      CustomIcon={UserIcon}
      actions={
        <div className="flex gap-1">
          <Button color="minimal" className="text-sky-700 hover:bg-sky-100" onClick={closeAction}>
            {t("dismiss")}
          </Button>
          <Button
            color="secondary"
            className="border-sky-700 bg-sky-50 text-sky-700 hover:border-sky-900 hover:bg-sky-200"
            href="/getting-started">
            {t("set_up")}
          </Button>
        </div>
      }
    />
  );
};

const Main = ({
  status,
  error,
  data,
  filters,
}: {
  status: string;
  data: GetByViewerResponse;
  error: any;
  filters: ReturnType<typeof getTeamsFiltersFromQuery>;
}) => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const router = useRouter();

  const orgBranding = useOrgBranding();

  if (!data || status === "loading") {
    return <SkeletonLoader />;
  }

  if (status === "error") {
    return <Alert severity="error" title="Something went wrong" message={error.message} />;
  }

  const isFilteredByOnlyOneItem =
    (filters?.teamIds?.length === 1 || filters?.userIds?.length === 1) && data.eventTypeGroups.length === 1;
  return (
    <>
      {data.eventTypeGroups.length > 1 || isFilteredByOnlyOneItem ? (
        <>
          {isMobile ? (
            <MobileTeamsTab eventTypeGroups={data.eventTypeGroups} />
          ) : (
            data.eventTypeGroups.map((group: EventTypeGroup, index: number) => (
              <div className="flex flex-col" key={group.profile.slug}>
                <EventTypeListHeading
                  profile={group.profile}
                  membershipCount={group.metadata.membershipCount}
                  teamId={group.teamId}
                  orgSlug={orgBranding?.slug}
                />

                <EventTypeList
                  types={group.eventTypes}
                  group={group}
                  groupIndex={index}
                  readOnly={group.metadata.readOnly}
                />
              </div>
            ))
          )}
        </>
      ) : (
        data.eventTypeGroups.length === 1 && (
          <EventTypeList
            types={data.eventTypeGroups[0].eventTypes}
            group={data.eventTypeGroups[0]}
            groupIndex={0}
            readOnly={data.eventTypeGroups[0].metadata.readOnly}
          />
        )
      )}
      {data.eventTypeGroups.length === 0 && <CreateFirstEventTypeView />}
      <EmbedDialog />
      {router.query.dialog === "duplicate" && <DuplicateDialog />}
    </>
  );
};

const EventTypesPage = () => {
  const { t } = useLocale();
  const router = useRouter();
  const { open } = useIntercom();
  const { query } = router;
  const { data: user } = useMeQuery();
  const [showProfileBanner, setShowProfileBanner] = useState(false);
  const orgBranding = useOrgBranding();
  const filters = getTeamsFiltersFromQuery(router.query);

  // TODO: Maybe useSuspenseQuery to focus on success case only? Remember that it would crash the page when there is an error in query. Also, it won't support skeleton
  const { data, status, error } = trpc.viewer.eventTypes.getByViewer.useQuery(filters && { filters }, {
    refetchOnWindowFocus: false,
    cacheTime: 1 * 60 * 60 * 1000,
    staleTime: 1 * 60 * 60 * 1000,
  });

  function closeBanner() {
    setShowProfileBanner(false);
    document.cookie = `calcom-profile-banner=1;max-age=${60 * 60 * 24 * 90}`; // 3 months
    showToast(t("we_wont_show_again"), "success");
  }

  useEffect(() => {
    if (query?.openIntercom && query?.openIntercom === "true") {
      open();
    }
    setShowProfileBanner(
      !!orgBranding && !document.cookie.includes("calcom-profile-banner=1") && !user?.completedOnboarding
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <HeadSeo
        title="Event Types"
        description="Create events to share for people to book on your calendar."
      />
      <Shell
        withoutSeo
        heading={t("event_types_page_title")}
        hideHeadingOnMobile
        subtitle={t("event_types_page_subtitle")}
        afterHeading={showProfileBanner && <SetupProfileBanner closeAction={closeBanner} />}
        beforeCTAactions={<Actions />}
        CTA={<CTA data={data} />}>
        <Main data={data} status={status} error={error} filters={filters} />
      </Shell>
    </div>
  );
};

EventTypesPage.PageWrapper = PageWrapper;

export default EventTypesPage;
