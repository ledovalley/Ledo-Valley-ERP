// Supabase returns at most 1,000 rows per request (Project Settings > API > Max rows).
// selectAllPages loads a list page by page so nothing is silently left out.
// The query passed in must have a stable order (end with an order on a unique
// column such as id) so no row is skipped or repeated between pages.

export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function selectAllPages<T = any>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
