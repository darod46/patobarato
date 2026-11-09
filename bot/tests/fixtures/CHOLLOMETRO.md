# Chollometro: verified key map

Captured 2026-11-09 with a browser User-Agent (plain GET, no cookies). All fixtures are the bytes as served (UTF-8), not trimmed: every file is under 300 KB, so no trimming was needed.

| Fixture | Source | Notes |
|---|---|---|
| `chollometro_nuevos.html` | `GET /nuevos` | 30 threads (ids 2060930..2060898), 276 `data-vue3` attributes. All `status: Activated`, none expired, no sponsored entries. One `Voucher`, one `merchant: null`. |
| `chollometro_nuevos_old.html` | `GET /nuevos?page=300` | 30 older threads; contains an expired one (`2049042`, `isExpired: true`) and has the extra `ThreadListingPagination` component. |
| `chollometro_thread_active.html` | `GET /ofertas/lego-botanicals-margaritas-2060928` | Active Amazon deal. |
| `chollometro_thread_expired.html` | `GET /ofertas/30-articulos-seleccionados-puma-2049042` | Expired deal (Puma, with coupon). |
| sold-out ("agotado") | NOT FOUND | See "Sold out" below. |

## Two sources of data

### 1. Listing page: one `data-vue3` per component

Attributes are **single-quoted** (`data-vue3='...'`, not double-quoted), and the JSON is plain (non-HTML-escaped) with `\uXXXX` escapes, so `re.findall(r"data-vue3='([^']*)'", html)` then `json.loads` works. Components found: `ThreadMainListItemNormalizer` (30), `ThreadListItemImage`, `VoteControlThreadListing`, `ThreadListItemTimestamp`, `ThreadListItemInfo`, `CommentsButtonThreadListing`, `ThreadListingShareButton`, `ThreadListingBookmark`, `ThreadListItemMainButton` (all 30 each), plus `ThreadEventRefresh`, `ThreadEventCounter`, `LocationFilter`, `ThreadListingPaginationWithButtons`, `PaginationPopover`.

Only two matter:

- `ThreadMainListItemNormalizer`: `{"name":"ThreadMainListItemNormalizer","props":{"thread":{...}}}` (confirmed shape).
- `ThreadListItemMainButton`: `{"name":"ThreadListItemMainButton","props":{"threadId":"2060930","withoutCode":false,"link":"https://www.chollometro.com/visit/homenew/2060930","itmParams":null,"concealThreadLinks":false}}`

The other components carry only `threadId` (or nothing).

### 2. Thread page: one big JS state, NOT data-vue3

The thread page has a single `data-vue3` (`PaginationPopover`, useless). The data is in an inline script:
`window.__INITIAL_STATE__ = {...};` (JSON; slice with `json.JSONDecoder().raw_decode(html[i:])` after the `= `). The thread is at **`threadDetail`** (key sets: `eventPromotions, widgets, themedEvent, threadDetail, ... comments, priceComparison, currentUser ...`). JSON there uses `\/` and `\uXXXX` escapes. The page body is a skeleton (price, title etc. are rendered client-side), only `<h1 class="thread-title">` and the state have the data.

## Field map (verbatim paths)

Listing paths are relative to `props.thread` of `ThreadMainListItemNormalizer`. Thread-page paths are relative to `window.__INITIAL_STATE__.threadDetail`.

