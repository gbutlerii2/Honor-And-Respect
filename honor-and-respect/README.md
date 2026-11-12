# Honor and Respect: deploy package

A mobile web app (installable on iPhone from Safari via Share → Add to Home Screen) for scanning headstones and QR plaques at Arlington National Cemetery and the Normandy American Cemetery. It's a plain static site with no build step, Firebase Auth + Firestore for data, and Netlify hosting.

```
honor-and-respect/
  public/                 ← the website (deploy this folder)
    index.html  app.css  styles.css
    print.html            ← printable test headstones + QR plaques
    _redirects  _headers  ← Netlify routing + security headers
    js/
      firebase-config.js  ← paste your Firebase keys here
      app.js  api.js  data.js  match.js  print.js
  firestore.rules         ← database permissions
  firebase.json  firestore.indexes.json
  netlify.toml            ← used for Git-based deploys
```

## Welcome page and cemetery selection
First-time visitors land on a welcome page (`#/welcome`) with an About section and a **Select Cemetery** dropdown: Normandy American Cemetery, Brittany American Cemetery (both in Normandy) and Arlington National Cemetery. The choice is remembered on the device. The scan page then shows the cemetery name above the scan window with a **change** link that pops the selector up again. Scan matches are limited to the selected cemetery, and the Register starts filtered to it. QR plaque links (`/m/<ID>`) skip the welcome page. **Admin → Listing** has a cemetery filter.

**Hero photo:** the welcome page shows a drawn illustration until you add a photo at `public/img/normandy-cemetery.jpg`. Then set the photographer credit in `HERO.credit` near the top of the welcome section in `js/app.js`. Use your own photo or one whose licence allows reuse, and note that the cemetery's architecture is protected by French copyright, so prefer images of the rows of graves rather than the memorial.

The list of cemeteries lives in `CEMETERIES` in `js/data.js`. After adding the cemetery filter, run `firebase deploy --only firestore` (or follow the "needs a database index" link) so the cemetery + status combination in Admin → Listing has its index.

## 0. Try it right away (demo mode)
Until you paste Firebase keys, the site runs in **demo mode**: 14 fictional sample records stored in the visitor's browser. Under **Account** you can switch roles (Contributor / Editor / Admin) to test permissions. You can deploy to Netlify in demo mode first.

## 1. Deploy to Netlify
**Drag and drop:** app.netlify.com → Add new site → Deploy manually → drag the **`public`** folder.
**Or from Git:** push this whole folder to a repo, then import it in Netlify. `netlify.toml` already sets `publish = "public"` and there is no build command.

Custom domain: Site settings → Domain management → add `honor-and-respect.com`. HTTPS is automatic. **The camera only works over HTTPS.**

## 2. Create the Firebase project
1. console.firebase.google.com → **Add project** (Google Analytics is optional).
2. **Build → Firestore Database → Create database** → Production mode → pick a region (e.g. `us-east1`, or `eur3` if most users will be in France).
3. **Build → Authentication → Get started** → enable **Email/Password**. Optionally enable **Google**.
4. **Authentication → Settings → Authorized domains** → add your Netlify address (`your-site.netlify.app`) and `honor-and-respect.com`.
5. **Project settings → General → Your apps → Web (</>)** → register the app → copy the `firebaseConfig` object into `public/js/firebase-config.js`.
   (These keys are designed to be public. Access is enforced by the security rules, not by hiding the keys.)
6. Redeploy the `public` folder.

## 3. Install the security rules
**Console:** Firestore → **Rules** → paste the contents of `firestore.rules` → **Publish**.
**Or CLI:** `npm i -g firebase-tools && firebase login && firebase use --add && firebase deploy --only firestore`

What the rules enforce:
- **Anyone** can read memorials, revisions and QR codes (the register is public).
- **Contributors** (every new account) can only create revisions with `status: "pending"`, which are suggestions.
- **Editors** can write memorials directly and approve or reject suggestions.
- **Admins** can also delete records, manage user roles and register QR codes.
- Nobody can raise their own role.

## 4. Create the owner admin account (one time — do this right after going live)
The owner username is **gbutlerii**. It becomes admin automatically. You can sign in with the username alone; the app turns it into `gbutlerii@honor-and-respect.com` behind the scenes.
1. Open the site → **Account** → **Create an account**.
2. Username: `gbutlerii`. Choose your password on this screen. It's stored only in Firebase Auth, never in these files.
3. You land signed in, with the **Admin** tab.

After that, sign in with `gbutlerii` and your password.

