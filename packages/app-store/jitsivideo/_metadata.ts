import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Jitsi Video",
  description: _package.description,
  installed: true,
  type: "jitsi_video",
  variant: "conferencing",
  categories: ["conferencing"],
  logo: "icon.svg",
  publisher: "Timehuddle",
  url: "https://jitsi.org/",
  slug: "jitsi",
  title: "Jitsi Meet",
  isGlobal: false,
  email: "support@timehuddle.com",
  appData: {
    location: {
      linkType: "dynamic",
      type: "integrations:jitsi",
      label: "Jitsi Video",
    },
  },
  dirName: "jitsivideo",
} as AppMeta;

export default metadata;
