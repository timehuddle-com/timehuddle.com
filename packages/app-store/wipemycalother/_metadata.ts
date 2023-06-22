import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: _package.name,
  description: _package.description,
  installed: true,
  category: "other",
  categories: ["other"],
  // If using static next public folder, can then be referenced from the base URL (/).
  logo: "icon-dark.svg",
  publisher: "Timehuddle",
  slug: "wipe-my-cal",
  title: "Wipe my cal",
  type: "wipemycal_other",
  url: "https://timehuddle.com/apps/wipe-my-cal",
  variant: "other",
  email: "support@timehuddle.com",
  dirName: "wipemycalother",
} as AppMeta;

export default metadata;
