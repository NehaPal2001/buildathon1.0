import { test, expect } from '../fixtures';

test.describe('Search', () => {
  test.beforeEach(async ({ search }) => {
    await search.goto();
  });

  test('finds products by part of the name', async ({ search }) => {
    await search.search('lamp');
    await expect(search.result('p3')).toBeVisible();
    await expect(search.results).toHaveCount(1);
  });

  test('finds products by category', async ({ search }) => {
    await search.search('kitchen');
    await expect(search.results).toHaveCount(2);
  });

  test('is case-insensitive', async ({ search }) => {
    await search.search('MOUSE');
    await expect(search.result('p5')).toBeVisible();
  });

  test('shows a message when nothing matches', async ({ search }) => {
    await search.search('unicorn');
    await expect(search.noResults).toBeVisible();
    await expect(search.results).toHaveCount(0);
  });

  test('keeps the query in the box after searching', async ({ search }) => {
    await search.search('tote');
    await expect(search.input).toHaveValue('tote');
  });

  test('an empty query shows no results and no message', async ({ search }) => {
    await search.search('');
    await expect(search.results).toHaveCount(0);
    await expect(search.noResults).toHaveCount(0);
  });
});
