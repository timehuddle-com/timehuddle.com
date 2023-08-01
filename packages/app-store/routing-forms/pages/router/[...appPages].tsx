import Head from "next/head";
import z from "zod";

import { orgDomainConfig } from "@calcom/features/ee/organizations/lib/orgDomains";
import type { AppGetServerSidePropsContext, AppPrisma } from "@calcom/types/AppGetServerSideProps";
import type { inferSSRProps } from "@calcom/types/inferSSRProps";

import getFieldIdentifier from "../../lib/getFieldIdentifier";
import { getSerializableForm } from "../../lib/getSerializableForm";
import { processRoute } from "../../lib/processRoute";
import transformResponse from "../../lib/transformResponse";
import type { Response } from "../../types/types";

export default function Router({ form, message }: inferSSRProps<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>{form.name} | Timehuddle Forms</title>
      </Head>
      <div className="mx-auto my-0 max-w-3xl md:my-24">
        <div className="w-full max-w-4xl ltr:mr-2 rtl:ml-2">
          <div className="bg-default -mx-4 rounded-sm border border-neutral-200 p-4 py-6 sm:mx-0 sm:px-8">
            <div>{message}</div>
          </div>
        </div>
      </div>
    </>
  );
}

const querySchema = z
  .object({
    form: z.string(),
    slug: z.string(),
    pages: z.array(z.string()),
  })
  .catchall(z.string());

export const getServerSideProps = async function getServerSideProps(
  context: AppGetServerSidePropsContext,
  prisma: AppPrisma
) {
  const queryParsed = querySchema.safeParse(context.query);
  if (!queryParsed.success) {
    return {
      notFound: true,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { form: formId, slug: _slug, pages: _pages, ...fieldsResponses } = queryParsed.data;
  const { currentOrgDomain, isValidOrgDomain } = orgDomainConfig(context.req.headers.host ?? "");

  const form = await prisma.app_RoutingForms_Form.findFirst({
    where: {
      id: formId,
      user: {
        organization: isValidOrgDomain
          ? {
              slug: currentOrgDomain,
            }
          : null,
      },
    },
  });

  if (!form) {
    return {
      notFound: true,
    };
  }
  const serializableForm = await getSerializableForm({ form });

  const response: Record<string, Pick<Response[string], "value">> = {};
  serializableForm.fields?.forEach((field) => {
    const fieldResponse = fieldsResponses[getFieldIdentifier(field)] || "";
    const value =
      field.type === "multiselect" ? fieldResponse.split(",").map((r) => r.trim()) : fieldResponse;
    response[field.id] = {
      value: transformResponse({ field, value }),
    };
  });

  const decidedAction = processRoute({ form: serializableForm, response });

  if (!decidedAction) {
    throw new Error("No matching route could be found");
  }

  //TODO: Maybe take action after successful mutation
  if (decidedAction.type === "customPageMessage") {
    return {
      props: {
        form: serializableForm,
        message: decidedAction.value,
      },
    };
  } else if (decidedAction.type === "eventTypeRedirectUrl") {
    return {
      redirect: {
        destination: `/${decidedAction.value}`,
        permanent: false,
      },
    };
  } else if (decidedAction.type === "externalRedirectUrl") {
    return {
      redirect: {
        destination: `${decidedAction.value}`,
        permanent: false,
      },
    };
  }
  return {
    props: {
      form: serializableForm,
    },
  };
};
