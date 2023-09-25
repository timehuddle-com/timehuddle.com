import dayjs from "@calcom/dayjs";
import { classNames } from "@calcom/lib";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import {
  Badge,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@calcom/ui";
import { MoreHorizontal, Edit2, Trash } from "@calcom/ui/components/icon";

export type TApiKeys = RouterOutputs["viewer"]["apiKeys"]["list"][number];

const ApiKeyListItem = ({
  apiKey,
  lastItem,
  onEditClick,
}: {
  apiKey: TApiKeys;
  lastItem: boolean;
  onEditClick: () => void;
}) => {
  const { t } = useLocale();
  const utils = trpc.useContext();

  const isExpired = apiKey?.expiresAt ? apiKey.expiresAt < new Date() : null;
  const neverExpires = apiKey?.expiresAt === null;

  const deleteApiKey = trpc.viewer.apiKeys.delete.useMutation({
    async onSuccess() {
      await utils.viewer.apiKeys.list.invalidate();
    },
  });

  return (
    <div
      key={apiKey.id}
      className={classNames("flex w-full justify-between p-4", lastItem ? "" : "border-subtle border-b")}>
      <div>
        <p className="font-medium"> {apiKey?.note ? apiKey.note : t("api_key_no_note")}</p>
        <div className="flex items-center space-x-3.5">
          {!neverExpires && isExpired && <Badge variant="red">{t("expired")}</Badge>}
          {!isExpired && <Badge variant="green">{t("active")}</Badge>}
          <p className="text-default text-xs">
            {" "}
            {neverExpires ? (
              <div className="text-subtle flex flex-row space-x-3">{t("api_key_never_expires")}</div>
            ) : (
              `${isExpired ? t("expired") : t("expires")} ${dayjs(apiKey?.expiresAt?.toString()).fromNow()}`
            )}
          </p>
        </div>
      </div>
      <div>
        <Dropdown>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="icon" color="secondary" StartIcon={MoreHorizontal} />
          </DropdownMenuTrigger>

          <DropdownMenuContent>
            <DropdownMenuItem>
              <DropdownItem type="button" onClick={onEditClick} StartIcon={Edit2}>
                {t("edit") as string}
              </DropdownItem>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <DropdownItem
                type="button"
                onClick={() =>
                  deleteApiKey.mutate({
                    id: apiKey.id,
                  })
                }
                StartIcon={Trash}>
                {t("delete") as string}
              </DropdownItem>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </Dropdown>
      </div>
    </div>
  );
};

export default ApiKeyListItem;
