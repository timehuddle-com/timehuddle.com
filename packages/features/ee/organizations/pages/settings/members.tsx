import { useRouter } from "next/router";
import { useState } from "react";

import LicenseRequired from "@calcom/features/ee/common/components/LicenseRequired";
import MemberInvitationModal from "@calcom/features/ee/teams/components/MemberInvitationModal";
import MemberListItem from "@calcom/features/ee/teams/components/MemberListItem";
import TeamInviteList from "@calcom/features/ee/teams/components/TeamInviteList";
import { getLayout } from "@calcom/features/settings/layouts/SettingsLayout";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MembershipRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import type { RouterOutputs } from "@calcom/trpc/react";
import { Button, Meta, TextField, showToast } from "@calcom/ui";
import { Plus } from "@calcom/ui/components/icon";

type Team = RouterOutputs["viewer"]["teams"]["get"];

interface MembersListProps {
  team: Team | undefined;
}

const checkIfExist = (comp: string, query: string) =>
  comp.toLowerCase().replace(/\s+/g, "").includes(query.toLowerCase().replace(/\s+/g, ""));

function MembersList(props: MembersListProps) {
  const { team } = props;
  const { t } = useLocale();
  const [query, setQuery] = useState<string>("");

  const members = team?.members;
  const membersList = members
    ? members && query === ""
      ? members
      : members.filter((member) => {
          const email = member.email ? checkIfExist(member.email, query) : false;
          const username = member.username ? checkIfExist(member.username, query) : false;
          const name = member.name ? checkIfExist(member.name, query) : false;

          return email || username || name;
        })
    : undefined;
  return (
    <div className="flex flex-col gap-y-3">
      <TextField
        type="search"
        autoComplete="false"
        onChange={(e) => setQuery(e.target.value)}
        value={query}
        placeholder={`${t("search")}...`}
      />
      {membersList?.length && team ? (
        <ul className="divide-subtle border-subtle divide-y rounded-md border ">
          {membersList.map((member) => {
            return <MemberListItem key={member.id} team={team} member={member} />;
          })}
        </ul>
      ) : null}
    </div>
  );
}

const MembersView = () => {
  const { t, i18n } = useLocale();
  const router = useRouter();
  const utils = trpc.useContext();
  const showDialog = router.query.inviteModal === "true";
  const [showMemberInvitationModal, setShowMemberInvitationModal] = useState(showDialog);
  const { data: team, isLoading } = trpc.viewer.organizations.listMembers.useQuery(undefined, {
    onError: () => {
      router.push("/settings");
    },
  });

  const inviteMemberMutation = trpc.viewer.teams.inviteMember.useMutation({
    async onSuccess(data) {
      await utils.viewer.organizations.listMembers.invalidate();
      setShowMemberInvitationModal(false);
      if (data.sendEmailInvitation) {
        if (Array.isArray(data.usernameOrEmail)) {
          showToast(
            t("email_invite_team_bulk", {
              userCount: data.usernameOrEmail.length,
            }),
            "success"
          );
        } else {
          showToast(
            t("email_invite_team", {
              email: data.usernameOrEmail,
            }),
            "success"
          );
        }
      }
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  const isInviteOpen = !team?.membership.accepted;

  const isAdminOrOwner =
    team && (team.membership.role === MembershipRole.OWNER || team.membership.role === MembershipRole.ADMIN);

  return (
    <LicenseRequired>
      <Meta
        title={t("organization_members")}
        description={t("organization_description")}
        CTA={
          isAdminOrOwner ? (
            <Button
              type="button"
              color="primary"
              StartIcon={Plus}
              className="ml-auto"
              onClick={() => setShowMemberInvitationModal(true)}
              data-testid="new-organization-member-button">
              {t("add")}
            </Button>
          ) : (
            <></>
          )
        }
      />
      {!isLoading && (
        <>
          <div>
            {team && (
              <>
                {isInviteOpen && (
                  <TeamInviteList
                    teams={[
                      {
                        id: team.id,
                        accepted: team.membership.accepted || false,
                        logo: team.logo,
                        name: team.name,
                        slug: team.slug,
                        role: team.membership.role,
                      },
                    ]}
                  />
                )}
              </>
            )}
            <MembersList team={team} />
          </div>
          {showMemberInvitationModal && team && (
            <MemberInvitationModal
              teamId={team.id}
              isOpen={showMemberInvitationModal}
              members={team.members}
              onExit={() => setShowMemberInvitationModal(false)}
              isLoading={inviteMemberMutation.isLoading}
              onSubmit={(values) => {
                inviteMemberMutation.mutate({
                  teamId: team.id,
                  language: i18n.language,
                  role: values.role,
                  usernameOrEmail: values.emailOrUsername,
                  sendEmailInvitation: values.sendInviteEmail,
                  isOrg: true,
                });
              }}
            />
          )}
        </>
      )}
    </LicenseRequired>
  );
};
MembersView.getLayout = getLayout;

export default MembersView;
