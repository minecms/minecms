import { describe, expect, it } from 'vitest';
import { databaseNameFromUrl, isSafeStatement, slugUniqueName } from './migrate';

describe('databaseNameFromUrl', () => {
  it('извлекает имя БД из mysql URL', () => {
    expect(databaseNameFromUrl('mysql', 'mysql://user:pw@localhost:3306/minecms')).toBe('minecms');
  });

  it('извлекает имя БД из postgres URL с query-string', () => {
    expect(databaseNameFromUrl('postgres', 'postgres://user:pw@localhost:5432/cms?ssl=true')).toBe(
      'cms',
    );
  });

  it('бросает на URL без имени БД', () => {
    expect(() => databaseNameFromUrl('mysql', 'mysql://user:pw@localhost:3306/')).toThrow(
      /не указано имя/,
    );
  });
});

describe('isSafeStatement', () => {
  it.each([
    ['CREATE TABLE "pages" ("id" bigserial PRIMARY KEY)'],
    ['CREATE INDEX idx ON "pages" ("title")'],
    ['CREATE UNIQUE INDEX uniq ON "pages" ("slug")'],
    ['ALTER TABLE "navigation" ADD COLUMN "items" jsonb'],
    ['ALTER TABLE `navigation` ADD COLUMN `items` json'],
    ['ALTER TABLE "x" ADD COLUMN "y" int NOT NULL DEFAULT 0'],
  ])('считает безопасным: %s', (stmt) => {
    expect(isSafeStatement(stmt)).toBe(true);
  });

  it.each([
    ['DROP TABLE "pages"'],
    ['ALTER TABLE "pages" RENAME CONSTRAINT page_slug_unique TO pages_slug_unique'],
    ['ALTER TABLE "pages" DROP COLUMN "old"'],
    ['ALTER TABLE "pages" DROP CONSTRAINT pages_pk'],
    ['ALTER TABLE "pages" RENAME COLUMN "a" TO "b"'],
    ['ALTER TABLE "pages" ALTER COLUMN "title" TYPE text'],
    ['ALTER TABLE "pages" ALTER COLUMN "title" SET NOT NULL'],
    ['ALTER TABLE "pages" ADD CONSTRAINT pages_slug_unique UNIQUE ("slug")'],
    ['ALTER TABLE "pages" ADD CONSTRAINT pages_pk PRIMARY KEY ("id")'],
    ['ALTER TABLE "x" ADD COLUMN "y" int NOT NULL'],
  ])('считает опасным: %s', (stmt) => {
    expect(isSafeStatement(stmt)).toBe(false);
  });
});

describe('slugUniqueName', () => {
  it('строит имя по конвенции drizzle-kit `<table>_<column>_unique`', () => {
    expect(slugUniqueName('pages', 'slug')).toBe('pages_slug_unique');
    expect(slugUniqueName('articles', 'slug')).toBe('articles_slug_unique');
  });
});
