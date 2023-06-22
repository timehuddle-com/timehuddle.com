import { Suspense } from "react";

import NoSSR from "@calcom/core/components/NoSSR";
import { Meta, SkeletonText, SkeletonContainer } from "@calcom/ui";

import { FlagAdminList } from "../components/FlagAdminList";

const SkeletonLoader = () => {
  return (
    <SkeletonContainer>
      <div className="divide-subtle mt-6 mb-8 space-y-6">
        <SkeletonText className="h-8 w-full" />
        <SkeletonText className="h-8 w-full" />
      </div>
    </SkeletonContainer>
  );
};

export const FlagListingView = () => {
  return (
    <>
      <Meta title="Feature Flags" description="Here you can toggle your Timehuddle instance features." />
      <NoSSR>
        <Suspense fallback={<SkeletonLoader />}>
          <FlagAdminList />
        </Suspense>
      </NoSSR>
    </>
  );
};
