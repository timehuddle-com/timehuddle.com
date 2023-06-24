import { Analytics } from "@vercel/analytics/react";

import { trpc } from "@calcom/trpc/react";

import type { AppProps } from "@lib/app-providers";

import "../styles/globals.css";

function MyApp(props: AppProps) {
  const { Component, pageProps } = props;
  if (Component.PageWrapper !== undefined) return Component.PageWrapper(props);
  return (
    <>
      <Analytics />
      <Component {...pageProps} />
    </>
  );
}

export default trpc.withTRPC(MyApp);
