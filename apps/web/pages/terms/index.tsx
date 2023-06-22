import type { GetServerSidePropsContext } from "next";
import { getCsrfToken } from "next-auth/react";
import type { CSSProperties } from "react";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { HeadSeo } from "@calcom/ui";

import type { inferSSRProps } from "@lib/types/inferSSRProps";
import type { WithNonceProps } from "@lib/withNonce";
import withNonce from "@lib/withNonce";

import AddToHomescreen from "@components/AddToHomescreen";
import PageWrapper from "@components/PageWrapper";
import Footer from "@components/landing/Footer";
import Header from "@components/landing/Header";
import TermsAndCondition from "@components/landing/TermsAndCondition";

export default function Terms({}: inferSSRProps<typeof _getServerSideProps> & WithNonceProps) {
  return (
    <div
      style={
        {
          "--cal-brand": "#111827",
          "--cal-brand-emphasis": "#101010",
          "--cal-brand-text": "white",
          "--cal-brand-subtle": "#9CA3AF",
        } as CSSProperties
      }>
      <HeadSeo title="Terms" description="Terms and Conditions" />
      <Header />
      <TermsAndCondition />
      <Footer />
      <AddToHomescreen />
    </div>
  );
}

// TODO: Once we understand how to retrieve prop types automatically from getServerSideProps, remove this temporary variable
const _getServerSideProps = async function getServerSideProps(context: GetServerSidePropsContext) {
  const { req, res } = context;

  const session = await getServerSession({ req, res });

  if (session) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {
      csrfToken: await getCsrfToken(context),
    },
  };
};

Terms.isThemeSupported = false;
Terms.PageWrapper = PageWrapper;

export const getServerSideProps = withNonce(_getServerSideProps);
