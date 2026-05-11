/**
 * Транслитерация и нормализация строки в slug.
 *
 * Используется в `SlugInput` — когда у поля типа `slug` объявлен `source: 'title'`,
 * studio автоматически генерирует slug из значения source-поля.
 *
 * Поддержка кириллицы — обязательна: основная аудитория CMS пишет на русском.
 * Алгоритм такой же, как у server-валидатора (см. `defineField('slug')`).
 */

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function slugify(input: string): string {
  if (!input) return '';
  let result = '';
  for (const char of input.toLowerCase()) {
    if (CYRILLIC_MAP[char] !== undefined) {
      result += CYRILLIC_MAP[char];
    } else {
      result += char;
    }
  }
  return result
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}
