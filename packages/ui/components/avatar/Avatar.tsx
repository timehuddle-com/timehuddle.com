import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import Link from "next/link";

import classNames from "@calcom/lib/classNames";
import { defaultAvatarSrc } from "@calcom/lib/defaultAvatarImage";

import type { Maybe } from "@trpc/server";

import { Check } from "../icon";
import { Tooltip } from "../tooltip";

export type AvatarProps = {
  className?: string;
  size: "xxs" | "xs" | "xsm" | "sm" | "md" | "mdLg" | "lg" | "xl";
  imageSrc?: Maybe<string>;
  title?: string;
  alt: string;
  href?: string;
  gravatarFallbackMd5?: string;
  fallback?: React.ReactNode;
  accepted?: boolean;
  asChild?: boolean; // Added to ignore the outer span on the fallback component - messes up styling
};

const sizesPropsBySize = {
  xxs: "w-3.5 h-3.5 min-w-3.5 min-h-3.5", // 14px
  xs: "w-4 h-4 min-w-4 min-h-4 max-h-4", // 16px
  xsm: "w-5 h-5 min-w-5 min-h-5", // 20px
  sm: "w-6 h-6 min-w-6 min-h-6", // 24px
  md: "w-8 h-8 min-w-8 min-h-8", // 32px
  mdLg: "w-10 h-10 min-w-10 min-h-10", //40px
  lg: "w-16 h-16 min-w-16 min-h-16", // 64px
  xl: "w-24 h-24 min-w-24 min-h-24", // 96px
} as const;

export function Avatar(props: AvatarProps) {
  const { imageSrc, gravatarFallbackMd5, size, alt, title, href } = props;
  const rootClass = classNames("aspect-square rounded-full", sizesPropsBySize[size]);
  let avatar = (
    <AvatarPrimitive.Root
      className={classNames(
        "bg-emphasis item-center relative inline-flex aspect-square justify-center overflow-hidden rounded-full",
        props.className,
        sizesPropsBySize[size]
      )}>
      <>
        <AvatarPrimitive.Image
          src={imageSrc ?? undefined}
          alt={alt}
          className={classNames("aspect-square rounded-full", sizesPropsBySize[size])}
        />
        <AvatarPrimitive.Fallback delayMs={600} asChild={props.asChild} className="flex items-center">
          <>
            {props.fallback && !gravatarFallbackMd5 && props.fallback}
            {gravatarFallbackMd5 && (
              <img src={defaultAvatarSrc({ md5: gravatarFallbackMd5 })} alt={alt} className={rootClass} />
            )}
          </>
        </AvatarPrimitive.Fallback>
        {props.accepted && (
          <div
            className={classNames(
              "text-inverted absolute bottom-0 right-0 block rounded-full bg-green-400 ring-2 ring-white",
              size === "lg" ? "h-5 w-5" : "h-2 w-2"
            )}>
            <div className="flex h-full items-center justify-center p-[2px]">
              {size === "lg" && <Check />}
            </div>
          </div>
        )}
      </>
    </AvatarPrimitive.Root>
  );

  if (href) {
    avatar = <Link href={href}>{avatar}</Link>;
  }

  return title ? (
    <TooltipPrimitive.Provider>
      <Tooltip content={title}>{avatar}</Tooltip>
    </TooltipPrimitive.Provider>
  ) : (
    <>{avatar}</>
  );
}
