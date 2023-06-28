import { Collapsible, CollapsibleContent } from "@radix-ui/react-collapsible";
import classNames from "classnames";
import type { TFunction } from "next-i18next";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import type { MutableRefObject, RefObject } from "react";
import { createRef, forwardRef, useRef, useState } from "react";
import type { ControlProps } from "react-select";
import { components } from "react-select";

import type { BookerLayout } from "@calcom/features/bookings/Booker/types";
import { useFlagMap } from "@calcom/features/flags/context/provider";
import { APP_NAME, EMBED_LIB_URL, IS_SELF_HOSTED, WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  HorizontalTabs,
  Label,
  showToast,
  Switch,
  TextArea,
  TextField,
  ColorPicker,
  Select,
} from "@calcom/ui";
import { Code, Trello, Sun, ArrowLeft } from "@calcom/ui/components/icon";

type EmbedType = "inline" | "floating-popup" | "element-click";
type EmbedFramework = "react" | "HTML";

const enum Theme {
  auto = "auto",
  light = "light",
  dark = "dark",
}

const EMBED_CAL_ORIGIN = WEBAPP_URL;
const EMBED_CAL_JS_URL = `${WEBAPP_URL}/embed/embed.js`;

type PreviewState = {
  inline: {
    width: string;
    height: string;
  };
  theme: Theme;
  floatingPopup: {
    config?: {
      layout: BookerLayouts;
    };
    [key: string]: string | boolean | undefined | Record<string, string>;
  };
  elementClick: Record<string, string>;
  palette: {
    brandColor: string;
  };
  hideEventTypeDetails: boolean;
  layout: BookerLayouts;
};
const queryParamsForDialog = ["embedType", "embedTabName", "embedUrl"];

const getDimension = (dimension: string) => {
  if (dimension.match(/^\d+$/)) {
    dimension = `${dimension}%`;
  }
  return dimension;
};

const goto = (router: NextRouter, searchParams: Record<string, string>) => {
  const newQuery = new URLSearchParams(router.asPath.split("?")[1]);
  Object.keys(searchParams).forEach((key) => {
    newQuery.set(key, searchParams[key]);
  });
  router.push(`${router.asPath.split("?")[0]}?${newQuery.toString()}`, undefined, {
    shallow: true,
  });
};

const removeQueryParams = (router: NextRouter, queryParams: string[]) => {
  const params = new URLSearchParams(window.location.search);

  queryParams.forEach((param) => {
    params.delete(param);
  });

  router.push(`${router.asPath.split("?")[0]}?${params.toString()}`);
};

/**
 * It allows us to show code with certain reusable blocks indented according to the block variable placement
 * So, if you add a variable ${abc} with indentation of 4 spaces, it will automatically indent all newlines in `abc` with the same indent before constructing the final string
 * `A${var}C` with var = "B" ->   partsWithoutBlock=['A','C'] blocksOrVariables=['B']
 */
const code = (partsWithoutBlock: TemplateStringsArray, ...blocksOrVariables: string[]) => {
  const constructedCode: string[] = [];
  for (let i = 0; i < partsWithoutBlock.length; i++) {
    const partWithoutBlock = partsWithoutBlock[i];
    // blocksOrVariables length would always be 1 less than partsWithoutBlock
    // So, last item should be concatenated as is.
    if (i >= blocksOrVariables.length) {
      constructedCode.push(partWithoutBlock);
      continue;
    }
    const block = blocksOrVariables[i];
    const indentedBlock: string[] = [];
    let indent = "";
    block.split("\n").forEach((line) => {
      indentedBlock.push(line);
    });
    // non-null assertion is okay because we know that we are referencing last element.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const indentationMatch = partWithoutBlock
      .split("\n")
      .at(-1)!
      .match(/(^[\t ]*).*$/);
    if (indentationMatch) {
      indent = indentationMatch[1];
    }
    constructedCode.push(partWithoutBlock + indentedBlock.join("\n" + indent));
  }
  return constructedCode.join("");
};

const getInstructionString = ({
  apiName,
  instructionName,
  instructionArg,
}: {
  apiName: string;
  instructionName: string;
  instructionArg: Record<string, unknown>;
}) => {
  return `${apiName}("${instructionName}", ${JSON.stringify(instructionArg)});`;
};

