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
import Brand from "@components/landing/Brand";
import Features from "@components/landing/Features";
import Footer from "@components/landing/Footer";
import Hero from "@components/landing/Hero";
import Pricing from "@components/landing/Pricing";
import Testimonial from "@components/landing/Testimonial";

export default function Landing({}: inferSSRProps<typeof _getServerSideProps> & WithNonceProps) {
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
      <HeadSeo title="Home" description="Home" />
      <Hero />
      <Brand />
      <Features />
      <Pricing />
      <Testimonial />
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

Landing.isThemeSupported = false;
Landing.PageWrapper = PageWrapper;

export const getServerSideProps = withNonce(_getServerSideProps);
