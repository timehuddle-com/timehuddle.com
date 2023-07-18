const path = require("path");

/** @type {import("next-i18next").UserConfig} */
const config = {
  i18n: {
    defaultLocale: "en",
    locales: [
      "en",
      "fr",
      "it",
      "ru",
      "es",
      "de",
      "pt",
      "ro",
      "nl",
      "pt-BR",
      "es-419",
      "ko",
      "ja",
      "pl",
      "ar",
      "he",
      "zh-CN",
      "zh-TW",
      "cs",
      "sr",
      "sv",
      "vi",
      "no",
      "uk",
      "da",
      "tr",
    ],
  },
  reloadOnPrerender: process.env.NODE_ENV !== "production",
};

module.exports = config;