const getEmbedUIInstructionString = ({
  apiName,
  theme,
  brandColor,
  hideEventTypeDetails,
  layout,
}: {
  apiName: string;
  theme?: string;
  brandColor: string;
  hideEventTypeDetails: boolean;
  layout?: string;
}) => {
  theme = theme !== "auto" ? theme : undefined;
  return getInstructionString({
    apiName,
    instructionName: "ui",
    instructionArg: {
      theme,
      styles: {
        branding: {
          brandColor,
        },
      },
      hideEventTypeDetails: hideEventTypeDetails,
      layout,
    },
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Codes: Record<string, Record<string, (...args: any[]) => string>> = {
  react: {
    inline: ({
      calLink,
      uiInstructionCode,
      previewState,
    }: {
      calLink: string;
      uiInstructionCode: string;
      previewState: PreviewState;
    }) => {
      const width = getDimension(previewState.inline.width);
      const height = getDimension(previewState.inline.height);
      return code`
import Cal, { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";
export default function MyApp() {
  useEffect(()=>{
    (async function () {
      const cal = await getCalApi();
      ${uiInstructionCode}
    })();
  }, [])
  return <Cal 
    calLink="${calLink}" 
    style={{width:"${width}",height:"${height}",overflow:"scroll"}}
    ${previewState.layout ? "config={{layout: '" + previewState.layout + "'}}" : ""}${
        IS_SELF_HOSTED
          ? `
    calOrigin="${EMBED_CAL_ORIGIN}"
    calJsUrl="${EMBED_CAL_JS_URL}"`
          : ""
      }
  />;
};`;
    },
    "floating-popup": ({
      floatingButtonArg,
      uiInstructionCode,
    }: {
      floatingButtonArg: string;
      uiInstructionCode: string;
    }) => {
      return code`
import { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";
export default function App() {
  useEffect(()=>{
    (async function () {
      const cal = await getCalApi(${IS_SELF_HOSTED ? `"${EMBED_CAL_JS_URL}"` : ""});
      cal("floatingButton", ${floatingButtonArg});
      ${uiInstructionCode}
    })();
  }, [])
};`;
    },
    "element-click": ({
      calLink,
      uiInstructionCode,
      previewState,
    }: {
      calLink: string;
      uiInstructionCode: string;
      previewState: PreviewState;
    }) => {
      return code`
import { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";
export default function App() {
  useEffect(()=>{
    (async function () {
      const cal = await getCalApi(${IS_SELF_HOSTED ? `"${EMBED_CAL_JS_URL}"` : ""});
      ${uiInstructionCode}
    })();
  }, [])
  return <button 
    data-cal-link="${calLink}"${IS_SELF_HOSTED ? `\ndata-cal-origin="${EMBED_CAL_ORIGIN}"` : ""}
    ${`data-cal-config='${JSON.stringify({
      layout: previewState.layout,
    })}'`}  
    >Click me</button>;
};`;
    },
  },
  HTML: {
    inline: ({
      calLink,
      uiInstructionCode,
      previewState,
    }: {
      calLink: string;
      uiInstructionCode: string;
      previewState: PreviewState;
    }) => {
      return code`Cal("inline", {
  elementOrSelector:"#my-cal-inline",
  calLink: "${calLink}",
  layout: "${previewState.layout}"
});

${uiInstructionCode}`;
    },

    "floating-popup": ({
      floatingButtonArg,
      uiInstructionCode,
    }: {
      floatingButtonArg: string;
      uiInstructionCode: string;
    }) => {
      return code`Cal("floatingButton", ${floatingButtonArg});
${uiInstructionCode}`;
    },
    "element-click": ({
      calLink,
      uiInstructionCode,
      previewState,
    }: {
      calLink: string;
      uiInstructionCode: string;
      previewState: PreviewState;
    }) => {
      return code`
// Important: Please add following attributes to the element you want to open Cal on click
// \`data-cal-link="${calLink}"\` 
// \`data-cal-config='${JSON.stringify({
        layout: previewState.layout,
      })}'\` 