| Field | Listing path | Example | Thread page path | Notes |
|---|---|---|---|---|
| id | `props.thread.threadId` | `"2060928"` (string) | `threadDetail.threadId` | String in both. |
| title | `props.thread.title` | `"LEGO Botanicals Margaritas"` | `threadDetail.title` | |
| slug | `props.thread.titleSlug` | `"lego-botanicals-margaritas"` | `threadDetail.titleSlug` | |
| price | `props.thread.price` | `10.49` | `threadDetail.price` | Number. `0` means "no price" (vouchers, "precio al tramitar"), never a real price. |
| old price | `props.thread.nextBestPrice` | `14.99` | `threadDetail.nextBestPrice` | `0` when absent (e.g. `2060921`: price 2.29, nextBestPrice 0). Thread page also has `threadDetail.standardPrice` (0 here) and `priceDiscount` (null); not in the listing. |
| discount % | `props.thread.percentage` | `10` on the voucher `2060912` (with `discountType: "Percentage"`) | `threadDetail.percentage` | For normal deals it is `0` even when price and nextBestPrice are both set: compute the discount from `price`/`nextBestPrice`. `percentage` is only meaningful for vouchers. |
| temperature | `props.thread.temperature` | `20.82` (float; can be negative, e.g. `-4.05`; can be `0`) | `threadDetail.temperature` | `temperatureLevel` is `"", "Cold1", "Hot1", "Hot2", "Hot3"` (listing and thread). |
| expired | `props.thread.isExpired` | `false` / `true` (`2049042` in the old listing) | `threadDetail.isExpired` | **`status` stays `"Activated"` even when `isExpired` is true** (only value ever seen), so use `isExpired`. |
| sold out | none | | none | See below. |
| merchant | `props.thread.merchant.merchantName` | `"Amazon"` | `threadDetail.merchant.merchantName` | `props.thread.merchant` can be **`null`** (`2060924`, a local deal), then `linkHost` is also `null`. `merchant.merchantUrlName` e.g. `"amazon.es"`, `merchant.merchantId` e.g. `173`. |
| merchant host | `props.thread.linkHost` | `"www.amazon.es"` | `threadDetail.linkHost` | Real store host; best signal for Amazon (`www.amazon.es`) vs. others (`www.mediamarkt.es`, `es.aliexpress.com`...). |
| /visit/ link | **not in the thread JSON**; in sibling component `ThreadListItemMainButton` `props.link` (same `threadId`) | `"https://www.chollometro.com/visit/homenew/2060928"` | `threadDetail.linkCloakedItemMainButton` | Thread page value: `"https://www.chollometro.com/visit/threadmain/2060928"`. Also `linkCloakedItemFollowButton` (`/visit/threadfollow/<id>`), `linkCloakedItemImageButton` (`/visit/threadimg/<id>`), `linkCloakedItemBelowDescButton` (`/visit/threadbeldesc/<id>`). `threadDetail.link` and `cpcLink` are `null`. Both `/visit/homenew/<id>` and `/visit/threadmain/<id>` work with just the id (verified). |
| coupon | `props.thread.voucherCode` | `"DOUGLAS30"`, `"WEEK10"`, `"EXTRA30"`, `""` when none | `threadDetail.voucherCode` | **Free text, not always a code**: seen `"Aplicar cupón de 15,08 €"`, `"Precio al tramitar pedido"`, `"aplicar cupón"`. Also `props.thread.isVoucherCodeHidden` (`true` for `2060912`: code is hidden in the listing but still present in the JSON). |
| category | `props.thread.mainGroup.threadGroupName` / `.threadGroupUrlName` | `"Juguetes, familia e hijos"` / `"familia-e-hijos"` | `threadDetail.groups[]` (each `threadGroupId`, `threadGroupName`, `threadGroupUrlName`, `isDefault`) and `threadDetail.groupsPath` | Listing only gives the main group. Thread page gives all (e.g. LEGO, Juguetes, Decoración...). |
| published | `props.thread.publishedAt` | `1794238207` (Unix seconds, UTC) | `threadDetail.publishedAt` | Also `updatedAt`, `startDate.timestamp` / `endDate.timestamp` (`null`/`0` when unset; `startDate` itself can be `null`). Thread page also has `createdAt`. |
| thread URL | **not in JSON** | build: `https://www.chollometro.com/ofertas/{titleSlug}-{threadId}` -> `https://www.chollometro.com/ofertas/lego-botanicals-margaritas-2060928` | `threadDetail.url` and `threadDetail.canonicalUrl` | Listing HTML also has `<a href="https://www.chollometro.com/ofertas/lego-botanicals-margaritas-2060928">`. For `type: "Voucher"` the thread-page `threadTypeTranslation` is the path segment (`"ofertas"` for deals); a voucher URL was not fetched, so its segment is unverified. `shareableLink` is `https://www.chollometro.com/share-deal/<id>`. |
| type | `props.thread.type` | `"Deal"` or `"Voucher"` | `threadDetail.type` | `Voucher` has `price: 0`, `percentage`, `discountType: "Percentage"`. |
| image | `props.thread.mainImage.path` + `.name` + `.ext` | `threads/raw/4Fmyb`, `2060928_1`, `jpg` | `threadDetail.mainImage.{path,name}`, `galleryImages[]` | Image URL pattern seen on the page: `https://static.chollometro.com/threads/raw/4Fmyb/2060928_1/re/768x768/qt/60/2060928_1.jpg`. |
| comments | `props.thread.commentCount` | `0` | `threadDetail.commentCount` | |
| description | none | | `threadDetail.description` (BBCode/text, `""` here), `threadDetail.descriptionPurified`, `threadDetail.threadDetails.preparedHtmlDescription` | Only on the thread page. |
| shipping | `props.thread.shipping.price` / `.isFree` | `{"isFree": 0, "price": 3.95}` | `threadDetail.shipping` | `isFree` is `null`/`0`/`false`. |

### Present in only one of the two

- Listing only: `isNew`, `isLocal`, `isHot`, `isSuperHot`, `hotDate`, `user`, `selectedLocations`, `unread`, `keywordNames`, `bookmarked`. Also `mainGroup` and `merchant.merchantStatus` (listing form only).
- Thread page only: full description, all `groups[]`, `galleryImages`, `threadExpiryBanners` (object when expired, `null` when active), `expiryReportStatus` (`"None"` in both fixtures), `isMaybeExpired` (`false`), `stale`, `expirable`, `standardPrice`, `priceDiscount`, `canonicalUrl`, `url`, `createdAt`, `metadata`, `disclaimers`, the four `linkCloaked*` links, `merchant.referralCampaigns`.
- Same name, different shape: listing `merchant.merchantId` is an int (`173`), thread-page is a string (`"173"`); listing `mainImage` has `width`/`height`/`ext`, thread page only `path`/`name`; listing `startDate`/`endDate` may be `null`, thread page uses `{"timestamp": 0}`; listing `shipping.price` is `0`, thread page `null`; `linkHost` differs by value in one expired example (listing `eu.puma.com`, `merchantUrlName` `es-eu.puma.com`).

