import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Microsoft Exchange 2013 Calendar",
  description: _package.description,
  installed: true,
  type: "exchange2013_calendar",
  title: "Microsoft Exchange 2013 Calendar",
  variant: "calendar",
  category: "calendar",
  categories: ["calendar"],
  label: "Exchange Calendar",
  logo: "icon.svg",
  publisher: "Timehuddle",
  slug: "exchange2013-calendar",
  url: "https://timehuddle.com/",
  email: "support@timehuddle.com",
  dirName: "exchange2013calendar",
} as AppMeta;

export default metadata;
