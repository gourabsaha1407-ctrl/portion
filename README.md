# Portion

Photograph a meal, get its calories, protein, carbs, fat, fibre and glycemic
load, and a daily coach that tells you — in katoris and rotis, not grams —
which portions to raise and which to cut.

Built for the Mosaic Wellness builder round.

## What it does

- **Reads a meal from a photo.** Claude names the dishes in the vocabulary of
  your kitchen (dal tadka, shukto, undhiyu, appam), sizes the portion against
  the crockery in frame, and returns per-dish macros, fibre and glycemic index.
  You can correct the portion before it is logged.
- **Computes everything else itself.** Claude identifies; the page does all the
  arithmetic. That keeps the numbers auditable and keeps the app useful when
  the model is unavailable.
- **BMI on Indian cutoffs.** Overweight at 23, obesity at 25 — not the WHO's
  25/30. Indian bodies carry more metabolic risk at the same BMI.
- **A coach that is specific.** It finds the gap between what you ate and what
  you need, then searches a library of household portions for the one or two
  that close it: *"take the jeera rice from 2 katoris to 1; add 200 g of chicken."*
- **Diabetic mode.** True glycemic load (GI x carbohydrate after fibre), flagged
  per dish and per day, with named swaps. It also tightens your carb target.
- **A supplement planner.** Scan a tub's label or enter it by hand; get a
  body-weight-scaled protein and creatine plan for the day you are actually
  training, and see what the shake did to the rest of your plate.

## Deploying

The app runs with or without an API key. Without one, everything works except
reading photos — the camera features switch themselves off and say why.

### Step 1 — get Node (you do not have it yet)

```bash
brew install node
```

### Step 2 — deploy

```bash
cd ~/portion
npx vercel
```

Answer the prompts (link to your account, accept the defaults). It will print a
live URL. To promote it to the production domain:

```bash
npx vercel --prod
```

### Step 3 — add the key, if you have one

In the Vercel dashboard: **Project -> Settings -> Environment Variables**, add

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com |
| `CLAUDE_MODEL` | *(optional)* `claude-sonnet-5` to cut cost per call |

Redeploy (`npx vercel --prod`) so the function picks it up. The page detects the
key on load — no code change needed.

### No-Node alternative

Push this folder to a GitHub repo, then import it at **vercel.com/new**. Vercel
builds it in the cloud; you never need Node locally.

```bash
cd ~/portion
git init && git add -A && git commit -m "Portion"
# create an empty repo on github.com, then:
git remote add origin git@github.com:<you>/portion.git
git push -u origin main
```

## How it is put together

```
public/index.html   The entire app — no build step, no framework, no bundler.
api/analyze.js      The only server code. Holds the key, forwards one prompt
                    and one image to Claude, returns the raw text.
```

The page picks its backend at load:

1. **Claude Artifact** — uses the viewer's own Claude via the `sample` capability.
2. **This deployment** — posts to `/api/analyze`, which holds the key.
3. **Neither** — every feature that does not need a model still works: add by
   hand from the katori list, BMI, targets, the coach, glycemic flags, the week
   view and the supplement planner.

Photos are downscaled to 1400 px in the browser before they are sent, which
costs less and tells the model nothing less.

## Cost

Roughly 1500-2500 input tokens and ~500 output per photo. On `claude-opus-5`
that is on the order of a couple of US cents per meal read; `claude-sonnet-5` is
cheaper again. Set a spend cap on the key in the Anthropic console — the
endpoint is public by design, and the in-memory rate limit in `api/analyze.js`
is a speed bump, not a guarantee.

## Not a medical device

Estimates from a photo are approximations: oil, sugar and portion size are
partly invisible to a camera. The glycemic flags are food-science guidance, not
a blood-sugar reading. Supplement amounts are general sports-nutrition guidance
for healthy adults. A doctor or dietitian overrules all of it.