${uiInstructionCode}`;
    },
  },
};

const getEmbedTypeSpecificString = ({
  embedFramework,
  embedType,
  calLink,
  previewState,
}: {
  embedFramework: EmbedFramework;
  embedType: EmbedType;
  calLink: string;
  previewState: PreviewState;
}) => {
  const frameworkCodes = Codes[embedFramework];
  if (!frameworkCodes) {
    throw new Error(`No code available for the framework:${embedFramework}`);
  }
  let uiInstructionStringArg: {
    apiName: string;
    theme: PreviewState["theme"];
    brandColor: string;
    hideEventTypeDetails: boolean;
    layout?: BookerLayout;
  };
  if (embedFramework === "react") {
    uiInstructionStringArg = {
      apiName: "cal",
      theme: previewState.theme,
      brandColor: previewState.palette.brandColor,
      hideEventTypeDetails: previewState.hideEventTypeDetails,
      layout: previewState.layout,
    };
  } else {
    uiInstructionStringArg = {
      apiName: "Cal",
      theme: previewState.theme,
      brandColor: previewState.palette.brandColor,
      hideEventTypeDetails: previewState.hideEventTypeDetails,
      layout: previewState.layout,
    };
  }
  if (!frameworkCodes[embedType]) {
    throw new Error(`Code not available for framework:${embedFramework} and embedType:${embedType}`);
  }
  if (embedType === "inline") {
    return frameworkCodes[embedType]({
      calLink,
      uiInstructionCode: getEmbedUIInstructionString(uiInstructionStringArg),
      previewState,
    });
  } else if (embedType === "floating-popup") {
    const floatingButtonArg = {
      calLink,
      ...(IS_SELF_HOSTED ? { calOrigin: EMBED_CAL_ORIGIN } : null),
      ...previewState.floatingPopup,
    };
    return frameworkCodes[embedType]({
      floatingButtonArg: JSON.stringify(floatingButtonArg),
      uiInstructionCode: getEmbedUIInstructionString(uiInstructionStringArg),
      previewState,
    });
  } else if (embedType === "element-click") {
    return frameworkCodes[embedType]({
      calLink,
      uiInstructionCode: getEmbedUIInstructionString(uiInstructionStringArg),
      previewState,
    });
  }
  return "";
};

const embeds = (t: TFunction) =>
  (() => {
    return [
      {
        title: t("inline_embed"),
        subtitle: t("load_inline_content"),
        type: "inline",
        illustration: (
          <svg
            width="100%"
            height="100%"
            className="rounded-md"
            viewBox="0 0 308 265"
            fill="none"
            xmlns="http://www.w3.org/2000/svg">
            <path
              d="M0 1.99999C0 0.895423 0.895431 0 2 0H306C307.105 0 308 0.895431 308 2V263C308 264.105 307.105 265 306 265H2C0.895431 265 0 264.105 0 263V1.99999Z"
              fill="white"
            />
            <rect x="24" width="260" height="38.5" rx="6" fill="#F3F4F6" />
            <rect x="24.5" y="51" width="139" height="163" rx="1.5" fill="#F8F8F8" />
            <rect opacity="0.8" x="48" y="74.5" width="80" height="8" rx="6" fill="#F3F4F6" />
            <rect x="48" y="86.5" width="48" height="4" rx="6" fill="#F3F4F6" />
            <rect x="49" y="99.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="61" y="99.5" width="6" height="6" rx="1" fill="#3E3E3E" />
            <rect x="73" y="99.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="85" y="99.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="97" y="99.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="109" y="99.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="121" y="99.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="133" y="99.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="85" y="113.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="97" y="113.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="109" y="113.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="121" y="113.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="133" y="113.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="49" y="125.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="61" y="125.5" width="6" height="6" rx="1" fill="#3E3E3E" />
            <path
              d="M61 124.5H67V122.5H61V124.5ZM68 125.5V131.5H70V125.5H68ZM67 132.5H61V134.5H67V132.5ZM60 131.5V125.5H58V131.5H60ZM61 132.5C60.4477 132.5 60 132.052 60 131.5H58C58 133.157 59.3431 134.5 61 134.5V132.5ZM68 131.5C68 132.052 67.5523 132.5 67 132.5V134.5C68.6569 134.5 70 133.157 70 131.5H68ZM67 124.5C67.5523 124.5 68 124.948 68 125.5H70C70 123.843 68.6569 122.5 67 122.5V124.5ZM61 122.5C59.3431 122.5 58 123.843 58 125.5H60C60 124.948 60.4477 124.5 61 124.5V122.5Z"
              fill="#3E3E3E"
            />
            <rect x="73" y="125.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="85" y="125.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="97" y="125.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="109" y="125.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="121" y="125.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="133" y="125.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="49" y="137.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="61" y="137.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="73" y="137.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="85" y="137.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="97" y="137.5" width="6" height="6" rx="1" fill="#3E3E3E" />
            <rect x="109" y="137.5" width="6" height="6" rx="1" fill="#3E3E3E" />
            <rect x="121" y="137.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="133" y="137.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="49" y="149.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="61" y="149.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="73" y="149.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="85" y="149.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="97" y="149.5" width="6" height="6" rx="1" fill="#3E3E3E" />
            <rect x="109" y="149.5" width="6" height="6" rx="1" fill="#3E3E3E" />
            <rect x="121" y="149.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="133" y="149.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="49" y="161.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="61" y="161.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="73" y="161.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="85" y="161.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="97" y="161.5" width="6" height="6" rx="1" fill="#3E3E3E" />
            <rect x="109" y="161.5" width="6" height="6" rx="1" fill="#C6C6C6" />
            <rect x="24.5" y="51" width="139" height="163" rx="6" stroke="#292929" />
            <rect x="176" y="50.5" width="108" height="164" rx="6" fill="#F3F4F6" />
            <rect x="24" y="226.5" width="260" height="38.5" rx="6" fill="#F3F4F6" />
          </svg>
        ),
      },
      {
        title: t("floating_pop_up_button"),
        subtitle: t("floating_button_trigger_modal"),
        type: "floating-popup",
        illustration: (
          <svg
            width="100%"
            height="100%"
            className="rounded-md"
            viewBox="0 0 308 265"
            fill="none"
            xmlns="http://www.w3.org/2000/svg">
            <path
              d="M0 1.99999C0 0.895423 0.895431 0 2 0H306C307.105 0 308 0.895431 308 2V263C308 264.105 307.105 265 306 265H2C0.895431 265 0 264.105 0 263V1.99999Z"
              fill="white"
            />
            <rect x="24" width="260" height="38.5" rx="6" fill="#F3F4F6" />
            <rect x="24" y="50.5" width="120" height="76" rx="6" fill="#F3F4F6" />
            <rect x="24" y="138.5" width="120" height="76" rx="6" fill="#F3F4F6" />
            <rect x="156" y="50.5" width="128" height="164" rx="6" fill="#F3F4F6" />
            <rect x="24" y="226.5" width="260" height="38.5" rx="6" fill="#F3F4F6" />
            <rect x="226" y="223.5" width="66" height="26" rx="6" fill="#292929" />
            <rect x="242" y="235.5" width="34" height="2" rx="1" fill="white" />
          </svg>
        ),
      },
      {
        title: t("pop_up_element_click"),
        subtitle: t("open_dialog_with_element_click"),
        type: "element-click",
        illustration: (
          <svg
            width="100%"
            height="100%"
            className="rounded-md"
            viewBox="0 0 308 265"
            fill="none"
            xmlns="http://www.w3.org/2000/svg">
            <path
              d="M0 1.99999C0 0.895423 0.895431 0 2 0H306C307.105 0 308 0.895431 308 2V263C308 264.105 307.105 265 306 265H2C0.895431 265 0 264.105 0 263V1.99999Z"
              fill="white"
            />
            <rect x="24" y="0.50293" width="260" height="24" rx="6" fill="#F3F4F6" />
            <rect x="24" y="35" width="259" height="192" rx="5.5" fill="#F9FAFB" />
            <g filter="url(#filter0_i_3223_14162)">
              <rect opacity="0.8" x="40" y="99" width="24" height="24" rx="2" fill="#E5E7EB" />
              <rect x="40" y="127" width="48" height="8" rx="1" fill="#E5E7EB" />
              <rect x="40" y="139" width="82" height="8" rx="1" fill="#E5E7EB" />
              <rect x="40" y="151" width="34" height="4" rx="1" fill="#E5E7EB" />
              <rect x="40" y="159" width="34" height="4" rx="1" fill="#E5E7EB" />
            </g>
            <rect x="152" y="48" width="2" height="169" rx="2" fill="#E5E7EB" />

            <rect opacity="0.8" x="176" y="84" width="80" height="8" rx="2" fill="#E5E7EB" />
            <rect x="176" y="96" width="48" height="4" rx="1" fill="#E5E7EB" />
            <rect x="177" y="109" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="189" y="109" width="6" height="6" rx="1" fill="#0D121D" />
            <rect x="201" y="109" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="213" y="109" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="225" y="109" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="237" y="109" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="249" y="109" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="261" y="109" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="213" y="123" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="225" y="123" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="237" y="123" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="249" y="123" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="261" y="123" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="177" y="135" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="189" y="135" width="6" height="6" rx="1" fill="#0D121D" />
            <rect x="187.3" y="133.4" width="9" height="9" rx="1.5" stroke="#0D121D" />
            <rect x="201" y="135" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="213" y="135" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="225" y="135" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="237" y="135" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="249" y="135" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="261" y="135" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="177" y="147" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="189" y="147" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="201" y="147" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="213" y="147" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="225" y="147" width="6" height="6" rx="1" fill="#0D121D" />
            <rect x="237" y="147" width="6" height="6" rx="1" fill="#0D121D" />
            <rect x="249" y="147" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="261" y="147" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="177" y="159" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="189" y="159" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="201" y="159" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="213" y="159" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="225" y="159" width="6" height="6" rx="1" fill="#0D121D" />
            <rect x="237" y="159" width="6" height="6" rx="1" fill="#0D121D" />
            <rect x="249" y="159" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="261" y="159" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="177" y="171" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="189" y="171" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="201" y="171" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="213" y="171" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="225" y="171" width="6" height="6" rx="1" fill="#0D121D" />
            <rect x="237" y="171" width="6" height="6" rx="1" fill="#E5E7EB" />
            <rect x="24" y="35" width="259" height="192" rx="5.5" stroke="#101010" />
            <rect x="24" y="241.503" width="260" height="24" rx="6" fill="#F3F4F6" />
          </svg>
        ),
      },
    ];
  })();

const tabs = [
  {
    name: "HTML",
    href: "embedTabName=embed-code",
    icon: Code,
    type: "code",
    Component: forwardRef<
      HTMLTextAreaElement | HTMLIFrameElement | null,
      { embedType: EmbedType; calLink: string; previewState: PreviewState }
    >(function EmbedHtml({ embedType, calLink, previewState }, ref) {
      const { t } = useLocale();
      if (ref instanceof Function || !ref) {
        return null;
      }
      if (ref.current && !(ref.current instanceof HTMLTextAreaElement)) {
        return null;
      }
      return (
        <>
          <div>
            <small className="text-subtle flex py-4">
              {t("place_where_cal_widget_appear", { appName: APP_NAME })}
            </small>
          </div>
          <TextArea
            data-testid="embed-code"
            ref={ref as typeof ref & MutableRefObject<HTMLTextAreaElement>}
            name="embed-code"
            className="text-default bg-default selection:bg-subtle h-[calc(100%-50px)] font-mono"
            style={{ resize: "none", overflow: "auto" }}
            readOnly
            value={
              `<!-- Cal ${embedType} embed code begins -->\n` +
              (embedType === "inline"
                ? `<div style="width:${getDimension(previewState.inline.width)};height:${getDimension(
                    previewState.inline.height
                  )};overflow:scroll" id="my-cal-inline"></div>\n`
                : "") +
              `<script type="text/javascript">
${getEmbedSnippetString()}
${getEmbedTypeSpecificString({ embedFramework: "HTML", embedType, calLink, previewState })}
</script>
<!-- Cal ${embedType} embed code ends -->`
            }
          />
          <p className="text-subtle hidden text-sm">{t("need_help_embedding")}</p>
        </>
      );
    }),
  },
  {
    name: "React",
    href: "embedTabName=embed-react",
    icon: Code,
    type: "code",
    Component: forwardRef<
      HTMLTextAreaElement | HTMLIFrameElement | null,
      { embedType: EmbedType; calLink: string; previewState: PreviewState }
    >(function EmbedReact({ embedType, calLink, previewState }, ref) {
      const { t } = useLocale();
      if (ref instanceof Function || !ref) {
        return null;
      }
      if (ref.current && !(ref.current instanceof HTMLTextAreaElement)) {
        return null;
      }
      return (
        <>
          <small className="text-subtle flex py-4">{t("create_update_react_component")}</small>
          <TextArea
            data-testid="embed-react"
            ref={ref as typeof ref & MutableRefObject<HTMLTextAreaElement>}
            name="embed-react"
            className="text-default bg-default selection:bg-subtle h-[calc(100%-50px)] font-mono"
            readOnly
            style={{ resize: "none", overflow: "auto" }}
            value={`/* First make sure that you have installed the package */

/* If you are using yarn */
// yarn add @calcom/embed-react

/* If you are using npm */
// npm install @calcom/embed-react
${getEmbedTypeSpecificString({ embedFramework: "react", embedType, calLink, previewState })}
`}
          />
        </>
      );
    }),
  },
  {
    name: "Preview",
    href: "embedTabName=embed-preview",
    icon: Trello,
    type: "iframe",
    Component: forwardRef<
      HTMLIFrameElement | HTMLTextAreaElement | null,
      { calLink: string; embedType: EmbedType; previewState: PreviewState }
    >(function Preview({ calLink, embedType }, ref) {
      if (ref instanceof Function || !ref) {
        return null;
      }
      if (ref.current && !(ref.current instanceof HTMLIFrameElement)) {
        return null;
      }
      return (
        <iframe
          ref={ref as typeof ref & MutableRefObject<HTMLIFrameElement>}
          data-testid="embed-preview"
          className="h-[100vh] border"
          width="100%"
          height="100%"
          src={`${WEBAPP_URL}/embed/preview.html?embedType=${embedType}&calLink=${calLink}`}
        />
      );
    }),
  },
];

