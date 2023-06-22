import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Apple Calendar",
  description: _package.description,
  installed: true,
  type: "apple_calendar",
  title: "Apple Calendar",
  variant: "calendar",
  categories: ["calendar"],
  category: "calendar",
  logo: "icon.svg",
  publisher: "Timehuddle",
  slug: "apple-calendar",
  url: "https://timehuddle.com/",
  email: "support@timehuddle.com",
  dirName: "applecalendar",
} as AppMeta;

export default metadata;
