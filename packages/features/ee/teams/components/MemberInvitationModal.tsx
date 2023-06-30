import { PaperclipIcon, UserIcon, Users } from "lucide-react";
import { Trans } from "next-i18next";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";

import { classNames } from "@calcom/lib";
import { IS_TEAM_BILLING_ENABLED, WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MembershipRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc";
import {
  Button,
  Checkbox as CheckboxField,
  Dialog,
  DialogContent,
  DialogFooter,
  Form,
  Label,
  showToast,
  TextField,
  ToggleGroup,
  Select,
  TextAreaField,
} from "@calcom/ui";
import { Link } from "@calcom/ui/components/icon";

import type { PendingMember } from "../lib/types";
import { GoogleWorkspaceInviteButton } from "./GoogleWorkspaceInviteButton";

type MemberInvitationModalProps = {
  isOpen: boolean;
  onExit: () => void;
  onSubmit: (values: NewMemberForm, resetFields: () => void) => void;
  onSettingsOpen?: () => void;
  teamId: number;
  members: PendingMember[];
  token?: string;
};

type MembershipRoleOption = {
  value: MembershipRole;
  label: string;
};

export interface NewMemberForm {
  emailOrUsername: string | string[];
  role: MembershipRole;
  sendInviteEmail: boolean;
}

type ModalMode = "INDIVIDUAL" | "BULK";

interface FileEvent<T = Element> extends FormEvent<T> {
  target: EventTarget & T;
}

export default function MemberInvitationModal(props: MemberInvitationModalProps) {
  const { t } = useLocale();
  const trpcContext = trpc.useContext();

  const [modalImportMode, setModalInputMode] = useState<ModalMode>("INDIVIDUAL");

  const createInviteMutation = trpc.viewer.teams.createInvite.useMutation({
    onSuccess(token) {
      copyInviteLinkToClipboard(token);
      trpcContext.viewer.teams.get.invalidate();
      trpcContext.viewer.teams.list.invalidate();
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const copyInviteLinkToClipboard = async (token: string) => {
    const inviteLink = `${WEBAPP_URL}/teams?token=${token}`;
    await navigator.clipboard.writeText(inviteLink);
    showToast(t("invite_link_copied"), "success");
  };

  const options: MembershipRoleOption[] = useMemo(() => {
    return [
      { value: MembershipRole.MEMBER, label: t("member") },
      { value: MembershipRole.ADMIN, label: t("admin") },
      { value: MembershipRole.OWNER, label: t("owner") },
    ];
  }, [t]);

  const newMemberFormMethods = useForm<NewMemberForm>();

  const validateUniqueInvite = (value: string) => {
    return !(
      props.members.some((member) => member?.username === value) ||
      props.members.some((member) => member?.email === value)
    );
  };

  const handleFileUpload = (e: FileEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) {
      return;
    }
    const file = e.target.files[0];

    if (file) {
      const reader = new FileReader();

      reader.onload = (e) => {
        const contents = e?.target?.result as string;
        const values = contents?.split(",").map((email) => email.trim().toLocaleLowerCase());
        newMemberFormMethods.setValue("emailOrUsername", values);
      };

      reader.readAsText(file);
    }
  };

  const resetFields = () => {
    newMemberFormMethods.reset();
    newMemberFormMethods.setValue("emailOrUsername", "");
    setModalInputMode("INDIVIDUAL");
  };

  return (
    <Dialog
      name="inviteModal"
      open={props.isOpen}
      onOpenChange={() => {
        props.onExit();
        newMemberFormMethods.reset();
      }}>
      <DialogContent
        type="creation"
        title={t("invite_team_member")}
        description={
          IS_TEAM_BILLING_ENABLED ? (
            <span className="text-subtle text-sm leading-tight">
              <Trans i18nKey="invite_new_member_description">
                Note: This will <span className="text-emphasis font-medium">cost an extra seat ($15/m)</span>{" "}
                on your subscription.
              </Trans>
            </span>
          ) : null
        }>
        <div>
          <Label className="sr-only" htmlFor="role">
            {t("import_mode")}
          </Label>
          <ToggleGroup
            isFullWidth={true}
            onValueChange={(val) => setModalInputMode(val as ModalMode)}
            defaultValue="INDIVIDUAL"
            options={[
              {
                value: "INDIVIDUAL",
                label: <span className="line-clamp-1">{t("invite_team_individual_segment")}</span>,
                iconLeft: <UserIcon />,
              },
              {
                value: "BULK",
                label: <span className="line-clamp-1">{t("invite_team_bulk_segment")}</span>,
                iconLeft: <Users />,
              },
            ]}
          />
        </div>

        <Form form={newMemberFormMethods} handleSubmit={(values) => props.onSubmit(values, resetFields)}>
          <div className="mb-12 mt-6 space-y-6">
            {/* Indivdual Invite */}
            {modalImportMode === "INDIVIDUAL" && (
              <Controller
                name="emailOrUsername"
                control={newMemberFormMethods.control}
                rules={{
                  required: t("enter_email_or_username"),
                  validate: (value) => {
                    if (typeof value === "string")
                      return validateUniqueInvite(value) || t("member_already_invited");
                  },
                }}
                render={({ field: { onChange }, fieldState: { error } }) => (
                  <>
                    <TextField
                      label={t("email_or_username")}
                      id="inviteUser"
                      name="inviteUser"
                      placeholder="email@example.com"
                      required
                      onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
                    />
                    {error && <span className="text-sm text-red-800">{error.message}</span>}
                  </>
                )}
              />
            )}
            {/* Bulk Invite */}
            {modalImportMode === "BULK" && (
              <div className="bg-muted flex flex-col rounded-md p-4">
                <Controller
                  name="emailOrUsername"
                  control={newMemberFormMethods.control}
                  rules={{
                    required: t("enter_email_or_username"),
                  }}
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <>
                      {/* TODO: Make this a fancy email input that styles on a successful email. */}
                      <TextAreaField
                        name="emails"
                        label="Invite via email"
                        rows={4}
                        autoCorrect="off"
                        placeholder="john@doe.com, alex@smith.com"
                        required
                        value={value}
                        onChange={(e) => {
                          const emails = e.target.value
                            .split(",")
                            .map((email) => email.trim().toLocaleLowerCase());

                          return onChange(emails);
                        }}
                      />
                      {error && <span className="text-sm text-red-800">{error.message}</span>}
                    </>
                  )}
                />

                <GoogleWorkspaceInviteButton
                  onSuccess={(data) => {
                    newMemberFormMethods.setValue("emailOrUsername", data);
                  }}
                />
                <Button
                  type="button"
                  color="secondary"
                  StartIcon={PaperclipIcon}
                  className="mt-3 justify-center stroke-2">
                  <label htmlFor="bulkInvite">
                    Upload a .csv file
                    <input
                      id="bulkInvite"
                      type="file"
                      accept=".csv"
                      style={{ display: "none" }}
                      onChange={handleFileUpload}
                    />
                  </label>
                </Button>
              </div>
            )}
            <Controller
              name="role"
              control={newMemberFormMethods.control}
              defaultValue={options[0].value}
              render={({ field: { onChange } }) => (
                <div>
                  <Label className="text-emphasis font-medium" htmlFor="role">
                    {t("invite_as")}
                  </Label>
                  <Select
                    id="role"
                    defaultValue={options[0]}
                    options={options}
                    onChange={(val) => {
                      if (val) onChange(val.value);
                    }}
                  />
                </div>
              )}
            />
            <Controller
              name="sendInviteEmail"
              control={newMemberFormMethods.control}
              defaultValue={true}
              render={() => (
                <CheckboxField
                  className="mr-0"
                  defaultChecked={true}
                  description={t("send_invite_email")}
                  onChange={(e) => newMemberFormMethods.setValue("sendInviteEmail", e.target.checked)}
                />
              )}
            />
            {props.token && (
              <div className="flex">
                <Button
                  type="button"
                  color="minimal"
                  className="me-2 ms-2"
                  onClick={() => {
                    props.onSettingsOpen && props.onSettingsOpen();
                    newMemberFormMethods.reset();
                  }}
                  data-testid="edit-invite-link-button">
                  {t("edit_invite_link")}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter showDivider>
            <div className="flex w-full flex-col items-end gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <Button
                  type="button"
                  color="minimal"
                  variant="icon"
                  onClick={() =>
                    props.token
                      ? copyInviteLinkToClipboard(props.token)
                      : createInviteMutation.mutate({ teamId: props.teamId })
                  }
                  className={classNames("gap-2", props.token && "opacity-50")}
                  data-testid="copy-invite-link-button">
                  <Link className="text-default h-4 w-4" aria-hidden="true" />
                  {t("copy_invite_link")}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  color="minimal"
                  onClick={() => {
                    props.onExit();
                    resetFields();
                  }}>
                  {t("cancel")}
                </Button>
                <Button type="submit" color="primary" data-testid="invite-new-member-button">
                  {t("send_invite")}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
