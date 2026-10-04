/**
 * Marketplace job search (read-only). Requires the "Read marketplace Job Postings" and
 * "Common Entities - Read-Only Access" scopes on the API key.
 */
export const JOB_SEARCH_QUERY = /* GraphQL */ `
  query jobSearch(
    $marketPlaceJobFilter: MarketplaceJobPostingsSearchFilter
    $searchType: MarketplaceJobPostingSearchType
    $sortAttributes: [MarketplaceJobPostingSearchSortAttribute]
  ) {
    marketplaceJobPostingsSearch(
      marketPlaceJobFilter: $marketPlaceJobFilter
      searchType: $searchType
      sortAttributes: $sortAttributes
    ) {
      totalCount
      edges {
        node {
          id
          title
          description
          ciphertext
          createdDateTime
          publishedDateTime
          engagement
          duration
          durationLabel
          experienceLevel
          category
          subcategory
          amount { rawValue currency }
          hourlyBudgetType
          hourlyBudgetMin { rawValue currency }
          hourlyBudgetMax { rawValue currency }
          totalApplicants
          skills { name prettyName }
          client {
            totalHires
            totalPostedJobs
            totalSpent { rawValue currency }
            verificationStatus
            totalReviews
            totalFeedback
            location { country }
          }
        }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

interface Money {
  rawValue?: string | number | null;
  currency?: string | null;
}

export interface UpworkJobNode {
  id: string;
  title?: string | null;
  description?: string | null;
  ciphertext?: string | null;
  createdDateTime?: string | null;
  publishedDateTime?: string | null;
  engagement?: string | null;
  duration?: string | null;
  durationLabel?: string | null;
  experienceLevel?: string | null;
  category?: string | null;
  subcategory?: string | null;
  amount?: Money | null;
  hourlyBudgetType?: string | null;
  hourlyBudgetMin?: Money | null;
  hourlyBudgetMax?: Money | null;
  totalApplicants?: number | null;
  skills?: { name?: string | null; prettyName?: string | null }[] | null;
  client?: {
    totalHires?: number | null;
    totalPostedJobs?: number | null;
    totalSpent?: Money | null;
    verificationStatus?: string | null;
    totalReviews?: number | null;
    totalFeedback?: number | null;
    location?: { country?: string | null } | null;
  } | null;
}

export interface UpworkSearchResponse {
  data?: {
    marketplaceJobPostingsSearch?: {
      totalCount?: number;
      edges?: { node: UpworkJobNode }[];
      pageInfo?: { endCursor?: string | null; hasNextPage?: boolean };
    } | null;
  } | null;
  errors?: { message: string }[];
}
