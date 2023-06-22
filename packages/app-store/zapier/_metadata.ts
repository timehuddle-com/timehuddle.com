import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Zapier",
  description: _package.description,
  installed: true,
  category: "automation",
  categories: ["automation"],
  logo: "icon.svg",
  publisher: "Timehuddle",
  slug: "zapier",
  title: "Zapier",
  type: "zapier_automation",
  url: "https://timehuddle.com/apps/zapier",
  variant: "automation",
  email: "support@timehuddle.com",
  dirName: "zapier",
} as AppMeta;

export default metadata;
