// Learn Money source governance registry.
//
// This is the internal traceability/maintenance record for every lesson and
// resource Learn Money currently ships. It exists so "financial literacy
// you can verify" is an actual governed product capability, not just
// marketing copy: every entry tracks its own source, what kind of source it
// is, when it was last verified, and whether it currently needs a human
// recheck.
//
// Deliberately a typed array in the prototype, not a database table --
// there is no product need yet for dynamic editing of this data outside a
// normal code review, and a table would add write-surface/RLS questions
// this phase doesn't need. Revisit if Learn content ever needs runtime
// editing (e.g. a CMS) rather than code-reviewed updates.
//
// This metadata is NOT rendered prominently to users -- see LearnRegistryEntry
// below. It's for internal maintenance, not a user-facing citation format.

export type LearnCategory = "listen" | "read" | "earn" | "help";

export type SourceType =
  "federal_agency" | "state_local_government" | "established_nonprofit" | "other_public_service";

export type ReviewStatus = "active" | "needs_review" | "retired";

export interface LearnRegistryEntry {
  /** Matches the `id` on the Lesson record, or the `title` on the Resource record. */
  contentId: string;
  title: string;
  category: LearnCategory;
  sourceOrg: string;
  sourceUrl: string;
  sourceType: SourceType;
  /** Null when the resource has no particular geographic scope (most federal content). */
  geography: string | null;
  /** Null when general-audience; set when eligibility/audience narrows the resource. */
  audience: string | null;
  topic: string;
  /** The Money Meeting deep link this connects to, if any. Null = no Apply CTA --
   *  per the CEO's ruling, no forced CTA is better than an irrelevant one. */
  applyDestination: string | null;
  lastVerifiedOn: string; // ISO date
  freshnessRequirement: string;
  status: ReviewStatus;
  /** Set only when status is not "active" -- what a human still needs to check/fix. */
  reviewNote: string | null;
}

const VERIFIED = "2026-09-14"; // date of the full source-and-link audit this registry was built from

