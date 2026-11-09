# Shared fixtures

`post-format-cases.json` holds golden cases for the Telegram post caption. It is read by the bot's Python
formatter test (`bot/tests/test_format.py`) and by the admin's TypeScript port (`admin/src/lib/telegram-format.test.ts`).
The file stays a plain array so both loaders read it as is. Generate `expected` by running the Python formatter, never by hand.

## Trim rule (1024 characters)

- The limit counts Unicode code points (Python `len()`), not UTF-16 units: use `[...str].length` in TypeScript.
- The whole caption is measured, including the `❌ OFERTA TERMINADA` header line of ended posts.
- Only the (unescaped) title is trimmed: the longest prefix such that the caption with `prefix.rstrip() + "…"` fits.
- Title and coupon have every link-like token removed (`strip_urls`) before measuring; a coupon that was only a link is dropped.
- Prices round half up to cents; the discount percent rounds half up to an integer.
