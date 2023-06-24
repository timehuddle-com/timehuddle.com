import { Trans } from "next-i18next";
import Link from "next/link";
import { useState } from "react";
import { Toaster } from "react-hot-toast";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button, showToast, Tooltip } from "@calcom/ui";
import { Clipboard } from "@calcom/ui/components/icon";

export interface IZapierSetupProps {
  inviteLink?: string;
}

const ZAPIER = "zapier";

export default function ZapierSetup(props: IZapierSetupProps) {
  const [newApiKey, setNewApiKey] = useState("");
  const { t } = useLocale();
  const utils = trpc.useContext();
  const integrations = trpc.viewer.integrations.useQuery({ variant: "automation" });
  const oldApiKey = trpc.viewer.apiKeys.findKeyOfType.useQuery({ appId: ZAPIER });

  const deleteApiKey = trpc.viewer.apiKeys.delete.useMutation();
  const zapierCredentials: { credentialIds: number[] } | undefined = integrations.data?.items.find(
    (item: { type: string }) => item.type === "zapier_automation"
  );
  const [credentialId] = zapierCredentials?.credentialIds || [false];
  const showContent = integrations.data && integrations.isSuccess && credentialId;
  const isCalDev = process.env.NEXT_PUBLIC_WEBAPP_URL === "https://app.cal.dev";

  async function createApiKey() {
    const event = { note: "Zapier", expiresAt: null, appId: ZAPIER };
    const apiKey = await utils.client.viewer.apiKeys.create.mutate(event);
    if (oldApiKey.data) {
      deleteApiKey.mutate({
        id: oldApiKey.data.id,
      });
    }
    setNewApiKey(apiKey);
  }

  if (integrations.isLoading) {
    return <div className="bg-emphasis absolute z-50 flex h-screen w-full items-center" />;
  }

  return (
    <div className="bg-emphasis flex h-screen">
      {showContent ? (
        <div className="bg-default m-auto max-w-[43em] overflow-auto rounded pb-10 md:p-10">
          <div className="md:flex md:flex-row">
            <div className="invisible md:visible">
              <img className="h-11" src="/api/app-store/zapier/icon.svg" alt="Zapier Logo" />
            </div>
            <div className="ml-2 ltr:mr-2 rtl:ml-2 md:ml-5">
              <div className="text-default">{t("setting_up_zapier")}</div>
              {!newApiKey ? (
                <>
                  <div className="mt-1 text-xl">{t("generate_api_key")}:</div>
                  <Button color="primary" onClick={() => createApiKey()} className="mb-4 mt-4">
                    {t("generate_api_key")}
                  </Button>
                </>
              ) : (
                <>
                  <div className="mt-1 text-xl">{t("your_unique_api_key")}</div>
                  <div className="my-2 mt-3 flex-wrap sm:flex sm:flex-nowrap">
                    <code className="bg-subtle h-full w-full whitespace-pre-wrap rounded-md py-[6px] pl-2 pr-2 sm:rounded-r-none sm:pr-5">
                      {newApiKey}
                    </code>
                    <Tooltip side="top" content={t("copy_to_clipboard")}>
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(newApiKey);
                          showToast(t("api_key_copied"), "success");
                        }}
                        type="button"
                        className="mt-4 text-base sm:mt-0 sm:rounded-l-none">
                        <Clipboard className="h-5 w-5 text-gray-100 ltr:mr-2 rtl:ml-2" />
                        {t("copy")}
                      </Button>
                    </Tooltip>
                  </div>
                  <div className="text-default mb-5 mt-2 text-sm font-semibold">{t("copy_safe_api_key")}</div>
                </>
              )}

              <ol className="mb-5 ml-5 mt-5 list-decimal ltr:mr-5 rtl:ml-5">
                {isCalDev && (
                  <li>
                    {t("go_to")}
                    <a href={props.inviteLink} className="text-orange-600 underline">
                      {t("zapier_invite_link")}
                    </a>
                  </li>
                )}
                <Trans i18nKey="zapier_setup_instructions">
                  <li>Log into your Zapier account and create a new Zap.</li>
                  <li>Select Cal.com as your Trigger app. Also choose a Trigger event.</li>
                  <li>Choose your account and then enter your Unique API Key.</li>
                  <li>Test your Trigger.</li>
                  <li>You&apos;re set!</li>
                </Trans>
              </ol>
              <Link href="/apps/installed/automation?hl=zapier" passHref={true} legacyBehavior>
                <Button color="secondary">{t("done")}</Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="ml-5 mt-5">
          <div>{t("install_zapier_app")}</div>
          <div className="mt-3">
            <Link href="/apps/zapier" passHref={true} legacyBehavior>
              <Button>{t("go_to_app_store")}</Button>
            </Link>
          </div>
        </div>
      )}
      <Toaster position="bottom-right" />
    </div>
  );
}
