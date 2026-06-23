// Short audio lessons. Each script is a plain-language summary of material
// published by a U.S. government agency or major nonprofit. The source URL
// is shown to the user with every lesson so claims can be verified.
// Do not add lessons whose facts cannot be traced to the linked source.

export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  source: string;
  sourceUrl: string;
  takeaways: string[];
  script: string; // narrated text
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
      "Welcome. In this short lesson we will walk through how to build your first budget, using the framework the Consumer Financial Protection Bureau publishes in its Your Money Your Goals toolkit. " +
      "A budget is simply a plan for the money you expect to receive and the money you expect to spend. It is not about restriction. It is about visibility. " +
      "Start with three lists. First, the money you actually bring home each month, after taxes. Second, your fixed bills — rent, insurance, loan payments, anything that is the same number every month. Third, flexible spending — groceries, gas, eating out, subscriptions. " +
      "Subtract the fixed bills from your take-home pay. Whatever is left is the pool you have to cover flexible spending, savings, and debt payments. " +
      "If the number is negative, that is useful information, not a failure. It tells you the next decision is either to reduce fixed costs, raise income, or both. " +
      "Finally, revisit the plan at the end of every month. The first version of a budget is almost always wrong, and that is normal. The point is to keep adjusting until the plan matches your real life. " +
      "For the full toolkit, including printable worksheets, see the source link below.",
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
      "You do not need a large fund to start. The FDIC materials note that even a few hundred dollars can keep a household out of new debt during a typical unexpected expense. " +
      "Two practical habits help. First, keep the fund in a separate savings account, ideally one without a debit card attached, so you do not spend it by accident. Second, automate even a small transfer on payday — five, ten, or twenty dollars. Consistency matters more than the amount. " +
      "Once you have a starter fund, the common next goal is to build up to roughly three to six months of essential expenses, but only after higher-interest debt is under control. " +
      "The full Money Smart curriculum is free to download from the FDIC. The link is below.",
  },
  {
    id: "credit-score",
    title: "What actually moves your credit score",
    minutes: 3,
    source: "Consumer Financial Protection Bureau · Credit reports & scores",
    sourceUrl:
      "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/",
    takeaways: [
      "Payment history and how much of your available credit you use matter the most.",
      "You are entitled to free weekly credit reports at AnnualCreditReport.com.",
      "Errors on your report can be disputed — and they are common.",
    ],
    script:
      "This is a brief overview of credit scores, drawing on the consumer guidance published by the Consumer Financial Protection Bureau. " +
      "Your credit score is a three-digit number that lenders use to estimate how likely you are to repay borrowed money. The most influential factors, according to the CFPB, are your payment history — that is, whether you pay your bills on time — and your credit utilization, which is the percentage of your available credit you are actually using. " +
      "The length of your credit history, the mix of credit types you have, and recent applications for new credit also play a role, but a smaller one. " +
      "Two practical points. First, you have a legal right to a free copy of your credit report from each of the three nationwide credit bureaus, every week, at annualcreditreport.com. This is the official site authorized by federal law. " +
      "Second, errors on credit reports are common, and you have the right to dispute them. The CFPB provides free sample dispute letters on its site. " +
      "Improving a credit score is slow but predictable: pay on time, keep balances low relative to limits, and check your reports for mistakes. " +
      "See the source link for the full CFPB consumer guide.",
  },
  {
    id: "investing-roadmap",
    title: "A beginner's investing roadmap",
    minutes: 4,
    source: "U.S. Securities and Exchange Commission · Investor.gov",
    sourceUrl:
      "https://www.investor.gov/sites/investorgov/files/2019-02/Saving-and-Investing.pdf",
    takeaways: [
      "Cover high-interest debt and an emergency fund before investing.",
      "Fees compound just like returns — small percentages matter a lot over time.",
      "Diversification reduces, but does not eliminate, risk.",
    ],
    script:
      "This lesson summarizes the SEC's free publication, Saving and Investing: A Roadmap to Your Financial Security. " +
      "Before investing, the SEC recommends two foundations: pay down high-interest debt, especially credit cards, and build an emergency fund. Investing into the stock market while paying twenty or thirty percent interest on a credit card almost never comes out ahead. " +
      "When you are ready to invest, the SEC stresses three ideas that beginners often underestimate. " +
      "First, time is the most powerful tool you have. Money invested early has decades to compound, and the SEC's own examples show that even modest, regular contributions can grow substantially over thirty or forty years. " +
      "Second, fees matter more than they look. A one-percent annual fee may sound small, but over a working lifetime it can quietly cost tens of thousands of dollars. Always ask what the total expense ratio is before investing in a fund. " +
      "Third, diversification — owning many different investments instead of just one — reduces risk, but it does not eliminate it. All investing involves the possibility of loss. " +
      "The SEC also warns about one of the most common ways people lose money: investment fraud. If an offer promises guaranteed high returns with no risk, or pressures you to act immediately, it is almost certainly a scam. You can verify whether a person or firm is licensed at investor.gov. " +
      "The full SEC roadmap is linked below. It is free, and it is one of the clearest beginner guides written by a regulator.",
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
      "The FTC has identified a small set of patterns that show up in nearly every scam, regardless of the story being told. " +
      "First, the scammer pretends to be someone you would trust — a government agency, a well-known company, a relative, or a romantic interest. " +
      "Second, there is a problem or a prize. You owe money, your account will be closed, you have won something, or a loved one is in trouble. " +
      "Third, you are pressured to act immediately, before you have time to think or check. " +
      "Fourth, you are told to pay in a very specific way: a wire transfer, a gift card, a money-transfer app, or cryptocurrency. These methods are used because they are nearly impossible to reverse. " +
      "No legitimate U.S. government agency, bank, or utility will ever demand payment in gift cards or crypto. If anyone does, it is a scam. " +
      "If you encounter a scam, or if you have been hit by one, you can report it to the FTC at reportfraud.ftc.gov. Reporting helps the FTC build cases and warn others, even if your own money cannot be recovered. " +
      "Full guidance is at the source link below.",
  },
];

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}
