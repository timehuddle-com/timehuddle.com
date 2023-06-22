import { useState } from "react";

export default function FAQ() {
  const [faq, setFaq] = useState([
    {
      question: "How to create an account?",
      answer:
        'Amet minim mollit non deserunt ullamco est sit <a href="#" title="" class="text-emerald-600 transition-all duration-200 hover:underline">aliqua dolor</a> do amet sint. Velit officia consequat duis enim velit mollit.',
      open: false,
    },
    {
      question: "How can I make payment using Paypal?",
      answer:
        'Amet minim mollit non deserunt ullamco est sit <a href="#" title="" class="text-emerald-600 transition-all duration-200 hover:underline">aliqua dolor</a> do amet sint. Velit officia consequat duis enim velit mollit.',
      open: false,
    },
    {
      question: "Can I cancel my plan?",
      answer:
        'Amet minim mollit non deserunt ullamco est sit <a href="#" title="" class="text-emerald-600 transition-all duration-200 hover:underline">aliqua dolor</a> do amet sint. Velit officia consequat duis enim velit mollit.',
      open: false,
    },
    {
      question: "How can I reach to support?",
      answer:
        'Amet minim mollit non deserunt ullamco est sit <a href="#" title="" class="text-emerald-600 transition-all duration-200 hover:underline">aliqua dolor</a> do amet sint. Velit officia consequat duis enim velit mollit.',
      open: false,
    },
  ]);

  const toggleFaq = (index: number) => {
    setFaq(
      faq.map((item, i) => {
        if (i === index) {
          item.open = !item.open;
        } else {
          item.open = false;
        }

        return item;
      })
    );
  };
  return (
    <section className="bg-gray-50 py-10 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl">
            Frequently Asked Questions
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-600">
            Amet minim mollit non deserunt ullamco est sit aliqua dolor do
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-3xl space-y-4 md:mt-16">
          {faq.map((item, index) => (
            <div key={index} className="relative inline-flex sm:inline">
              <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-[#44BCFF] via-[#FF44EC] to-[#FF675E] opacity-30 blur-lg filter"></div>
              <div className="relative cursor-pointer border border-gray-200 bg-white transition-all duration-200 hover:bg-gray-50 md:mt-6">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-5 sm:p-6"
                  onClick={() => toggleFaq(index)}>
                  <span className="flex text-lg font-semibold text-black"> {item.question} </span>

                  <svg
                    className={`h-6 w-6 text-gray-400 ${item.open ? "rotate-180" : ""}`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className={`${item.open ? "block" : "hidden"} px-4 pb-5 sm:px-6 sm:pb-6`}>
                  <p dangerouslySetInnerHTML={{ __html: item.answer }}></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
