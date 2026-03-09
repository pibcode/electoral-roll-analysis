# Electoral Integrity Monitor v1.0

A local web app to analyze electoral roll Excel files.

Full documentation:
- [User Guide](./USER_GUIDE.md)

It helps you:
- load one or many voter roll `.xlsx` files
- detect duplicates (row-level and same-content files)
- review uncertain classifications
- run statistical comparisons
- export reports, charts, and data
- include `AC No`, `AC Name`, and `Part Number` in publication-ready reports

---

## 1. What You Need (Super Simple)

You need 2 things on your computer:

1. **Node.js** (version 18 or newer)
2. **npm** (comes with Node.js)

Check if you already have them:

```bash
node -v
npm -v
```

If both commands show version numbers, you are ready.

---

## 2. Run Locally (Like a 10-Year-Old Tutorial)

### Step A: Open the project folder

Open terminal in this folder:

`elctoral_roll_analysis`

### Step B: Install packages (only first time)

```bash
npm install
```

### Step C: Start the app

```bash
npm run dev
```

### Step D: Open browser

Terminal will show a link like:

`http://localhost:5173`

Open that link.

That is it. App is running.

---

## 3. Build for Production

```bash
npm run build
```

This creates a `dist/` folder (optimized app).

To preview production build locally:

```bash
npm run preview
```

---

## 4. Deploy to Vercel (Easy Mode)

## Option A: Website method (recommended for beginners)

1. Push your code to GitHub.
2. Go to https://vercel.com
3. Sign in with GitHub.
4. Click **Add New Project**.
5. Choose this repo.
6. Keep defaults:
   - Framework: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
7. Click **Deploy**.

Done. Vercel gives you a live URL.

## Option B: CLI method

```bash
npm i -g vercel
vercel login
vercel
```

Follow terminal questions.

---

## 5. Excel File Format (Minimum Required Columns)

Sheet name must be:

`Voter Roll`

Required columns:

- `name`
- `relation_name`
- `voter_id`
- `serial_no`
- `part_no`
- `age`
- `gender`
- `stamp_type`

Optional columns:

- `ac_no`
- `ac_name`
- `house_no`
- `page_no`
- `relation_type`

Important:
- For proper constituency-level reporting, include:
  - `ac_no`
  - `ac_name`
  - `part_no`
- Report exports now show these identifiers in:
  - Overview sheet
  - Part summary sheet
  - Duplicate rows sheet
  - All voters sheet
  - Printable report header

---

## 6. What the One-Click Report Exports

When you use report export, the Excel workbook contains:

- `Overview`
- `Part_Summary`
- `Anomalies`
- `Duplicates`
- `File_Duplicates`
- `All_Voters`

Charts are also exported as images, and a printable summary opens in a new tab.

---

## 7. Common Problems and Fixes

## Problem: App not opening

Try:

```bash
npm install
npm run dev
```

## Problem: Port already used

Run:

```bash
npm run dev -- --port 5174
```

Then open `http://localhost:5174`.

## Problem: Build fails

Check Node version:

```bash
node -v
```

Use Node 18+.

---

## 8. Notes

- This app runs fully in browser by default.
- Your files are processed locally unless you connect external services.
- Use exported reports responsibly and verify conclusions with domain experts.

---

## 9. ECI PDF to Excel Workflow (Claude AI)

This project also uses a volunteer workflow to convert **ECI image-based electoral-roll PDFs** into structured Excel files (`.xlsx`) before analysis.

Process used:
1. Download English voter-roll PDF from ECI.
2. Upload PDF to Claude (app or web).
3. Paste the extraction prompt below.
4. Download generated Excel.
5. Import into this app for analysis.

If you are viewing this on GitHub, each code block has a copy button at top-right.

### 9.1 Copy: Volunteer Request Message (Bangla)

