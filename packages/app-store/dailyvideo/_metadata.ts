import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Timehuddle Video",
  description: _package.description,
  installed: !!process.env.DAILY_API_KEY,
  type: "daily_video",
  variant: "conferencing",
  url: "https://daily.co",
  categories: ["video"],
  logo: "icon.svg",
  publisher: "Timehuddle",
  category: "video",
  slug: "daily-video",
  title: "Timehuddle Video",
  isGlobal: true,
  email: "support@timehuddle.com",
  appData: {
    location: {
      linkType: "dynamic",
      type: "integrations:daily",
      label: "Timehuddle Video",
    },
  },
  key: { apikey: process.env.DAILY_API_KEY },
  dirName: "dailyvideo",
} as AppMeta;

export default metadata;