Create the account immediately after the first live deploy, because whoever registers that username first becomes the owner. The address isn't a real mailbox, so password-reset emails can't reach it. If you forget the password, reset it in Firebase console → Authentication → Users. To use a real email instead, change `OWNER_EMAIL` in `js/firebase-config.js` and `isOwner()` in `firestore.rules`.

In **demo mode**, signing in as `gbutlerii` with any password gives the admin role on that device.

From then on, assign roles in **Admin → Users**. Contributors can request editor access from their Account page; requests show in the Users table.

## 5. Load data
**Admin → Data & QR**
- **Load sample data** writes the 14 test records the print kit uses.
- **Import JSON** takes an array of memorial objects (see schema). Existing IDs are merged.
- **Export JSON** downloads a backup.

**Admin → Listing** shows the whole register: search, filter by status, edit, delete, add a new memorial, and select rows to **print QR plaques**. The **Open public register** button links to the public listing and its filters.

## 6. Test with the print kit
Open `/print.html` (also linked from Admin → Data & QR). It contains:
- an instruction page,
- 6 full-page **test headstones** (photograph them with Scan → Headstone),
- QR plaques for all 14 sample records (scan them with the iPhone Camera app or Scan → QR code).

QR codes encode `https://<site>/m/<ID>`. The address field at the top of the print page sets which site they open. Use your Netlify address until `honor-and-respect.com` is connected. Print at 100% scale.

## Data model (Firestore)
`memorials/{id}`: the ID appears in QR URLs, e.g. `NAC-D-14-22` (Normandy plot-row-grave) or `ANC-21-412` (Arlington section-site).

| Field | Type | Typical public source |
|---|---|---|
| fullName, givenName, middleName, surname | string | Headstone, ANC Explorer, ABMC |
| rank, rankAbbr, branch, unit | string | Headstone, ABMC, NARA AAD |
| serviceNumber | string | ABMC, NARA AAD |
| birthDate, birthYear, deathDate, deathYear | string, number | Headstone, ANC Explorer, ABMC |
| birthplace, enteredFrom, conflict | string | NARA AAD, ABMC |
| cemetery, cemeteryKey, location, section, row, site | string | ANC Explorer, ABMC |
| missing | boolean | ABMC: name is on the Tablets/Walls of the Missing, no grave |
| geo { lat, lng } | number | ANC Explorer; surveyed for Normandy |
| inscription[], awards[], sources[], mediaUrls[] | string[] | Headstone, ABMC, contributors |
| biography, photoUrl | string | Contributors |
| record { source, externalId, url, status } | object | linked / possible / none |
| status | string | verified · needs_review · unmatched |
| searchName, updatedAt, updatedBy | system | Set by the app |

`revisions/{auto}`: memorialId, summary, changes, authorUid, authorName, authorRole, status (pending · published · rejected), createdAt, reviewedBy, reviewedAt
`users/{uid}`: email, displayName, role, requestedRole, affiliation, requestReason
`qrCodes/{id}`: memorialId, url, createdBy, createdAt

## How recognition works
- **Headstone, live scan (default):** the camera reads the area inside the on-screen frame about once a second with Tesseract.js. Recognition happens on the phone and nothing is uploaded. Each read is scored against the register. When the same record ranks first in two reads in a row with a score of 55% or higher, the scan stops and shows the match, with other candidates listed below. It gives up after 30 seconds and suggests taking a photo.
- **Headstone, photo:** *Take photo* or *Library* runs the same recognition on a still image and shows ranked candidates. The user can correct the recognized text, and the matches update as they type.
- **QR:** live camera scanning with jsQR, or the iPhone Camera app opens `/m/<ID>` directly.

## Importing Arlington National Cemetery (~400,000 records)
Run this once from your own computer. It uses Arlington's official public API, and `scripts/import-anc.mjs` does the work.

**One-time setup**
1. Install **Node.js 18 or newer** from nodejs.org.
2. Upgrade Firebase to the **Blaze (pay-as-you-go)** plan: Firebase console → ⚙ → Usage and billing. The free plan allows 20,000 writes a day, so the import would take about 20 days. On Blaze, the full import costs well under $1 in database writes, and normal use stays mostly inside the free allowance. Set a budget alert while you're there.
3. Firebase console → ⚙ Project settings → **Service accounts** → **Generate new private key**. Save the file as `scripts/service-account.json`. **Keep this file private.** It has full database access. Never put it in `public/` or upload it to Netlify.
4. Deploy the search indexes: `npm i -g firebase-tools`, then `firebase login`, then run `firebase deploy --only firestore` from the `honor-and-respect` folder. Alternatively, when a filtered search shows "needs a database index", click the link it gives you.
5. Open https://www.arlingtoncemetery.mil/Developers/Burial-Record-Public-Service-Methods, click the copy icon next to **Example 1**, and paste that URL into `ANC_SEARCH_URL` at the top of `scripts/import-anc.mjs`.