function getEmbedSnippetString() {
  // TODO: Import this string from @calcom/embed-snippet
  return `(function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document; C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; typeof namespace === "string" ? (cal.ns[namespace] = api) && p(api, ar) : p(cal, ar); return; } p(cal, ar); }; })(window, "${EMBED_LIB_URL}", "init");
Cal("init", {origin:"${WEBAPP_URL}"});
`;
}

const ThemeSelectControl = ({ children, ...props }: ControlProps<{ value: Theme; label: string }, false>) => {
  return (
    <components.Control {...props}>
      <Sun className="text-subtle mr-2 h-4 w-4" />
      {children}
    </components.Control>
  );
};

const ChooseEmbedTypesDialogContent = () => {
  const { t } = useLocale();
  const router = useRouter();

  return (
    <DialogContent className="rounded-lg p-10" type="creation" size="lg">
      <div className="mb-2">
        <h3 className="font-cal text-emphasis mb-2 text-2xl font-bold leading-none" id="modal-title">
          {t("how_you_want_add_cal_site", { appName: APP_NAME })}
        </h3>
        <div>
          <p className="text-subtle text-sm">{t("choose_ways_put_cal_site", { appName: APP_NAME })}</p>
        </div>
      </div>
      <div className="items-start space-y-2 md:flex md:space-y-0">
        {embeds(t).map((embed, index) => (
          <button
            className="hover:bg-subtle bg-muted w-full rounded-md border border-transparent p-6 text-left hover:rounded-md ltr:mr-4 ltr:last:mr-0 rtl:ml-4 rtl:last:ml-0 lg:w-1/3"
            key={index}
            data-testid={embed.type}
            onClick={() => {
              goto(router, {
                embedType: embed.type,
              });
            }}>
            <div className="bg-default order-none box-border flex-none rounded-md border border-solid dark:bg-transparent dark:invert">
              {embed.illustration}
            </div>
            <div className="text-emphasis mt-4 font-semibold">{embed.title}</div>
            <p className="text-subtle mt-2 text-sm">{embed.subtitle}</p>
          </button>
        ))}
      </div>
    </DialogContent>
  );
};

