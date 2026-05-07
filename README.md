# Style Assistant

AI-powered outfit matcher. Upload your wardrobe, drop a lookbook image, and Claude matches what you already own.

## Deploy to Netlify

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create style-assistant --public --push
```

### 2. Connect to Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import an existing project**
2. Connect your GitHub repo
3. Build settings:
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
4. Click **Deploy site**

### 3. Add your API key

1. In Netlify dashboard → **Site configuration** → **Environment variables**
2. Add variable:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic API key (from console.anthropic.com)
3. **Redeploy** the site (Deploys → Trigger deploy)

Your site is live. ✓

## Local development

```bash
npm install
# Add ANTHROPIC_API_KEY to a .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
npm run dev
```

Open http://localhost:8888

## How it works

1. Upload wardrobe items — backgrounds are removed automatically via canvas flood-fill + Claude vision analysis
2. Drop a lookbook image (or paste with Ctrl+V)
3. Hit **Generate fit** — Claude analyses the lookbook outfit and matches each piece to your closest wardrobe item
4. The outfit board shows your lookbook alongside matched items with match scores and a stylist note

## File structure

```
style-assistant/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── netlify/
│   └── functions/
│       └── claude.js    ← API proxy (keeps key server-side)
├── netlify.toml
└── package.json
```
