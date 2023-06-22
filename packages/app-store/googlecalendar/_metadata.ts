import { validJson } from "@calcom/lib/jsonUtils";
import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Google Calendar",
  description: _package.description,
  installed: !!(process.env.GOOGLE_API_CREDENTIALS && validJson(process.env.GOOGLE_API_CREDENTIALS)),
  type: "google_calendar",
  title: "Google Calendar",
  variant: "calendar",
  category: "calendar",
  categories: ["calendar"],
  logo: "icon.svg",
  publisher: "Timehuddle",
  slug: "google-calendar",
  url: "https://timehuddle.com/",
  email: "support@timehuddle.com",
  dirName: "googlecalendar",
} as AppMeta;

export default metadata;
