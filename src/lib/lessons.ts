// Short audio lessons. Each script is a plain-language summary of material
// published by a U.S. government agency or major nonprofit. The source URL
// is shown to the user with every lesson so claims can be verified.
// Do not add lessons whose facts cannot be traced to the linked source.

type MoneyMeetingTab = "weekly" | "monthly" | "ask" | "plans" | "statements" | "data";

export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  source: string;
  sourceUrl: string;
  /** For a lesson that draws on more than one named source (e.g. a claim
   *  the primary source doesn't itself cover) -- rendered alongside the
   *  primary source link so a multi-source lesson never pretends to have
   *  only one. Omit entirely for single-source lessons. */
  additionalSources?: { source: string; sourceUrl: string }[];
  takeaways: string[];
  script: string; // narrated text
  /** Closes the Learn -> Apply loop: where in Money Meeting this lesson's
   *  idea actually gets used, and why (shown as the CTA's own label). */
  applyTo: { tab: MoneyMeetingTab; label: string };
};

export const lessons: Lesson[] = [
  {
    id: "budget-basics",
    title: "Building your first budget",
    minutes: 3,
    source: "Consumer Financial Protection Bureau · Budgeting tools",
    sourceUrl:
      "https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/",
    takeaways: [
      "A budget is just a plan for the money coming in and going out.",
      "Track income, fixed bills, and flexible spending separately.",
      "Review and adjust the plan every month — it is meant to change.",
    ],
    script:
      "Welcome. In this short lesson we will walk through how to build your first budget, drawing on ideas from the cash-flow budgeting tools in the Consumer Financial Protection Bureau's Your Money, Your Goals toolkit. " +
      "A budget is simply a plan for the money you expect to receive and the money you expect to spend. It is not about restriction. It is about visibility. " +
      "Start with three lists. First, the money you actually bring home each month, after taxes. Second, your fixed bills — rent, insurance, loan payments, anything that is the same number every month. Third, flexible spending — groceries, gas, eating out, subscriptions. " +
      "Subtract the fixed bills from your take-home pay. Whatever is left is the pool you have to cover flexible spending, savings, and debt payments. " +
      "If the number is negative, that is useful information, not a failure. It tells you the next decision is either to reduce fixed costs, raise income, or both. " +
      "Finally, revisit the plan at the end of every month. The first version of a budget is almost always wrong, and that is normal. The point is to keep adjusting until the plan matches your real life. " +
      "For the full toolkit, including printable worksheets, see the source link below.",
    applyTo: { tab: "data", label: "Enter your own numbers" },
  },
  {
    id: "emergency-fund",
    title: "Why an emergency fund comes first",
    minutes: 3,
    source: "FDIC Money Smart for Adults · Module on Saving",
    sourceUrl:
      "https://www.fdic.gov/resources/consumers/money-smart/teach-money-smart/money-smart-for-adults.html",
    takeaways: [
      "An emergency fund protects you from going into debt over surprises.",
      "Even a small starter fund — a few hundred dollars — is meaningful.",
      "Keep it in a separate account so it is not easy to spend by accident.",
    ],
    script:
      "This lesson summarizes a topic covered in the FDIC's free Money Smart for Adults curriculum: the emergency fund. " +
      "An emergency fund is money you set aside specifically for unexpected costs — a car repair, a medical bill, a gap between jobs. " +
      "The reason this comes before paying down most debts is simple. Without a buffer, the next surprise expense almost always gets paid for with a credit card or a high-interest loan, which makes the original debt problem worse. " +
      "You do not need a large fund to start. Even a small starter fund — a few hundred dollars — can be enough to keep a typical unexpected expense from turning into new debt. " +
      "Two practical habits help. First, keep the fund in a separate savings account, ideally one without a debit card attached, so you do not spend it by accident. Second, automate even a small transfer on payday — five, ten, or twenty dollars. Consistency matters more than the amount. " +
      "Once you have a starter fund, the common next goal is to build up to roughly three to six months of essential expenses, but only after higher-interest debt is under control. " +
      "The full Money Smart curriculum is free to download from the FDIC. The link is below.",
    applyTo: { tab: "data", label: "Set aside your starter fund" },
  },
  {
    id: "credit-score",
    title: "What actually moves your credit score",
    minutes: 3,
    source: "Consumer Financial Protection Bureau · Understand your credit score",
    sourceUrl:
      "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/understand-your-credit-score/",
    additionalSources: [
      {
        source: "AnnualCreditReport.com (official site, jointly run by the three credit bureaus)",
        sourceUrl: "https://www.annualcreditreport.com/index.action",
      },
    ],
    takeaways: [
      "Paying bills on time has the greatest impact on your score.",
      "Staying well below your credit limits also matters.",
      "If your credit report contains an error, you have the right to dispute it.",
    ],
    script:
      "This is a brief overview of credit scores, drawing on the consumer guidance published by the Consumer Financial Protection Bureau. " +
      "Your credit score is a three-digit number that lenders use to estimate how likely you are to repay borrowed money. Paying your bills on time, every time, has the greatest impact on your score, according to the CFPB. " +
      "Staying well below your credit limit also matters — credit scoring models look at how close you are to being maxed out, and the CFPB suggests keeping your use of credit at no more than 30 percent of your total limit. " +
      "The length of your credit history and how many accounts you have also play a role, and things like your mix of credit types and recent applications for new credit are commonly cited as smaller factors too. " +
      "Two practical points. First, if you find something wrong on your credit report, you have the right to dispute it — contact both the credit reporting company and the company that gave them the information, explain what's wrong, and include documents that support your case. " +
      "Second, you can check your credit report for free every week from each of the three major credit bureaus at AnnualCreditReport.com. " +
      "Improving a credit score is slow but predictable: pay on time, keep balances low relative to limits, and check your reports for mistakes. " +
      "See the source links below for the full CFPB guide and AnnualCreditReport.com.",
    applyTo: { tab: "weekly", label: "Bring this to this week's check-in" },
  },
  {
    id: "investing-roadmap",
    title: "A beginner's investing roadmap",
    minutes: 4,
    source: "U.S. Securities and Exchange Commission · Investor.gov",
    sourceUrl: "https://www.investor.gov/sites/investorgov/files/2019-02/Saving-and-Investing.pdf",
    takeaways: [
      "Cover high-interest debt and an emergency fund before investing.",
      "Fees compound just like returns — small percentages matter a lot over time.",
      "Diversification reduces, but does not eliminate, risk.",
    ],
    script:
      "This lesson summarizes the SEC's free publication, Saving and Investing: A Roadmap to Your Financial Security. " +
      "Before investing, the SEC recommends two foundations: pay down high-interest debt, especially credit cards, and build an emergency fund. Investing into the stock market while paying eighteen percent or more interest on a credit card almost never comes out ahead — the SEC notes that virtually no investment can reliably beat a credit card rate that high. " +
      "When you are ready to invest, the SEC stresses three ideas that beginners often underestimate. " +
      "First, time is the most powerful tool you have. The SEC gives a simple example: saving $1 a day for one year gives you $365. If that one $365 amount were invested at 5% and left alone, it would grow to about $1,577.50 after 30 years — no additional contributions needed. " +
      "Second, fees matter more than they look. Fees may sound small, but the SEC's own brochure warns that even small fees can eat into a significant chunk of your returns over the years you hold an investment — so it's worth comparing costs between similar funds. Always ask what a fund actually costs before investing in it. " +
      "Third, diversification — owning many different investments instead of just one — reduces risk, but it does not eliminate it. All investing involves the possibility of loss. " +
      'The SEC also warns about one of the most common ways people lose money: investment fraud. If an offer promises quick profits, dangles "inside information," or pressures you to invest before you\'ve had a chance to look into it, the SEC says those are classic warning signs of fraud. You can check whether a person or firm is registered with the SEC, and confirm their license and disciplinary history with your state securities regulator through NASAA at nasaa.org. ' +
      "The full SEC roadmap is linked below. It is free, and it is one of the clearest beginner guides written by a regulator.",
    applyTo: { tab: "plans", label: "See your debt payoff plan first" },
  },
  {
    id: "spot-scams",
    title: "How to spot money scams",
    minutes: 3,
    source: "Federal Trade Commission · Consumer Advice",
    sourceUrl: "https://consumer.ftc.gov/scams",
    takeaways: [
      "Scammers create urgency and ask for unusual payment methods.",
      "No legitimate agency demands gift cards, wire transfers, or crypto.",
      "Report scams to the FTC at reportfraud.ftc.gov.",
    ],
    script:
      "This is a short overview of how to recognize money scams, based on guidance from the Federal Trade Commission. " +
      "The FTC lists several common warning signs that show up in most scams, no matter what story the scammer is telling. " +
      "First, the scammer pretends to be someone you would trust — a government agency, a well-known company, a relative, or a romantic interest. " +
      "Second, there is a problem or a prize. You owe money, your account will be closed, you have won something, or a loved one is in trouble. " +
      "Third, you are pressured to act immediately, before you have time to think or check. " +
      "Fourth, you are told to pay in a very specific way: a wire transfer, a gift card, a money-transfer app, or cryptocurrency. These methods are used because they are nearly impossible to reverse. " +
      "No legitimate U.S. government agency, bank, or utility will ever demand payment in gift cards or crypto. If anyone does, it is a scam. " +
      "If you encounter a scam, or if you have been hit by one, you can report it to the FTC at reportfraud.ftc.gov. Reporting helps the FTC take action against scammers — the agency says your report could help stop them, even if it can't undo what already happened to you. " +
      "Full guidance is at the source link below.",
    applyTo: { tab: "statements", label: "Review your last statement" },
  },
];

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}
