import Link from "next/link";

import { Logo } from "@calcom/ui";
import { Linkedin, Twitter, Mail } from "@calcom/ui/components/icon";

export default function Footer() {
  return (
    <section className="bg-gray-50 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center xl:flex xl:items-center xl:justify-between xl:text-left">
          <div className="xl:flex xl:items-center xl:justify-start">
            <Logo inline={false} className="mx-auto mb-auto" />
          </div>

          <div className="mt-8 items-center xl:mt-0 xl:flex xl:justify-end xl:space-x-8">
            <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 xl:justify-end">
              <li>
                <Link
                  href="/privacy"
                  title=""
                  className="text-gray-600 transition-all duration-200 hover:text-opacity-80 focus:text-opacity-80">
                  {" "}
                  Privacy{" "}
                </Link>
              </li>

              <li>
                <Link
                  href="/terms"
                  title=""
                  className="text-gray-600 transition-all duration-200 hover:text-opacity-80 focus:text-opacity-80">
                  {" "}
                  Terms{" "}
                </Link>
              </li>
            </ul>

            <div className="mt-8 mb-5 h-px w-full bg-gray-50/20 xl:m-0 xl:h-6 xl:w-px"></div>

            <ul className="flex items-center justify-center space-x-8 xl:justify-end">
              <li>
                <Link href="https://www.linkedin.com/company/timehuddle" target="_blank">
                  <Linkedin color="grey" />
                </Link>
              </li>

              <li>
                <Link href="https://twitter.com/timehuddle" target="_blank">
                  <Twitter color="grey" />
                </Link>
              </li>

              <li>
                <Link href="mailto:support@timehuddle.com">
                  <Mail color="grey" />
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
