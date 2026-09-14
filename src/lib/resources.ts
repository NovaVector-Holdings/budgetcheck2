// All resources below are real, free, and publicly accessible.
// Sources are intentionally limited to government agencies, major nonprofits,
// public-service projects, and well-established educational institutions.
// Do not add unverified links.

export type Resource = {
  title: string;
  url: string;
  source: string; // organization that publishes the resource
  why: string; // 1-line, factual description
  free: true;
  format: "Guide" | "Workbook" | "Course" | "Tool" | "Directory" | "Article";
};

export const learnResources: Resource[] = [
  {
    title: "Money Smart for Adults",
    url: "https://www.fdic.gov/resources/consumers/money-smart/teach-money-smart/money-smart-for-adults.html",
    source: "FDIC (U.S. government)",
    why: "Free 14-module financial education curriculum with participant guides and instructor materials.",
    free: true,
    format: "Course",
  },
  {
    title: "Personal Finance (full course)",
    url: "https://www.khanacademy.org/college-careers-more/personal-finance",
    source: "Khan Academy (nonprofit)",
    why: "Free video lessons covering budgeting, saving, credit, taxes, investing, and housing.",
    free: true,
    format: "Course",
  },
  {
    title: "MyMoney Five",
    url: "https://www.mymoney.gov/",
    source: "U.S. Financial Literacy and Education Commission",
    why: "Federal hub organized around five money principles: earn, save & invest, protect, spend, borrow.",
    free: true,
    format: "Course",
  },
  {
    title: "Investing Basics",
    url: "https://www.investor.gov/introduction-investing",
    source: "U.S. Securities and Exchange Commission",
    why: "Plain-language intro to investing from the federal regulator, including fee and risk calculators.",
    free: true,
    format: "Course",
  },
];

export const readResources: Resource[] = [
  {
    title: "Your Money, Your Goals (toolkit)",
    url: "https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/",
    source: "Consumer Financial Protection Bureau",
    why: "Downloadable PDF toolkit and worksheets for budgeting, debt, and money decisions.",
    free: true,
    format: "Workbook",
  },
  {
    title: "Saving and Investing: A Roadmap",
    url: "https://www.investor.gov/sites/investorgov/files/2019-02/Saving-and-Investing.pdf",
    source: "U.S. Securities and Exchange Commission",
    why: "Free SEC PDF guide to saving, investing, and avoiding fraud.",
    free: true,
    format: "Guide",
  },
  {
    title: "Consumer Information library",
    url: "https://consumer.ftc.gov/articles",
    source: "Federal Trade Commission",
    why: "Hundreds of free, plain-language articles on credit, debt, scams, and contracts.",
    free: true,
    format: "Article",
  },
  {
    title: "Bogleheads Wiki: Getting Started",
    url: "https://www.bogleheads.org/wiki/Getting_started",
    source: "Bogleheads (volunteer investor community)",
    why: "Long-running, source-cited wiki on low-cost, evidence-based personal investing.",
    free: true,
    format: "Guide",
  },
  {
    title: "Practical Money Skills resources",
    url: "https://www.practicalmoneyskills.com/en/resources.html",
    source: "Practical Money Skills (Visa public-service)",
    why: "Free budgeting worksheets, calculators, and lesson plans.",
    free: true,
    format: "Workbook",
  },
];

export const earnResources: Resource[] = [
  {
    title: "Find a Job (national portal)",
    url: "https://www.careeronestop.org/JobSearch/job-search.aspx",
    source: "CareerOneStop · U.S. Department of Labor",
    why: "Aggregates millions of openings from public and private job boards; filter by location.",
    free: true,
    format: "Directory",
  },
  {
    title: "USAJOBS (federal jobs)",
    url: "https://www.usajobs.gov/",
    source: "U.S. Office of Personnel Management",
    why: "Official site for U.S. federal government jobs, internships, and pathways.",
    free: true,
    format: "Directory",
  },
  {
    title: "American Job Centers near you",
    url: "https://www.careeronestop.org/LocalHelp/AmericanJobCenters/american-job-centers.aspx",
    source: "U.S. Department of Labor",
    why: "Free in-person help with job search, training, and résumés. Search by ZIP.",
    free: true,
    format: "Directory",
  },
  {
    title: "Job Scams: how to spot them",
    url: "https://consumer.ftc.gov/articles/job-scams",
    source: "Federal Trade Commission",
    why: "Read this BEFORE responding to gig, work-from-home, or reshipping offers.",
    free: true,
    format: "Article",
  },
  {
    title: "Find local training & apprenticeships",
    url: "https://www.apprenticeship.gov/apprenticeship-job-finder",
    source: "Apprenticeship.gov · U.S. Department of Labor",
    why: "Search registered apprenticeship programs — paid training that builds a career.",
    free: true,
    format: "Directory",
  },
];

export const helpResources: Resource[] = [
  {
    title: "211 — health & human-services help",
    url: "https://www.211.org/",
    source: "United Way Worldwide",
    why: "Dial 2-1-1 or search by ZIP for local food, rent, utility, childcare, and crisis assistance.",
    free: true,
    format: "Directory",
  },
  {
    title: "USA.gov Benefit Finder",
    url: "https://www.usa.gov/benefit-finder",
    source: "U.S. General Services Administration",
    why: "Free federal benefit-finder tool -- browse by life event or category to find benefit programs you may be eligible for.",
    free: true,
    format: "Tool",
  },
  {
    title: "LIHEAP — heating & cooling bill help",
    url: "https://acf.gov/ocs/programs/liheap",
    source: "Administration for Children and Families (U.S. Dept. of Health & Human Services)",
    why: "Federal program that helps low-income households with energy bills and weatherization.",
    free: true,
    format: "Tool",
  },
  {
    title: "Find free tax prep (VITA / TCE)",
    url: "https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers",
    source: "Internal Revenue Service",
    why: "Free in-person tax prep through VITA and TCE. VITA generally serves lower- and moderate-income and other qualifying taxpayers; TCE focuses on taxpayers age 60+.",
    free: true,
    format: "Tool",
  },
  {
    title: "Find a nonprofit credit counselor",
    url: "https://www.nfcc.org/",
    source: "National Foundation for Credit Counseling",
    why: "Long-established nonprofit network offering free or low-cost credit & debt counseling.",
    free: true,
    format: "Directory",
  },
  {
    title: "SNAP (food assistance) — apply",
    url: "https://fna.usda.gov/snap/state-directory",
    source: "USDA Food and Nutrition Administration",
    why: "State-by-state directory to apply for the Supplemental Nutrition Assistance Program.",
    free: true,
    format: "Directory",
  },
];
