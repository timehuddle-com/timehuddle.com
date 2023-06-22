import Link from "next/link";

import { Logo } from "@calcom/ui";
import { LogIn } from "@calcom/ui/components/icon";

export default function Hero() {
  return (
    <div className="overflow-x-hidden bg-gray-50">
      <header className="relative py-4 md:py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative flex items-center justify-between">
            <div className="flex-shrink-0">
              <Logo inline={false} className="mx-auto mb-auto" />
            </div>

            <div className="flex items-center justify-center space-x-10">
              <Link
                href="/signup"
                title=""
                className="invisible rounded text-base font-medium text-gray-900 transition-all duration-200 hover:text-opacity-50 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-2 md:visible">
                {" "}
                Sign Up{" "}
              </Link>

              <Link
                href="/auth/login"
                title=""
                className="
                        rounded-xl
                        border
                        border-gray-900
                        bg-transparent
                        px-5
                        py-2
                        text-base
                        font-semibold
                        leading-7 text-gray-900
                        transition-all
                        duration-200
                        hover:bg-gray-900 hover:text-white focus:bg-gray-900 focus:text-white
                        focus:outline-none focus:ring-2
                        focus:ring-gray-900 focus:ring-offset-2
                    "
                role="button">
                Login
              </Link>
            </div>
          </div>
        </div>
      </header>

      <section className="relative py-12 sm:py-16 lg:pt-20 xl:pb-0">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mt-5 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl sm:leading-tight lg:text-6xl lg:leading-tight">
              Scheduling in advance made
              <span className="relative">
                <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-[#44BCFF] via-[#FF44EC] to-[#FF675E] opacity-30 blur-lg filter"></span>
                <span className="relative"> simple </span>
              </span>
            </h1>
            <p className="mx-auto mt-6 text-base leading-7 text-gray-600">
              Timehuddle is a platform designed for scheduling automation that eliminates the need for
              exchanging numerous emails to find the most suitable time.
            </p>

            <div className="mt-9 px-8 sm:flex sm:items-center sm:justify-center sm:space-x-5 sm:px-0">
              <Link
                href="/signup"
                title=""
                className="inline-flex w-full items-center justify-center rounded-xl border-2 border-transparent bg-gray-900 px-8 py-3 text-lg font-bold text-white transition-all duration-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 sm:w-auto"
                role="button">
                Get started for free
              </Link>

              <Link
                href="/auth/login"
                title=""
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl border-2 border-gray-400 px-6 py-3 text-lg font-bold text-gray-900 transition-all duration-200 hover:border-gray-900 hover:bg-gray-900 hover:text-white focus:border-gray-900 focus:bg-gray-900 focus:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 sm:mt-0 sm:w-auto"
                role="button">
                <LogIn className="mr-3" />
                Login
              </Link>
            </div>
            <p className="mt-8 text-base text-gray-500">No credit card required</p>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 mt-8 mb-8 lg:mt-16 lg:mb-16">
          <div className="mx-auto mt-8 grid max-w-md grid-cols-1 lg:mt-16 lg:max-w-full lg:grid-cols-3">
            <div className="p-4">
              <img
                className="relative mx-auto w-full"
                src="/bookerlayout_column_view.svg"
                alt=""
              />
            </div>

            <div className="p-4">
              <img
                className="relative mx-auto w-full"
                src="/bookerlayout_month_view.svg"
                alt=""
              />
            </div>

            <div className="p-4">
              <img
                className="relative mx-auto w-full"
                src="/bookerlayout_week_view.svg"
                alt=""
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