## Sold out ("agotado")

No sold-out thread was found and **no sold-out field exists in either JSON**; grep for `agotad|soldout|sold_out|outOfStock` over the four pages gives zero hits. Platform signals for a dead deal are `isExpired` (listing and thread), plus on the thread page `expiryReportStatus` (`"None"` seen), `isMaybeExpired` (`false`) and `stale`. There is no fixture `chollometro_thread_soldout.html`. If "agotado" exists it is probably a user report that flips `expiryReportStatus` / `isMaybeExpired`, but that is unverified.

## Expired example (listing, `chollometro_nuevos_old.html`, thread `2049042`)

`"status":"Activated","isExpired":true,"temperature":68.69,"voucherCode":"EXTRA30","price":50,"nextBestPrice":80,"startDate":{"timestamp":1793228460},"endDate":{"timestamp":1793660341}` and on the thread page `threadDetail.isExpired: true` plus `threadDetail.threadExpiryBanners` = `{"group": {...}, "comments": {...}, "highlights": {...}, "alert": {...}}` (null when active). The listing itself keeps showing expired threads, so the parser must check `isExpired`.

## Sponsored entries

None in the 60 listing threads captured (all `type` are `Deal`/`Voucher`; `isExcludedFromAds` is always `false` here; `isPinned` always `false`). Nothing to skip was observed, so a sponsored-skip rule could not be validated. Thread page `threadDetail.adEligibilityStatus` is `null`.

## `/visit/` redirect shape (requests without following redirects)

Chain is two hops via an intermediary (`path.chollometro.com`) that tracks the click; **the first Location already embeds the clean target store URL, url-encoded, in the `url` query parameter** (no affiliate tag there):

1. Amazon, `GET https://www.chollometro.com/visit/threadmain/2060928`:
   `302` -> `https://path.chollometro.com/pepper-es/redirect?url=https%3A%2F%2Fwww.amazon.es%2FLEGO-Botanicals-Margaritas-Artificial-Decoraci%25C3%25B3n%2Fdp%2FB0FPXDY3X2%2Fref%3Dsr_1_23%3Fth%3D1&product=ppr-es-1039033016&tag=ugc&referer=https%3A%2F%2Fwww.chollometro.com`
   Second hop (GET to that URL): `302` -> `https://www.amazon.es/LEGO-Botanicals-Margaritas-Artificial-Decoraci%C3%B3n/dp/B0FPXDY3X2/ref=sr_1_23?th=1&tag=pepperugc-21&ascsubtag=ppr-es-1039033016` (Chollometro's own Amazon affiliate tag `tag=pepperugc-21` gets added here, so to avoid their tag, decode `url=` from hop 1 instead of following hop 2). Note `url=` is double-encoded for the path (`%25C3%25B3`): after one `parse_qs` decode it is `https://www.amazon.es/LEGO-Botanicals-Margaritas-Artificial-Decoraci%C3%B3n/dp/B0FPXDY3X2/ref=sr_1_23?th=1`, which is a normal valid URL (ASIN `B0FPXDY3X2` extractable via `/dp/<ASIN>`).
2. AliExpress, `GET https://www.chollometro.com/visit/homenew/2060916`:
   `302` -> `https://path.chollometro.com/pepper-es/redirect?url=https%3A%2F%2Fes.aliexpress.com%2Fitem%2F1005010118923749.html&product=ppr-es-1039033031&referer=https%3A%2F%2Fwww.chollometro.com` (no `tag=` param). Second hop not followed.
3. MediaMarkt, `GET https://www.chollometro.com/visit/threadmain/2060929`:
   `302` -> `https://path.chollometro.com/pepper-es/redirect?url=https%3A%2F%2Fwww.mediamarkt.es%2Fes%2Fproduct%2F_tv-qd-mini-led-65-tcl-65c8l-uhd-4k-mt9655-smart-tv-dvb-t2-negro-1626021.html&product=ppr-es-1039033058&referer=https%3A%2F%2Fwww.chollometro.com`

Conclusion: `/visit/...` is a direct 302 (no HTML interstitial) to `path.chollometro.com/pepper-es/redirect?url=<store url>&product=...`. Only 1 request per deal is needed to get the store URL; the store URL in `url=` is not an affiliate link.
Server notes: `/nuevos`, thread pages and `/visit/` all returned 200/302 with a browser UA and no cookies, at 2 s spacing (about 11 requests in total).