```text
SIR এর বিষয়ে কিছু হেল্প করতে পারেন বিনামূল্যে মাত্র 5 মিনিট ব্যয় করে।

প্রথমে Claude অ্যাপ ইন্সটল করুন

https://play.google.com/store/apps/details?id=com.anthropic.claude

বা https://claude.ai সাইটটি ভিজিট করে একাউন্ট বানান। Login with Google অপশন ব্যবহার করতে পারেন।

এরপর আপনার বিধানসভার অন্তত একটি বুথের ফাইনাল লিস্ট ডাউনলোড করুন এই লিংক থেকে। অবশ্যই ENGLISH অপশন বেছে নেবেন।

https://voters.eci.gov.in/download-eroll?stateCode=S25

এরপর নিচে দেওয়া লেখাটি কপি করে Claude এর chatbox এ পেস্ট করুন। + বাটন টিপে Files option টিপে ভোটার লিস্টটি সিলেক্ট করুন। এরপর কমলা ⬆️ বাটনটি টিপে দিলেই কাজ শুরু। এই অবস্থায় অ্যাপ মিনিমাইজ করে অন্য কাজ করতে পারেন। কিছুক্ষন পর এক্সেল ফাইলটি তৈরি হয়ে গেলে ডাউনলোড বাটন টিপে দিলেই কাজ শেষ।

এক্সেল ফাইলটি আমাদের পাঠিয়ে দিন।
```

### 9.2 Copy: Claude Prompt (PDF → XLSX)

```text
I have a West Bengal Electoral Roll image based PDF. First two pages contain booth details. Last page is summary. From page 3 the voter details are in the form of cards (maximum three columns and ten rows). Extract all voter entries (stamped and unstamped) into an XLSX using your vision.

STEP 1 — Read the cover page
Extract once and apply to every row:
* `ac_no` — number before the hyphen in the AC name field (e.g. "287 - NANOOR (SC)" → 287)
* `ac_name` — name after the hyphen, without reservation brackets (e.g. → NANOOR)
* `part_no` — value next to "Part No." top-right of the header table

STEP 2 — Skip non-voter pages
Process only pages with voter boxes. Skip: cover, maps, photos, blank, List of Additions, List of Deletions, Summary of Electors.

STEP 3 — Extract every voter box
Field Source `ac_no`, `ac_name`, `part_no` Cover page — same for all rows `serial_no` Top-left of box `voter_id` Top-right of box (formats: AEM1234567 / LVD1234567 / WB/41/284/051234 / IIX1234567 etc.) `name` "Name :" label `relation_type` Father / Husband / Mother / Guardian / Other `relation_name` Name following relation label `house_no` "House Number :" label `age` "Age :" label `gender` Male / Female / Other `page_no` Printed footer bottom-right e.g. "Total Pages 47 - Page 11" → 11 `stamp_type` See Step 4

STEP 4 — Stamp detection
Inspect every box for a diagonal stamp:
* `UNDER ADJUDICATION` — stamp text reads "ADJUDICATION"
* `DELETED` — stamp text reads "DELETED" or serial number has a "Q" prefix
* blank — no stamp
Stamps are diagonal and may obscure text. Extract all other fields as fully as possible from readable portions.

STEP 5 — XLSX output
Sheet 1 — "Voter Roll"
* Columns in order: ac_no, ac_name, part_no, serial_no, voter_id, name, relation_type, relation_name, house_no, age, gender, page_no, stamp_type
* Widths: ac_no=8, ac_name=16, part_no=8, serial_no=10, voter_id=22, name=28, relation_type=14, relation_name=30, house_no=12, age=6, gender=8, page_no=9, stamp_type=22
* Header: dark blue (#1F3864), white bold Arial 10pt, height 22
* Rows: alternating white / light blue (#D6E4F0), Arial 10pt
* stamp_type cell: red fill (#FF0000) + white bold text if UNDER ADJUDICATION or DELETED
* All cells: thin black border, freeze top row Sheet 2 — "Summary"
* Source filename, AC No, AC Name, Part No
* Formula-based counts: total entries, UNDER ADJUDICATION, DELETED, unstamped
* Same formatting as Sheet 1 STEP 6 — Verify before saving
* No unexpected gaps in serial_no sequence
* No blank voter_id values
* ac_no / ac_name / part_no identical in every row
* stamp_type contains only "UNDER ADJUDICATION", "DELETED", or blank
* Total rows match "Net Electors → Total" on the cover page — flag any discrepancy Notes:
* Never hardcode AC name, number or part — always read from the cover page
* Never skip a voter box
* Leave fields blank if genuinely unreadable — do not guess
* Always use the printed footer page number, never the PDF page index
Don't overthink. The filename should be VoterRoll_{AC No}_{AC Name}_Part{part_no}.xlsx
```

### 9.3 Contribute Extracted Files

Please send extracted Excel files to:
- `wbsir2025@gmail.com`
- `wbsir2026@gmail.com`
