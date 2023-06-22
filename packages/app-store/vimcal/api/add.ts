import type { AppDeclarativeHandler } from "@calcom/types/AppHandler";

import { createDefaultInstallation } from "../../_utils/installation";
import appConfig from "../config.json";

const handler: AppDeclarativeHandler = {
  appType: appConfig.type,
  variant: appConfig.variant,
  slug: appConfig.slug,
  supportsMultipleInstalls: false,
  handlerType: "add",
  redirect: {
    newTab: true,
    url: "https://timehuddle.com",
  },
  createCredential: ({ appType, user, slug }) =>
    createDefaultInstallation({ appType, userId: user.id, slug, key: {} }),
};

export default handler;