export const learnRegistry: LearnRegistryEntry[] = [
  // ---- Listen (audio lessons, src/lib/lessons.ts) ----
  {
    contentId: "budget-basics",
    title: "Building your first budget",
    category: "listen",
    sourceOrg: "Consumer Financial Protection Bureau",
    sourceUrl:
      "https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Building a first budget / cash-flow basics",
    applyDestination: "/money-meeting?tab=data",
    lastVerifiedOn: VERIFIED,
    freshnessRequirement:
      "Low -- evergreen method; recheck annually or if the CFPB toolkit is restructured",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "emergency-fund",
    title: "Why an emergency fund comes first",
    category: "listen",
    sourceOrg: "FDIC",
    sourceUrl:
      "https://www.fdic.gov/resources/consumers/money-smart/teach-money-smart/money-smart-for-adults.html",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Emergency-fund purpose and starter-fund sizing",
    applyDestination: "/money-meeting?tab=data",
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- evergreen guidance; recheck annually",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "credit-score",
    title: "What actually moves your credit score",
    category: "listen",
    sourceOrg: "Consumer Financial Protection Bureau",
    sourceUrl: "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Credit score factors, free reports, dispute rights",
    applyDestination: "/money-meeting?tab=weekly",
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- evergreen guidance; recheck annually",
    status: "active",
    reviewNote:
      "This CFPB page is a navigation hub with no factor-ranking content of its own -- the lesson's wording was corrected to stop attributing specific factor claims to it, but a more specific CFPB sub-page (if one exists) would make the citation stronger. Product judgment call, not a trust violation as currently worded.",
  },
  {
    contentId: "investing-roadmap",
    title: "A beginner's investing roadmap",
    category: "listen",
    sourceOrg: "U.S. Securities and Exchange Commission",
    sourceUrl: "https://www.investor.gov/sites/investorgov/files/2019-02/Saving-and-Investing.pdf",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Investing fundamentals: debt-first, compounding, fees, diversification, fraud",
    applyDestination: "/money-meeting?tab=plans",
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- evergreen brochure, unchanged since 2019; recheck annually",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "spot-scams",
    title: "How to spot money scams",
    category: "listen",
    sourceOrg: "Federal Trade Commission",
    sourceUrl: "https://consumer.ftc.gov/scams",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Common scam patterns and how to report them",
    applyDestination: "/money-meeting?tab=statements",
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- scam tactics evolve; recheck every 6 months",
    status: "active",
    reviewNote: null,
  },

  // ---- Read (src/lib/resources.ts -> readResources, plus the "full courses" learnResources) ----
  {
    contentId: "Money Smart for Adults",
    title: "Money Smart for Adults",
    category: "read",
    sourceOrg: "FDIC",
    sourceUrl:
      "https://www.fdic.gov/resources/consumers/money-smart/teach-money-smart/money-smart-for-adults.html",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "General financial-literacy curriculum (14 modules)",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- recheck annually",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "Personal Finance (full course)",
    title: "Personal Finance (full course)",
    category: "read",
    sourceOrg: "Khan Academy",
    sourceUrl: "https://www.khanacademy.org/college-careers-more/personal-finance",
    sourceType: "established_nonprofit",
    geography: null,
    audience: null,
    topic: "Full personal-finance course: budgeting, saving, credit, taxes, investing, housing",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- recheck annually",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "MyMoney Five",
    title: "MyMoney Five",
    category: "read",
    sourceOrg: "U.S. Financial Literacy and Education Commission",
    sourceUrl: "https://www.mymoney.gov/",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Five money principles: earn, save & invest, protect, spend, borrow",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- recheck annually",
    status: "active",
    reviewNote:
      "The five-principle content moved one click deeper (now at /mymoney-five-tools, confirmed still live and matching) rather than living on the homepage. Consider pointing the stored URL directly at that page.",
  },
  {
    contentId: "Investing Basics",
    title: "Investing Basics",
    category: "read",
    sourceOrg: "U.S. Securities and Exchange Commission",
    sourceUrl: "https://www.investor.gov/introduction-investing",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Intro to investing: compound growth, risk, diversification",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- recheck annually",
    status: "active",
    reviewNote:
      'Page names RMD/compound-interest/savings-goal calculators, not a literal named "fee calculator" the on-file why-text implies (risk itself is covered in its own section). Minor wording mismatch, not blocking.',
  },
  {
    contentId: "Your Money, Your Goals (toolkit)",
    title: "Your Money, Your Goals (toolkit)",
    category: "read",
    sourceOrg: "Consumer Financial Protection Bureau",
    sourceUrl:
      "https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Budgeting, debt, and money-decision worksheets",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- recheck annually",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "Saving and Investing: A Roadmap",
    title: "Saving and Investing: A Roadmap",
    category: "read",
    sourceOrg: "U.S. Securities and Exchange Commission",
    sourceUrl: "https://www.investor.gov/sites/investorgov/files/2019-02/Saving-and-Investing.pdf",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Saving/investing fundamentals and fraud avoidance",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- static PDF, unchanged since 2019; recheck annually",
    status: "active",
    reviewNote:
      "Automated fetchers (including our own link-health check) may get an HTTP 403 from investor.gov's bot protection. Confirmed live and correct via a real browser fetch of the PDF -- not a broken link for actual users.",
  },
  {
    contentId: "Consumer Information library",
    title: "Consumer Information library",
    category: "read",
    sourceOrg: "Federal Trade Commission",
    sourceUrl: "https://consumer.ftc.gov/articles",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Consumer-protection articles: credit, debt, scams, contracts",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- recheck every 6 months",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "Bogleheads Wiki: Getting Started",
    title: "Bogleheads Wiki: Getting Started",
    category: "read",
    sourceOrg: "Bogleheads (volunteer investor community)",
    sourceUrl: "https://www.bogleheads.org/wiki/Getting_started",
    sourceType: "other_public_service",
    geography: null,
    audience: null,
    topic: "Low-cost, evidence-based personal investing",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Low -- recheck annually",
    status: "needs_review",
    reviewNote:
      'A Cloudflare bot-wall blocked every automated verification attempt this cycle (WebFetch returned HTTP 402; a real browser session hit a persistent "Performing security verification" challenge that never cleared). The domain itself is correct and this is a long-established, well-known resource, so this reads as anti-bot protection rather than a disappeared/changed-hands page -- but the actual current article content was not confirmed. Needs a manual check in an ordinary browser before this can be marked active again.',
  },
  {
    contentId: "Practical Money Skills resources",
    title: "Practical Money Skills resources",
    category: "read",
    sourceOrg: "Practical Money Skills (Visa public-service)",
    sourceUrl: "https://www.practicalmoneyskills.com/en/resources.html",
    sourceType: "other_public_service",
    geography: null,
    audience: null,
    topic: "Budgeting worksheets, calculators, lesson plans",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- recheck every 6 months",
    status: "needs_review",
    reviewNote:
      "Live site currently blocks automated fetchers with a Cloudflare challenge. A ~11-month-old Wayback Machine snapshot (2025-10-23) confirms the resource was live and matching as of that date, but CDX records show the site was rebuilt on a new stack as recently as mid-2026 -- the exact /en/resources.html path should be manually reconfirmed post-redesign before this is marked active again.",
  },

  // ---- Earn (src/lib/resources.ts -> earnResources) ----
  {
    contentId: "Find a Job (national portal)",
    title: "Find a Job (national portal)",
    category: "earn",
    sourceOrg: "CareerOneStop (U.S. Department of Labor)",
    sourceUrl: "https://www.careeronestop.org/JobSearch/job-search.aspx",
    sourceType: "federal_agency",
    geography: "US-wide, filter by location",
    audience: null,
    topic: "National job search aggregator",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- recheck every 6 months",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "USAJOBS (federal jobs)",
    title: "USAJOBS (federal jobs)",
    category: "earn",
    sourceOrg: "U.S. Office of Personnel Management",
    sourceUrl: "https://www.usajobs.gov/",
    sourceType: "federal_agency",
    geography: "US-wide (federal positions)",
    audience: null,
    topic: "Federal job/internship search",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- recheck every 6 months",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "American Job Centers near you",
    title: "American Job Centers near you",
    category: "earn",
    sourceOrg: "CareerOneStop (U.S. Department of Labor)",
    sourceUrl:
      "https://www.careeronestop.org/LocalHelp/AmericanJobCenters/american-job-centers.aspx",
    sourceType: "federal_agency",
    geography: "Varies by location (US-wide network)",
    audience: null,
    topic: "In-person job search/training/résumé help locator",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- recheck every 6 months",
    status: "active",
    reviewNote:
      "Stored deep-link now redirects to the site root due to CareerOneStop's client-side routing; still lands correctly on the right finder page today. Update if the redirect is ever deprecated.",
  },
  {
    contentId: "Job Scams: how to spot them",
    title: "Job Scams: how to spot them",
    category: "earn",
    sourceOrg: "Federal Trade Commission",
    sourceUrl: "https://consumer.ftc.gov/articles/job-scams",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Recognizing gig/work-from-home/reshipping job scams",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- recheck every 6 months",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "Find local training & apprenticeships",
    title: "Find local training & apprenticeships",
    category: "earn",
    sourceOrg: "Apprenticeship.gov (U.S. Department of Labor)",
    sourceUrl: "https://www.apprenticeship.gov/apprenticeship-job-finder",
    sourceType: "federal_agency",
    geography: "Varies by location (US-wide network)",
    audience: null,
    topic: "Registered apprenticeship program search",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- recheck every 6 months",
    status: "active",
    reviewNote: null,
  },

  // ---- Get Help (src/lib/resources.ts -> helpResources) ----
  {
    contentId: "211 — health & human-services help",
    title: "211 — health & human-services help",
    category: "help",
    sourceOrg: "United Way Worldwide",
    sourceUrl: "https://www.211.org/",
    sourceType: "established_nonprofit",
    geography: "Varies by location (US/Canada 211 network)",
    audience: null,
    topic: "Local health/human-services referral (housing, utilities, food, crisis)",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "High -- local program availability changes; recheck every 3 months",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "USA.gov Benefit Finder",
    title: "USA.gov Benefit Finder",
    category: "help",
    sourceOrg: "U.S. General Services Administration",
    sourceUrl: "https://www.usa.gov/benefit-finder",
    sourceType: "federal_agency",
    geography: null,
    audience: null,
    topic: "Federal benefit-program eligibility screening",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "High -- program set/eligibility rules change; recheck every 3-6 months",
    status: "active",
    reviewNote:
      'Renamed and re-pointed this cycle: Benefits.gov was consolidated into USA.gov and the old benefits.gov/benefit-finder URL now redirects there. The new page presents as a life-event/category browser rather than the single anonymous questionnaire the old why-text described, so the previous "~1,000 programs" figure was dropped rather than carried forward unverified.',
  },
  {
    contentId: "LIHEAP — heating & cooling bill help",
    title: "LIHEAP — heating & cooling bill help",
    category: "help",
    sourceOrg: "Administration for Children and Families (U.S. Dept. of Health & Human Services)",
    sourceUrl: "https://acf.gov/ocs/programs/liheap",
    sourceType: "federal_agency",
    geography: "Varies by state (state-administered federal program)",
    audience: "Low-income households",
    topic: "Home energy-bill assistance",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement:
      "High -- state administration/eligibility varies; recheck every 3-6 months",
    status: "active",
    reviewNote:
      "URL updated this cycle: the old acf.hhs.gov host now 301-redirects to acf.gov; re-pointed to the current canonical address.",
  },
  {
    contentId: "Find free tax prep (VITA / TCE)",
    title: "Find free tax prep (VITA / TCE)",
    category: "help",
    sourceOrg: "Internal Revenue Service",
    sourceUrl:
      "https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers",
    sourceType: "federal_agency",
    geography: "Varies by location (local VITA/TCE sites)",
    audience: "Income-eligible filers (VITA); age 60+ (TCE)",
    topic: "Free in-person tax-filing help",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement:
      "High -- seasonal (tax season) and site-dependent; recheck every 3-6 months, and always ahead of filing season",
    status: "active",
    reviewNote:
      "URL fixed this cycle -- the old irs.treasury.gov/freetaxprep/ link had gone dead as a locator (301-redirects to the plain IRS homepage with no tax-prep content). Re-pointed to the current IRS page, which links out to the real VITA and TCE locator tools.",
  },
  {
    contentId: "Find a nonprofit credit counselor",
    title: "Find a nonprofit credit counselor",
    category: "help",
    sourceOrg: "National Foundation for Credit Counseling",
    sourceUrl: "https://www.nfcc.org/",
    sourceType: "established_nonprofit",
    geography: "US-wide network, local counselors",
    audience: null,
    topic: "Nonprofit credit/debt counseling referral",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement: "Medium -- recheck every 6 months",
    status: "active",
    reviewNote: null,
  },
  {
    contentId: "SNAP (food assistance) — apply",
    title: "SNAP (food assistance) — apply",
    category: "help",
    sourceOrg: "USDA Food and Nutrition Administration",
    sourceUrl: "https://fna.usda.gov/snap/state-directory",
    sourceType: "federal_agency",
    geography: "Varies by state",
    audience: "Income-eligible households",
    topic: "Applying for food assistance (SNAP)",
    applyDestination: null,
    lastVerifiedOn: VERIFIED,
    freshnessRequirement:
      "High -- state administration/eligibility varies; recheck every 3-6 months",
    status: "active",
    reviewNote:
      'Source name and URL updated this cycle: the agency rebranded from "USDA Food and Nutrition Service" to "USDA Food and Nutrition Administration," and fns.usda.gov now redirects to fna.usda.gov -- re-pointed to the current name and canonical address.',
  },
];

export function getRegistryEntry(contentId: string): LearnRegistryEntry | undefined {
  return learnRegistry.find((e) => e.contentId === contentId);
}

export function entriesNeedingReview(): LearnRegistryEntry[] {
  return learnRegistry.filter((e) => e.status === "needs_review");
}
