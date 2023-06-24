export default function HowItWorks() {
  return (
    <section className="bg-white py-10 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl">
            What is Timehuddle?
          </h2>
          <p className="mx-auto mt-4 text-base leading-relaxed text-gray-600">
            Timehuddle is a powerful tool designed to help individual and businesses manage their appointment
            scheduling needs. With features such as real-time availability, automated reminders, and
            customizable booking forms, Timehuddle streamlines the booking process and saves its users time
            and money. Timehuddle has been designed as a plug-n-play model for various business cases, such
            as:
          </p>
        </div>

        <div className="relative mt-12 lg:mt-20">
          <div className="absolute inset-x-0 top-2 hidden md:block md:px-20 lg:px-28 xl:px-44">
            <img
              className="w-full"
              src="https://cdn.rareblocks.xyz/collection/celebration/images/steps/2/curved-dotted-line.svg"
              alt=""
            />
          </div>

          <div className="relative grid grid-cols-1 gap-x-12 gap-y-12 text-center md:grid-cols-3">
            <div>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-200 bg-white shadow">
                <span className="text-xl font-semibold text-gray-700"> 1 </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold leading-tight text-black md:mt-10">
                Individual tradesman
              </h3>
              <p className="mt-4 text-base text-gray-600">
                Timehuddle can help individual tradesmen improve their business operations and provide better
                service to their clients. By streamlining the booking process and improving customer
                communication, tradesmen can save time and increase revenue.
              </p>
            </div>

            <div>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-200 bg-white shadow">
                <span className="text-xl font-semibold text-gray-700"> 2 </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold leading-tight text-black md:mt-10">
                Salons and Spas
              </h3>
              <p className="mt-4 text-base text-gray-600">
                Timehuddle can help manage appointments for multiple stylists or therapists. With customizable
                booking forms, clients can easily select their preferred service, date, and time, ensuring a
                seamless booking experience. Real-time availability ensures that double bookings are avoided,
                while automated reminders reduce no-shows and last-minute cancellations.
              </p>
            </div>

            <div>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-200 bg-white shadow">
                <span className="text-xl font-semibold text-gray-700"> 3 </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold leading-tight text-black md:mt-10">
                Education and Training
              </h3>
              <p className="mt-4 text-base text-gray-600">
                Timehuddle can help manage student appointments with instructors or advisors. With
                customizable booking forms, students can easily select their preferred date and time for
                appointments, while real-time availability ensures that double bookings are avoided. Automated
                reminders ensure that students don't miss important appointments, improving student engagement
                and satisfaction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
