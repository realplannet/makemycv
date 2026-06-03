# MakeMyCV — Deploy Guide
## Stack: Vercel (frontend + API) + Supabase (storage + DB)
## Everything free tier. One repo. One deploy.

---

## What you need before starting
- GitHub account → github.com
- Vercel account → vercel.com (sign up with GitHub)
- Supabase account → supabase.com (sign up with GitHub)
- Razorpay account → razorpay.com
- Anthropic API key → console.anthropic.com

---

## STEP 1 — Set up Supabase

### 1.1 Create a project
1. Go to supabase.com → **New Project**
2. Name: `makemycv`
3. Database password: generate a strong one and save it
4. Region: **Southeast Asia (Singapore)** — closest to India
5. Click **Create new project** — wait ~2 min

### 1.2 Create the database table
1. In your project → left sidebar → **SQL Editor**
2. Click **New query**
3. Paste the contents of `supabase-schema.sql` (in this project folder)
4. Click **Run** — you'll see "Success. No rows returned"

### 1.3 Create the storage bucket
1. Left sidebar → **Storage**
2. Click **New bucket**
3. Name: `cv-files`
4. Toggle: **Public bucket → OFF** (keep it private)
5. Click **Save**

### 1.4 Set storage policy (allow service role to upload)
1. Storage → `cv-files` bucket → **Policies** tab
2. Click **New policy** → **For full customization**
3. Policy name: `service-role-all`
4. Allowed operation: check ALL (SELECT, INSERT, UPDATE, DELETE)
5. Target roles: `service_role`
6. Click **Review** → **Save policy**

### 1.5 Get your API keys
1. Left sidebar → **Project Settings** → **API**
2. Copy:
   - **Project URL** → `https://xxxxxxxxxxxx.supabase.co`
   - **service_role** key (under "Project API keys") — the long `eyJ...` one
3. Save both — you'll need them in Step 3

---

## STEP 2 — Push code to GitHub

### 2.1 Install Git
Download from git-scm.com if not already installed.

### 2.2 Create GitHub repo
1. Go to github.com → click **+** → **New repository**
2. Name: `makemycv`
3. Visibility: **Private** (recommended — keeps your API keys safe)
4. Click **Create repository**

### 2.3 Push the code
Open **Command Prompt** or **Terminal** and run:

```bash
cd "C:\Users\welcome\OneDrive\Documents\Real Plannet\Resume_builder\Make My CV Assets\makemycv-vercel"

git init
git add .
git commit -m "MakeMyCV v1 — Vercel + Supabase"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/makemycv.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

---

## STEP 3 — Deploy on Vercel

### 3.1 Import project
1. Go to vercel.com → **Add New** → **Project**
2. Click **Import** next to your `makemycv` GitHub repo
3. Vercel auto-detects the framework — set:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: leave empty
   - **Output Directory**: `public`

### 3.2 Add environment variables
Still on the import page, scroll to **Environment Variables** and add ALL of these:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` from console.anthropic.com |
| `SUPABASE_URL` | `https://xxxx.supabase.co` from Step 1.5 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` service role key from Step 1.5 |
| `RAZORPAY_KEY_ID` | `rzp_test_...` from Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | from Razorpay dashboard |
| `CV_PRICE_PAISE` | `19900` |

### 3.3 Deploy
Click **Deploy** — Vercel builds and deploys in ~3 minutes.

Your live URL will be: `https://makemycv.vercel.app` (or similar)

---

## STEP 4 — Add Razorpay checkout script

Vercel deploy won't have the Razorpay JS loaded yet. Do this:

1. Open `public/index.html` in a text editor
2. Find the line near the bottom: `<script src="app.js"></script>`
3. Add the Razorpay script **above** it:

```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script src="app.js"></script>
```

4. Save, commit and push:
```bash
git add public/index.html
git commit -m "Add Razorpay checkout script"
git push
```
Vercel auto-redeploys on every push.

---

## STEP 5 — Add custom domain (makemycv.realplannet.com)

### 5.1 In Vercel
1. Project → **Settings** → **Domains**
2. Type `makemycv.realplannet.com` → **Add**
3. Vercel shows you a CNAME record to add

### 5.2 In your DNS (wherever realplannet.com is managed)
Add this record:

| Type | Name | Value |
|---|---|---|
| CNAME | `makemycv` | `cname.vercel-dns.com` |

DNS propagates in 5–30 minutes. Vercel auto-provisions SSL.

---

## STEP 6 — Test end-to-end

1. Open your site
2. Fill the CV form (takes ~5 min)
3. On the payment screen, use Razorpay **test card**:
   - Card number: `4111 1111 1111 1111`
   - Expiry: any future date (e.g. 12/28)
   - CVV: any 3 digits (e.g. 123)
   - OTP: `1234` if prompted
4. CV should generate in 30–60 seconds
5. Both download buttons should work

If it works → you're live on test mode.

---

## STEP 7 — Go live with real payments

1. Razorpay Dashboard → complete KYC (business verification)
2. Switch from test keys to **live keys** in Vercel env vars:
   - `RAZORPAY_KEY_ID` → `rzp_live_...`
   - `RAZORPAY_KEY_SECRET` → live secret
3. Vercel → Settings → Environment Variables → update both keys
4. Trigger a redeploy: Vercel dashboard → **Redeploy**

---

## Free Tier Limits

| Service | Free Limit | Notes |
|---|---|---|
| Vercel | 100GB bandwidth/month, unlimited deployments | More than enough for Phase 1 |
| Supabase | 500MB DB, 1GB storage, 2GB bandwidth | ~1,000 CVs before you hit storage limit |
| Anthropic | Pay per use (~₹2–3 per CV generation) | No free tier — add credits at console.anthropic.com |
| Razorpay | Free (2% per transaction) | Standard payment gateway fee |

---

## Updating the site

Every time you make changes:
```bash
git add .
git commit -m "describe what changed"
git push
```
Vercel auto-redeploys in ~1 minute.

---

## Troubleshooting

**CV generation times out**
- Vercel free tier has 60s max function duration — already set in `vercel.json`
- If still timing out: try `classic` or `minimal` template (lighter rendering)

**Supabase upload errors**
- Check the storage bucket name is exactly `cv-files`
- Check the storage policy is set for `service_role`
- Check `SUPABASE_SERVICE_ROLE_KEY` is the service_role key, NOT the anon key

**Razorpay "key not found" error**
- Double-check `RAZORPAY_KEY_ID` in Vercel env vars matches exactly (no spaces)
- Make sure `RAZORPAY_KEY_ID` is also set as a public env var (prefix with `NEXT_PUBLIC_` is NOT needed here — it's passed from the API)

---

*Real Plannet · realplannet.com*
