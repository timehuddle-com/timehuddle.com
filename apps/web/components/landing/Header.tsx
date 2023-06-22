import Link from "next/link";

import { Logo } from "@calcom/ui";

export default function Header() {
  return (
    <section className="bg-white">
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
    </section>
  );
}