const EmbedTypeCodeAndPreviewDialogContent = ({
  embedType,
  embedUrl,
}: {
  embedType: EmbedType;
  embedUrl: string;
}) => {
  const { t } = useLocale();

  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const flags = useFlagMap();
  const isBookerLayoutsEnabled = flags["booker-layouts"] === true;

  const s = (href: string) => {
    const searchParams = new URLSearchParams(router.asPath.split("?")[1] || "");
    const [a, b] = href.split("=");
    searchParams.set(a, b);
    return `${router.asPath.split("?")[0]}?${searchParams.toString()}`;
  };
  const parsedTabs = tabs.map((t) => ({ ...t, href: s(t.href) }));
  const embedCodeRefs: Record<(typeof tabs)[0]["name"], RefObject<HTMLTextAreaElement>> = {};
  tabs
    .filter((tab) => tab.type === "code")
    .forEach((codeTab) => {
      embedCodeRefs[codeTab.name] = createRef();
    });

  const refOfEmbedCodesRefs = useRef(embedCodeRefs);
  const embed = embeds(t).find((embed) => embed.type === embedType);

  const [isEmbedCustomizationOpen, setIsEmbedCustomizationOpen] = useState(true);
  const [isBookingCustomizationOpen, setIsBookingCustomizationOpen] = useState(true);
  const [previewState, setPreviewState] = useState<PreviewState>({
    inline: {
      width: "100%",
      height: "100%",
    },
    theme: Theme.auto,
    layout: BookerLayouts.MONTH_VIEW,
    floatingPopup: {},
    elementClick: {},
    hideEventTypeDetails: false,
    palette: {
      brandColor: "#000000",
    },
  });

  const close = () => {
    removeQueryParams(router, ["dialog", ...queryParamsForDialog]);
  };

  // Use embed-code as default tab
  if (!router.query.embedTabName) {
    goto(router, {
      embedTabName: "embed-code",
    });
  }

  if (!embed || !embedUrl) {
    close();
    return null;
  }

  const calLink = decodeURIComponent(embedUrl);

  const addToPalette = (update: (typeof previewState)["palette"]) => {
    setPreviewState((previewState) => {
      return {
        ...previewState,
        palette: {
          ...previewState.palette,
          ...update,
        },
      };
    });
  };

  const previewInstruction = (instruction: { name: string; arg: unknown }) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        mode: "cal:preview",
        type: "instruction",
        instruction,
      },
      "*"
    );
  };

  const inlineEmbedDimensionUpdate = ({ width, height }: { width: string; height: string }) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        mode: "cal:preview",
        type: "inlineEmbedDimensionUpdate",
        data: {
          width: getDimension(width),
          height: getDimension(height),
        },
      },
      "*"
    );
  };

  previewInstruction({
    name: "ui",
    arg: {
      theme: previewState.theme,
      layout: previewState.layout,
      hideEventTypeDetails: previewState.hideEventTypeDetails,
      styles: {
        branding: {
          ...previewState.palette,
        },
      },
    },
  });

  if (embedType === "floating-popup") {
    previewInstruction({
      name: "floatingButton",
      arg: {
        attributes: {
          id: "my-floating-button",
        },
        ...previewState.floatingPopup,
      },
    });
  }

  if (embedType === "inline") {
    inlineEmbedDimensionUpdate({
      width: previewState.inline.width,
      height: previewState.inline.height,
    });
  }

  const ThemeOptions = [
    { value: Theme.auto, label: "Auto" },
    { value: Theme.dark, label: "Dark Theme" },
    { value: Theme.light, label: "Light Theme" },
  ];

  const layoutOptions = [
    { value: BookerLayouts.MONTH_VIEW, label: t("bookerlayout_month_view") },
    { value: BookerLayouts.WEEK_VIEW, label: t("bookerlayout_week_view") },
    { value: BookerLayouts.COLUMN_VIEW, label: t("bookerlayout_column_view") },
  ];

  const FloatingPopupPositionOptions = [
    {
      value: "bottom-right",
      label: "Bottom right",
    },
    {
      value: "bottom-left",
      label: "Bottom left",
    },
  ];

  return (
    <DialogContent
      ref={dialogContentRef}
      className="rounded-lg p-0.5 sm:max-w-[80rem]"
      enableOverflow
      type="creation">
      <div className="flex">
        <div className="bg-muted flex w-1/3 flex-col p-8">
          <h3
            className="text-emphasis mb-2.5 flex items-center text-xl font-semibold leading-5"
            id="modal-title">
            <button
              className="h-6 w-6"
              onClick={() => {
                removeQueryParams(router, ["embedType", "embedTabName"]);
              }}>
              <ArrowLeft className="mr-4 w-4" />
            </button>
            {embed.title}
          </h3>
          <h4 className="text-subtle mb-6 text-sm font-normal">{embed.subtitle}</h4>
          <div className="flex flex-col">
            <div className={classNames("font-medium", embedType === "element-click" ? "hidden" : "")}>
              <Collapsible
                open={isEmbedCustomizationOpen}
                onOpenChange={() => setIsEmbedCustomizationOpen((val) => !val)}>
                <CollapsibleContent className="text-sm">
                  <div className={classNames(embedType === "inline" ? "block" : "hidden")}>
                    {/*TODO: Add Auto/Fixed toggle from Figma */}
                    <div className="text-default mb-[9px] text-sm">Window sizing</div>
                    <div className="justify-left mb-6 flex items-center !font-normal ">
                      <div className="mr-[9px]">
                        <TextField
                          labelProps={{ className: "hidden" }}
                          className="focus:ring-offset-0"
                          required
                          value={previewState.inline.width}
                          onChange={(e) => {
                            setPreviewState((previewState) => {
                              const width = e.target.value || "100%";

                              return {
                                ...previewState,
                                inline: {
                                  ...previewState.inline,
                                  width,
                                },
                              };
                            });
                          }}
                          addOnLeading={<>W</>}
                        />
                      </div>

                      <TextField
                        labelProps={{ className: "hidden" }}
                        className="focus:ring-offset-0"
                        value={previewState.inline.height}
                        required
                        onChange={(e) => {
                          const height = e.target.value || "100%";

                          setPreviewState((previewState) => {
                            return {
                              ...previewState,
                              inline: {
                                ...previewState.inline,
                                height,
                              },
                            };
                          });
                        }}
                        addOnLeading={<>H</>}
                      />
                    </div>
                  </div>
                  <div
                    className={classNames(
                      "items-center justify-between",
                      embedType === "floating-popup" ? "text-emphasis" : "hidden"
                    )}>
                    <div className="mb-2 text-sm">Button text</div>
                    {/* Default Values should come from preview iframe */}
                    <TextField
                      labelProps={{ className: "hidden" }}
                      onChange={(e) => {
                        setPreviewState((previewState) => {
                          return {
                            ...previewState,
                            floatingPopup: {
                              ...previewState.floatingPopup,
                              buttonText: e.target.value,
                            },
                          };
                        });
                      }}
                      defaultValue={t("book_my_cal")}
                      required
                    />
                  </div>
                  <div
                    className={classNames(
                      "mt-4 flex items-center justify-start",
                      embedType === "floating-popup"
                        ? "text-emphasis space-x-2 rtl:space-x-reverse"
                        : "hidden"
                    )}>
                    <Switch
                      defaultChecked={true}
                      onCheckedChange={(checked) => {
                        setPreviewState((previewState) => {
                          return {
                            ...previewState,
                            floatingPopup: {
                              ...previewState.floatingPopup,
                              hideButtonIcon: !checked,
                            },
                          };
                        });
                      }}
                    />
                    <div className="text-default my-2 text-sm">Display calendar icon</div>
                  </div>
                  <div
                    className={classNames(
                      "mt-4 items-center justify-between",
                      embedType === "floating-popup" ? "text-emphasis" : "hidden"
                    )}>
                    <div className="mb-2">Position of button</div>
                    <Select
                      onChange={(position) => {
                        setPreviewState((previewState) => {
                          return {
                            ...previewState,
                            floatingPopup: {
                              ...previewState.floatingPopup,
                              buttonPosition: position?.value,
                            },
                          };
                        });
                      }}
                      defaultValue={FloatingPopupPositionOptions[0]}
                      options={FloatingPopupPositionOptions}
                    />
                  </div>
                  <div className="mt-3 flex flex-col xl:flex-row xl:justify-between">
                    <div className={classNames("mt-4", embedType === "floating-popup" ? "" : "hidden")}>
                      <div className="whitespace-nowrap">Button color</div>
                      <div className="mt-2 w-40 xl:mt-0 xl:w-full">
                        <ColorPicker
                          className="w-[130px]"
                          popoverAlign="start"
                          container={dialogContentRef?.current ?? undefined}
                          defaultValue="#000000"
                          onChange={(color) => {
                            setPreviewState((previewState) => {
                              return {
                                ...previewState,
                                floatingPopup: {
                                  ...previewState.floatingPopup,
                                  buttonColor: color,
                                },
                              };
                            });
                          }}
                        />
                      </div>
                    </div>
                    <div className={classNames("mt-4", embedType === "floating-popup" ? "" : "hidden")}>
                      <div className="whitespace-nowrap">Text color</div>
                      <div className="mb-6 mt-2 w-40 xl:mt-0 xl:w-full">
                        <ColorPicker
                          className="w-[130px]"
                          popoverAlign="start"
                          container={dialogContentRef?.current ?? undefined}
                          defaultValue="#000000"
                          onChange={(color) => {
                            setPreviewState((previewState) => {
                              return {
                                ...previewState,
                                floatingPopup: {
                                  ...previewState.floatingPopup,
                                  buttonTextColor: color,
                                },
                              };
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
            <div className="font-medium">
              <Collapsible
                open={isBookingCustomizationOpen}
                onOpenChange={() => setIsBookingCustomizationOpen((val) => !val)}>
                <CollapsibleContent>
                  <div className="text-sm">
                    <Label className="mb-6">
                      <div className="mb-2">Theme</div>
                      <Select
                        className="w-full"
                        defaultValue={ThemeOptions[0]}
                        components={{
                          Control: ThemeSelectControl,
                          IndicatorSeparator: () => null,
                        }}
                        onChange={(option) => {
                          if (!option) {
                            return;
                          }
                          setPreviewState((previewState) => {
                            return {
                              ...previewState,
                              theme: option.value,
                            };
                          });
                        }}
                        options={ThemeOptions}
                      />
                    </Label>
                    <div className="mb-6 flex items-center justify-start space-x-2 rtl:space-x-reverse">
                      <Switch
                        checked={previewState.hideEventTypeDetails}
                        onCheckedChange={(checked) => {
                          setPreviewState((previewState) => {
                            return {
                              ...previewState,
                              hideEventTypeDetails: checked,
                            };
                          });
                        }}
                      />
                      <div className="text-default text-sm">{t("hide_eventtype_details")}</div>
                    </div>
                    {[
                      { name: "brandColor", title: "Brand Color" },
                      // { name: "lightColor", title: "Light Color" },
                      // { name: "lighterColor", title: "Lighter Color" },
                      // { name: "lightestColor", title: "Lightest Color" },
                      // { name: "highlightColor", title: "Highlight Color" },
                      // { name: "medianColor", title: "Median Color" },
                    ].map((palette) => (
                      <Label key={palette.name} className="mb-6">
                        <div className="mb-2">{palette.title}</div>
                        <div className="w-full">
                          <ColorPicker
                            popoverAlign="start"
                            container={dialogContentRef?.current ?? undefined}
                            defaultValue="#000000"
                            onChange={(color) => {
                              addToPalette({
                                [palette.name as keyof (typeof previewState)["palette"]]: color,
                              });
                            }}
                          />
                        </div>
                      </Label>
                    ))}
                    {isBookerLayoutsEnabled && (
                      <Label className="mb-6">
                        <div className="mb-2">{t("layout")}</div>
                        <Select
                          className="w-full"
                          defaultValue={layoutOptions[0]}
                          onChange={(option) => {
                            if (!option) {
                              return;
                            }
                            setPreviewState((previewState) => {
                              const config = {
                                ...(previewState.floatingPopup.config ?? {}),
                                layout: option.value,
                              };
                              return {
                                ...previewState,
                                floatingPopup: {
                                  config,
                                },
                                layout: option.value,
                              };
                            });
                          }}
                          options={layoutOptions}
                        />
                      </Label>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
        <div className="flex w-2/3 flex-col p-8">
          <HorizontalTabs data-testid="embed-tabs" tabs={parsedTabs} linkProps={{ shallow: true }} />
          {tabs.map((tab) => {
            return (
              <div
                key={tab.href}
                className={classNames(
                  router.query.embedTabName === tab.href.split("=")[1] ? "flex flex-grow flex-col" : "hidden"
                )}>
                <div className="flex h-[55vh] flex-grow flex-col">
                  {tab.type === "code" ? (
                    <tab.Component
                      embedType={embedType}
                      calLink={calLink}
                      previewState={previewState}
                      ref={refOfEmbedCodesRefs.current[tab.name]}
                    />
                  ) : (
                    <tab.Component
                      embedType={embedType}
                      calLink={calLink}
                      previewState={previewState}
                      ref={iframeRef}
                    />
                  )}
                </div>
                <div className={router.query.embedTabName == "embed-preview" ? "block" : "hidden"} />
                <div className="mt-8 flex flex-row-reverse gap-x-2">
                  {tab.type === "code" ? (
                    <Button
                      type="submit"
                      onClick={() => {
                        const currentTabCodeEl = refOfEmbedCodesRefs.current[tab.name].current;
                        if (!currentTabCodeEl) {
                          return;
                        }
                        navigator.clipboard.writeText(currentTabCodeEl.value);
                        showToast(t("code_copied"), "success");
                      }}>
                      {t("copy_code")}
                    </Button>
                  ) : null}
                  <DialogClose />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DialogContent>
  );
};

export const EmbedDialog = () => {
  const router = useRouter();
  const embedUrl: string = router.query.embedUrl as string;
  return (
    <Dialog name="embed" clearQueryParamsOnClose={queryParamsForDialog}>
      {!router.query.embedType ? (
        <ChooseEmbedTypesDialogContent />
      ) : (
        <EmbedTypeCodeAndPreviewDialogContent
          embedType={router.query.embedType as EmbedType}
          embedUrl={embedUrl}
        />
      )}
    </Dialog>
  );
};
type EmbedButtonProps<T> = {
  embedUrl: string;
  children?: React.ReactNode;
  className?: string;
  as?: T;
};

export const EmbedButton = <T extends React.ElementType>({
  embedUrl,
  children,
  className = "",
  as,
  ...props
}: EmbedButtonProps<T> & React.ComponentPropsWithoutRef<T>) => {
  const router = useRouter();
  className = classNames("hidden lg:inline-flex", className);
  const openEmbedModal = () => {
    goto(router, {
      dialog: "embed",
      embedUrl,
    });
  };
  const Component = as ?? Button;

  return (
    <Component
      {...props}
      className={className}
      data-test-embed-url={embedUrl}
      data-testid="embed"
      type="button"
      onClick={() => {
        openEmbedModal();
      }}>
      {children}
    </Component>
  );
};
