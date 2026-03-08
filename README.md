# Electoral Integrity Monitor v1.0

A local web app to analyze electoral roll Excel files.

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
