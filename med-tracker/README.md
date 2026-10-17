# Med Tracker

A single, self-contained `index.html` for tracking which medications you take and making
sure you never miss a dose. No install, no server, no account. Your data lives in one
Excel file, `meds.xlsx`, in a folder you choose.

Dark mode only. English by default, with a one-click switch to Hebrew (full right-to-left
layout). The language choice is remembered in the browser.

## Running it

- Double-click `index.html` in **Chrome or Edge**. Firefox and Safari can't write local
  files, so the page tells you to switch browsers.
- First run: click **Choose data folder**. If the folder already has `meds.xlsx`, the app
  uses that file. Otherwise it creates a new one.
- Later runs reconnect to the same folder. At most you click **Reconnect** once.

## The three tabs

- **Today** is your daily checklist. A progress ring shows doses taken out of doses due.
  Each medication due today has a card with one dot per dose, a **Take dose** button
  (logs the current time) and **Skip** (with an optional reason). Below the cards are
  *As needed* medications and anything *not scheduled today*, each showing its next date.
  If you missed anything in the past 7 days, a red banner links straight to it.
- **Medications** lists everything you take, with its schedule, rules, course dates and
  30-day adherence. From here you can add, edit, archive, restore or delete.
- **History** shows adherence over 7, 30 or 90 days, for all medications or just one.
  You get stat cards, a calendar coloured by day (all taken / partly taken / missed /
  skipped), a per-medication breakdown, and an activity log with a **Missed only** filter.
  Click any day to see its doses, backfill one you forgot to log (time is optional),
  skip it, or remove an entry made by mistake.

## A medication

| Setting | What it does |
|---|---|
| Times per day | How many doses are expected on each scheduled day. |
| Schedule | **Daily**, **Every N days** (counted from the start date), **Specific days** (e.g. Sun/Tue/Thu), or **As needed**. As-needed doses are logged but never counted as missed. |
| With food | Shows a badge, and a reminder when you log the dose. |
| Not before sleep | Uses your **bedtime** (Settings, default 23:00) and an hours-before value (default 3). The card shows "Before 20:00", turns amber an hour before that time and red once it passes. Logging inside that window asks you to confirm first. |
| Start / end date | Doses are only expected inside the course. The 7/14/30-day chips set the end date for you. |

**Counting rules.** A dose is *missed* only once its day is over; until then it's "to go".
Adherence = taken ÷ (taken + missed), so deliberate skips don't count against you. If you
log more doses than scheduled, the card flags the extra dose.

**Archive vs delete.** Archiving stops a medication from today onward and keeps its full
history. Deleting removes the medication and all of its log entries.

Editing a medication's schedule also changes how its *past* days are counted. To change
a schedule from today only, archive the old one and add a new one.

## Your data: `meds.xlsx`

| Sheet | Columns |
|---|---|
| `Medications` | ID, Name, Times Per Day, Schedule, Every N Days, Weekdays, With Food, Not Before Sleep, Hours Before Bed, Start Date, End Date, Color, Archived On, Created At |
| `DoseLog` | ID, Medication ID, Medication, Date, Time, Status (Taken/Skipped), Reason, Logged At |
| `Settings` | Key, Value (currently just `Bedtime`) |

You can edit the file in Excel freely, even while the app is open:

- Columns are found by header name, so their order doesn't matter. **Columns you add
  yourself are preserved.**
- You can type in rows by hand. Leave `ID` empty and the app fills it in. A log row can
  name the medication instead of giving its ID. Dates can be `2026-10-08` or `8/10/2026`
  (day first).
- When you switch back to the app, it picks up your changes automatically.
- Close the file in Excel before logging a dose. Excel locks the file, and the app will
  tell you if it can't save.

### Data safety

- Every save re-reads `meds.xlsx` from disk, applies just that one change, and writes the
  result. Saves are serialized across tabs. Two open tabs, or a tab plus Excel, can't
  overwrite each other's changes.
- If a sheet or a required column is missing, or the file can't be read, the app
  **refuses to save** and says so. It never treats "missing" as "empty".
- Before every save, the previous version is copied to `meds.backup.xlsx`. A daily
  snapshot is also kept in `backups/` (last 14 days).
- After writing, the app reads the file back to check that it saved correctly.

## Development

No build step. To test in a browser, serve the folder over http:

```bash
cd med-tracker && python -m http.server 8790
```

SheetJS 0.18.5 is vendored inline (the same build as finance-tracker). The app script
starts at the `CONFIGURATION` banner after it. All writes go through `commit()`, which
holds the read-modify-write cycle. `Ops.*` are the only mutations, and each one receives
tables opened on the fresh on-disk copy, never on in-memory state.
