import { Part } from '@/types';

export type PartSearchResult = { material: string; part: Part; score: number };

const normalize = (value: string) => value
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const isSubsequence = (query: string, value: string) => {
  let queryIndex = 0;
  for (let index = 0; index < value.length && queryIndex < query.length; index += 1) {
    if (value[index] === query[queryIndex]) queryIndex += 1;
  }
  return queryIndex === query.length;
};

const editDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const tokenScore = (query: string, value: string) => {
  if (!query) return 0;
  if (value === query) return 100;
  if (value.startsWith(query)) return 85 - Math.min(value.length - query.length, 15);
  if (value.includes(query)) return 65 - Math.min(value.indexOf(query), 15);

  const words = value.split(' ');
  if (words.some(word => word.startsWith(query))) return 58;
  if (query.length >= 3 && isSubsequence(query, value.replace(/ /g, ''))) return 42;

  if (query.length >= 4) {
    const tolerance = query.length >= 8 ? 2 : 1;
    if (words.some(word => Math.abs(word.length - query.length) <= tolerance && editDistance(query, word) <= tolerance)) {
      return 36;
    }
  }
  return -1;
};

/** Scores code, descriptions and supplier so partial terms and small typos still match. */
export function scorePartSearch(material: string, part: Part, searchTerm: string): number {
  const queries = normalize(searchTerm).split(' ').filter(Boolean);
  if (!queries.length) return 0;

  const fields = [material, part.SPRAS_EN || '', part.SPRAS_ZH || '', part.Supplier_Name || ''].map(normalize);
  let total = 0;
  for (const query of queries) {
    const best = Math.max(...fields.map((field, index) => tokenScore(query, field) + (index === 0 ? 12 : 0)));
    if (best < 0) return -1;
    total += best;
  }
  return total;
}

export function searchPartsLocally(parts: Record<string, Part>, searchTerm: string): PartSearchResult[] {
  return Object.entries(parts)
    .map(([material, part]) => ({ material, part, score: scorePartSearch(material, part, searchTerm) }))
    .filter(result => result.part.show_in_catalogue !== false && result.score >= 0)
    .sort((left, right) => right.score - left.score || left.material.localeCompare(right.material));
}