**Run it** (in a terminal, inside `honor-and-respect/scripts`):
```
npm install
npm run probe        # checks the URL and prints one record — confirm names/dates look right
npm run download     # about 400 requests, 1.5 s apart: allow 15–30 minutes; re-run to resume
npm run convert      # builds data/memorials.ndjson
node import-anc.mjs upload --limit 500   # test a small batch, check it in the app
npm run upload       # the rest; re-run to resume if interrupted
```

**What each record gets:** name, rank, branch, dates of birth, death and interment, relationship (for family members), section/row/site or columbarium location, the ANC record ID, and the citation that Arlington's terms require. IDs look like `ANC-<record number>`, so QR plaques stay stable if the import is re-run. Re-running only refreshes the official fields; biographies, photos, sources and status that people added in the app are kept.

**Not included in Arlington's data:** unit, service number, awards and biography. These come from contributors or later record links. Conflict is filled in only when the year of death falls within a war's years.

## Importing ABMC overseas cemeteries (Normandy, Brittany, or all ~224,600 records)
`scripts/import-abmc.mjs` pulls records from ABMC's burial search at weremember.abmc.gov. ABMC has no bulk download, but its search page reads from a public JSON catalog service, and the script calls that same service slowly, one request at a time. ABMC's website content is public domain unless marked, and ABMC asks to be cited; every record gets that citation.

The service only answers inside a browser session, so the script opens the site in a hidden browser (Playwright) and makes its requests from there.

**Setup:** the same Node.js, Blaze plan, service account and index steps as the Arlington import above. Then, inside `honor-and-respect/scripts`:
```
npm install
npx playwright install chromium
```

**Run it.** Every step can be re-run and picks up where it stopped. `--cemetery` takes cemetery slugs from `public/js/cemeteries.js` and defaults to `normandy,brittany`; use `--cemetery all` for every ABMC cemetery and memorial.
```
node import-abmc.mjs probe                         # counts per cemetery + one full record
node import-abmc.mjs list                          # names, rank, unit, service no., state, war: 500 per request, a few minutes
node import-abmc.mjs details --limit 50            # try a few detail records first
node import-abmc.mjs details                       # plot / row / grave, date of death, awards: one request per soldier
node import-abmc.mjs convert                       # builds data/abmc/memorials.ndjson
node import-abmc.mjs upload --limit 500            # test a small batch, check it in the app
node import-abmc.mjs upload                        # the rest
```

**How long it takes:** `list` is quick (Normandy + Brittany is about 32 requests; every cemetery is about 450). `details` is one request per soldier, about 2 seconds apart: Normandy + Brittany (about 15,850 names) takes 8–9 hours, and every ABMC site (about 224,600) would take about 5 days, so run it cemetery by cemetery, overnight. You can `convert` and `upload` after `list` alone; those records get blank placeholder fields (`section`, `row`, `site`, `location`, `deathDate`, `awards`, `missing: null`, `detailsFetched: false`) and lack the grave location and date of death until `details` has run and you convert and upload again (delete `data/abmc/upload-state.json` first).

**What each record gets:** name, rank, branch, unit and division, service number, state entered service from, war, cemetery, plot/row/grave (or "Tablets of the Missing" with `missing: true`), date of death, awards, and the ABMC citation. IDs look like `ABMC-<ABMC record id>`, so re-running keeps QR plaques stable and keeps anything added in the app.

## Before scaling to the full register (~400,000 records)
Search now runs in the database rather than on the phone. The register searches by surname prefix with filters, scans look up only the surnames read from the stone, and the admin listing pages through 100 records at a time. That works for the full Arlington import. For typo-tolerant full-text search later (e.g. finding "Haskens" when someone types "Haskins"), add Algolia or Typesense, both available as Firebase extensions.

## Not yet included
- Photo uploads (fields accept image URLs). Next step: Firebase Storage plus storage rules.
- Native App Store build. This web app is the foundation; a native wrapper (Capacitor) can reuse it later.
- Account deletion screen (Apple requires one for App Store apps).
