import {
  ClipboardList,
  Zap,
  Calendar,
  DollarSign,
  CircleSlash,
  UserPlus,
  ChevronsLeftRight,
  CheckCheck,
  CalendarClock,
  Users,
  Webhook,
  Grid,
} from "@calcom/ui/components/icon";

export default function Features() {
  return (
    <section className="bg-white py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold leading-tight text-gray-900 sm:text-4xl xl:text-5xl">
            Everyone can enjoy these
            <span className="relative inline-flex sm:inline">
              <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-[#44BCFF] via-[#FF44EC] to-[#FF675E] opacity-30 blur-lg filter"></span>
              <span className="relative"> features </span>
            </span>
          </h2>
          <p className="mt-6 text-base leading-7 text-gray-600 sm:mt-8">
            These features are suitable for all use cases, covering everything from start to finish.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-y-12 text-center sm:mt-16 sm:grid-cols-2 sm:gap-x-12 md:grid-cols-3 md:gap-0 xl:mt-24">
          <div className="md:p-8 lg:p-14">
            <ClipboardList className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Routing Forms</h3>
            <p className="mt-5 text-base text-gray-600">
              Direct your information to the desired destination and manage it in a manner that is optimal for
              both you and your company.
            </p>
          </div>

          <div className="md:border-l md:border-gray-200 md:p-8 lg:p-14">
            <Zap className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Workflows</h3>
            <p className="mt-5 text-base text-gray-600">
              Easy automation of notifications and reminders. This feature can be used to create processes for
              all your events.
            </p>
          </div>

          <div className="md:border-l md:border-gray-200 md:p-8 lg:p-14">
            <Calendar className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Recurring Events</h3>
            <p className="mt-5 text-base text-gray-600">
              Schedule events multiple times with ease. You can choose the frequency of the event and stick to
              a regular schedule that works for you.
            </p>
          </div>

          <div className="md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <DollarSign className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Payments</h3>
            <p className="mt-5 text-base text-gray-600">
              Easily accept payments before or after your meeting. You can use this feature to charge for your
              services or products.
            </p>
          </div>

          <div className="md:border-l md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <CircleSlash className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Round Robin</h3>
            <p className="mt-5 text-base text-gray-600">
              Schedule meetings with multiple people one at a time. Coordinate with multiple people and find a
              time that works for everyone.
            </p>
          </div>

          <div className="md:border-l md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <UserPlus className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Collective Scheduling</h3>
            <p className="mt-5 text-base text-gray-600">
              Book meetings with multiple coworkers. Checks other schedules and generates mutually agreeable
              times and dates for your upcoming meeting.
            </p>
          </div>

          <div className="md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <ChevronsLeftRight className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Embedding</h3>
            <p className="mt-5 text-base text-gray-600">
              Add a booking link to your website. With just a click of a button, you can embed your booking
              link without any redirects or hassle. This feature provides a simple booking experience for your
              customers.
            </p>
          </div>

          <div className="md:border-l md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <CheckCheck className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Opt In</h3>
            <p className="mt-5 text-base text-gray-600">
              Confirm meetings before they happen. Appointments are only added to
              your schedule after you confirm them. Don’t have to worry about your calendar being filled up with events you haven’t agreed to.
            </p>
          </div>

          <div className="md:border-l md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <CalendarClock className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Rescheduling</h3>
            <p className="mt-5 text-base text-gray-600">
              Simply select “Edit booking” and choose a new time or let the person who booked pick a new time.
              This feature ensures that rescheduling is effortless instead of onerous.
            </p>
          </div>

          <div className="md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <Users className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Teams</h3>
            <p className="mt-5 text-base text-gray-600">
              Scheduling product that has been built by and for teams. With this in mind, Timehuddle has
              created specific tools and resources to simplify scheduling.
            </p>
          </div>

          <div className="md:border-l md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <Webhook className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">Webhooks</h3>
            <p className="mt-5 text-base text-gray-600">
              Automate the flow with other apps when invitees schedule, cancel
              or reschedule events or when the meeting ends.
            </p>
          </div>

          <div className="md:border-l md:border-t md:border-gray-200 md:p-8 lg:p-14">
            <Grid className="mx-auto" width="46" height="46" />
            <h3 className="mt-12 text-xl font-bold text-gray-900">App Store</h3>
            <p className="mt-5 text-base text-gray-600">
              Extend your calendar with your favourite apps integrate other services with ease. Forever free!
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
