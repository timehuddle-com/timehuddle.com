import Link from "next/link";
import { useRouter } from "next/router";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { md } from "@calcom/lib/markdownIt";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import type { TeamWithMembers } from "@calcom/lib/server/queries/teams";
import { Avatar } from "@calcom/ui";

type TeamType = NonNullable<TeamWithMembers>;
type MembersType = TeamType["members"];
type MemberType = MembersType[number] & { safeBio: string | null };

type TeamTypeWithSafeHtml = Omit<TeamType, "members"> & { members: MemberType[] };

const Member = ({ member, teamName }: { member: MemberType; teamName: string | null }) => {
  const { t } = useLocale();
  const router = useRouter();
  const isBioEmpty = !member.bio || !member.bio.replace("<p><br></p>", "").length;

  // slug is a route parameter, we don't want to forward it to the next route
  const { slug: _slug, ...queryParamsToForward } = router.query;

  return (
    <Link key={member.id} href={{ pathname: `/${member.username}`, query: queryParamsToForward }}>
      <div className="sm:min-w-80 sm:max-w-80 bg-default hover:bg-muted border-subtle group flex min-h-full flex-col space-y-2 rounded-md border p-4 hover:cursor-pointer">
        <Avatar
          size="md"
          alt={member.name || ""}
          imageSrc={WEBAPP_URL + "/" + member.username + "/avatar.png"}
        />
        <section className="mt-2 line-clamp-4 w-full space-y-1">
          <p className="text-default font-medium">{member.name}</p>
          <div className="text-subtle line-clamp-3 overflow-ellipsis text-sm font-normal">
            {!isBioEmpty ? (
              <>
                <div
                  className="  text-subtle break-words text-sm [&_a]:text-blue-500 [&_a]:underline [&_a]:hover:text-blue-600"
                  dangerouslySetInnerHTML={{ __html: md.render(markdownToSafeHTML(member.bio)) }}
                />
              </>
            ) : (
              t("user_from_team", { user: member.name, team: teamName })
            )}
          </div>
        </section>
      </div>
    </Link>
  );
};

const Members = ({ members, teamName }: { members: MemberType[]; teamName: string | null }) => {
  if (!members || members.length === 0) {
    return null;
  }

  return (
    <section className="lg:min-w-lg mx-auto flex min-w-full max-w-5xl flex-wrap justify-center gap-x-6 gap-y-6">
      {members.map((member) => {
        return member.username !== null && <Member key={member.id} member={member} teamName={teamName} />;
      })}
    </section>
  );
};

const Team = ({ team }: { team: TeamTypeWithSafeHtml }) => {
  return (
    <div>
      <Members members={team.members} teamName={team.name} />
    </div>
  );
};

export default Team;
