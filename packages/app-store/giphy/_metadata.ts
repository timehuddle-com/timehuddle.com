import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Giphy",
  description: _package.description,
  installed: true,
  categories: ["other"],
  logo: "icon.svg",
  publisher: "Timehuddle",
  slug: "giphy",
  title: "Giphy",
  type: "giphy_other",
  url: "https://timehuddle.com/apps/giphy",
  variant: "other",
  extendsFeature: "EventType",
  email: "support@timehuddle.com",
  dirName: "giphy",
} as AppMeta;

export default metadata;
