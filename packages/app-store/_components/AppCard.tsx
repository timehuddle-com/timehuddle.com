import { useAutoAnimate } from "@formkit/auto-animate/react";
import Link from "next/link";

import { classNames } from "@calcom/lib";
import type { RouterOutputs } from "@calcom/trpc/react";
import { Switch, Badge, Avatar } from "@calcom/ui";

import type { SetAppDataGeneric } from "../EventTypeAppContext";
import type { eventTypeAppCardZod } from "../eventTypeAppCardZod";
import type { CredentialOwner } from "../types";
import OmniInstallAppButton from "./OmniInstallAppButton";

export default function AppCard({
  app,
  description,
  switchOnClick,
  switchChecked,
  children,
  setAppData,
  returnTo,
  teamId,
  disableSwitch,
  LockedIcon,
}: {
  app: RouterOutputs["viewer"]["integrations"]["items"][number] & { credentialOwner?: CredentialOwner };
  description?: React.ReactNode;
  switchChecked?: boolean;
  switchOnClick?: (e: boolean) => void;
  children?: React.ReactNode;
  setAppData: SetAppDataGeneric<typeof eventTypeAppCardZod>;
  returnTo?: string;
  teamId?: number;
  disableSwitch?: boolean;
  LockedIcon?: React.ReactNode;
}) {
  const [animationRef] = useAutoAnimate<HTMLDivElement>();

  return (
    <div
      className={classNames(
        "border-subtle mb-4",
        app.isInstalled ? "mt-2" : "mt-6",
        "rounded-md border",
        !app.enabled && "grayscale"
      )}>
      <div className={classNames(app.isInstalled ? "p-4 text-sm sm:p-4" : "px-5 py-4 text-sm sm:px-5")}>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:gap-0">
          {/* Don't know why but w-[42px] isn't working, started happening when I started using next/dynamic */}
          <Link href={"/apps/" + app.slug} className="mr-3 h-auto w-10 rounded-sm">
            <img
              className={classNames(
                app?.logo.includes("-dark") && "dark:invert",
                `w-full ${app.isInstalled ? "min-w-[42px]" : "min-w-[32.47px]"}`
              )}
              src={app?.logo}
              alt={app?.name}
            />
          </Link>
          <div className="flex flex-col">
            <span className="text-emphasis text-base font-semibold leading-4">{app?.name}</span>
            <p className="text-default max-w-md truncate pt-2 text-sm font-normal ltr:pr-2 rtl:pl-2">
              {description || app?.description}
            </p>
          </div>
          <div className="ml-auto flex items-center space-x-2">
            {app.credentialOwner && (
              <div className="ml-auto">
                <Badge variant="gray">
                  <div className="flex items-center">
                    <Avatar
                      className="mr-2"
                      alt={app.credentialOwner.name || "Credential Owner Name"}
                      size="sm"
                      imageSrc={app.credentialOwner.avatar}
                    />
                    {app.credentialOwner.name}
                  </div>
                </Badge>
              </div>
            )}
            {app?.isInstalled || app.credentialOwner ? (
              <div className="ml-auto flex items-center">
                <Switch
                  disabled={!app.enabled || disableSwitch}
                  onCheckedChange={(enabled) => {
                    if (switchOnClick) {
                      switchOnClick(enabled);
                    }
                    setAppData("enabled", enabled);
                  }}
                  checked={switchChecked}
                  LockedIcon={LockedIcon}
                />
              </div>
            ) : (
              <OmniInstallAppButton
                className="ml-auto flex items-center"
                appId={app.slug}
                returnTo={returnTo}
                teamId={teamId}
              />
            )}
          </div>
        </div>
      </div>
      <div ref={animationRef}>
        {app?.isInstalled && switchChecked && <hr className="border-subtle" />}
        {app?.isInstalled && switchChecked ? <div className="p-4 text-sm sm:px-4">{children}</div> : null}
      </div>
    </div>
  );
}
