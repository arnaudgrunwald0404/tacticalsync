# To-Do

## One-on-One Drawer Redesign

The "one-on-one drawer" is the **1:1 Prep Sheet** in the Chief of Staff / co-work
workspace (`src/pages/ChiefOfStaff.tsx`, around the `1:1 Prep Sheet` Sheet at the
`<Sheet open={!!prepSheet}>` block). It currently opens as a right-side Sheet
(`<SheetContent side="right" className="w-full sm:max-w-xl ...">`) and renders the
prep content (from `cos_one_on_one_prep` / the prep markdown) as raw `prose-sm` text.

### 1. Make the drawer full screen
- Change the 1:1 prep drawer from a right-side `max-w-xl` Sheet to a **full-screen**
  experience so we have room for all the information we want to show.

### 2. Turn the prep markdown into a presentation
- There's a lot of information to show. Transform the one-on-one markdown
  (`cos_one_on_one_prep.content` / the prep `.md` file) from raw text into a clean,
  structured **presentation/layout** rather than a wall of prose.

### 3. Quarterly & monthly reference panel (side)
- Add a side panel showing **Quarterly Priorities** and **Monthly Commitments** as
  reference (the carousel already pulls from `quarterly_priorities` and
  `monthly_commitments`). (Confirm which is quarterly vs monthly — "quarterly
  commitments and monthly priorities, or vice versa.")
- If they have **not been set up**, show instructions in **red: "Set up now"** as a
  helpful, actionable hint on the side.

### 4. Incorporate the markdown content as "Topics of the day"
- Pull the content of the prep `.md` file into the drawer as the **Topics of the day**.

### 5. Carry uncompleted actions forward between prep files
- Capture actions from **last time** (and possibly the time before).
- All **uncompleted / incomplete actions** from prior prep file(s) should be
  **transferred into the most recent (empty) prep file**.
- Likely we change the single most-recent prep file so that incomplete actions from a
  prior period roll forward into it automatically.
- This happens in **co-work** (the Chief of Staff workspace).

### 6. Separate "actions for them" from "to-dos for me", and transfer mine on close
- Distinguish between:
  - **Actions for the employee** / the people in the meeting, and
  - **To-dos for me** (things *I* have to do).
- When the drawer is **closed**, transfer the **to-dos for me** out of the drawer and
  **into my personal to-do list**. If I have to do something, it needs to land in my list.

### 7. Central aggregation of my to-dos across all one-on-ones (critical)
- Build a connection between the individual one-on-ones (which tend to hide my to-dos
  inside each person's prep) and a **single place** where I can see **all my to-dos
  across all my one-on-ones**.
- This is **critical**.

### Open questions / to confirm
- Quarterly vs monthly: which tier is "commitments" and which is "priorities"?
- Where does "my personal to-do list" live today (which table / view), so closing a
  drawer can push my to-dos into it and the central aggregation can read from it?
