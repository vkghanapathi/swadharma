1) md-to-html.yml — Markdown → HTML conversion

Place at: .github/workflows/md-to-html.yml

name: Markdown to HTML (convert)

on:
  push:
    paths:
      - 'content/**.md'
      - '.github/workflows/md-to-html.yml'

permissions:
  contents: write

jobs:
  convert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python 3.11
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install jinja2 markdown python-frontmatter

      - name: Convert markdown to HTML
        run: |
          python scripts/md_to_html.py --content_dir content --out_dir q --site_url "${{ secrets.SITE_URL || 'https://swadharma.dharmaposhanam.in' }}"

      - name: Update q/index.json
        run: |
          python scripts/update_index.py --qdir q --out q/index.json

      - name: Commit generated HTML
        run: |
          git config user.name "Swadharma CI"
          git config user.email "ci@dharmaposhanam.in"
          git add q/*.html q/index.json || true
          if [ -n "$(git status --porcelain)" ]; then
            git commit -m "ci: convert markdown → html and update index"
            git push
          else
            echo "No changes"
          fi


How it works

Any .md file pushed to content/ is converted into q/<slug>.html using scripts/md_to_html.py.

The script reads a frontmatter block (YAML) for title, slug, lang, tags, etc.

After conversion it updates q/index.json and commits results.

2) auto-translate.yml — Auto-translate missing languages

Place at: .github/workflows/auto-translate.yml

name: Auto Translate

on:
  push:
    paths:
      - 'content/**.md'
      - '.github/workflows/auto-translate.yml'

permissions:
  contents: write

jobs:
  translate:
    runs-on: ubuntu-latest
    env:
      SITE_URL: ${{ secrets.SITE_URL || 'https://swadharma.dharmaposhanam.in' }}
      GOOGLE_TRANSLATE_API_KEY: ${{ secrets.GOOGLE_TRANSLATE_API_KEY || '' }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY || '' }}
    steps:
      - uses: actions/checkout@v3

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"

      - name: Install translation deps
        run: |
          python -m pip install --upgrade pip
          pip install python-frontmatter requests

      - name: Auto-translate missing language blocks
        run: |
          python scripts/translate.py --content_dir content \
            --langs en,hi,sa,mr,gu,te,ta,bn \
            --google_key "${{ env.GOOGLE_TRANSLATE_API_KEY }}" \
            --openai_key "${{ env.OPENAI_API_KEY }}"

      - name: Commit translations
        run: |
          git config user.name "Swadharma CI"
          git config user.email "ci@dharmaposhanam.in"
          git add content/*.md || true
          if [ -n "$(git status --porcelain)" ]; then
            git commit -m "ci: auto-translate missing languages"
            git push
          else
            echo "No translation changes"
          fi


Notes

The translation script will:

Parse frontmatter and language blocks

For each missing language block, call the translation provider

If GOOGLE_TRANSLATE_API_KEY is set, it will prefer Google Translate API

If OPENAI_API_KEY is set, you may opt to use OpenAI translations (requires different code)

Fill the .md and commit the updated markdown so the md-to-html job can convert to HTML

Security: Put API keys in your repo Secrets (Settings → Secrets → Actions).

3) publish-qna.yml — Publication pipeline (PR → publish)

Place at: .github/workflows/publish-qna.yml

name: Publish Q&A pipeline

on:
  pull_request:
    types: [opened, labeled, synchronize]
    paths:
      - 'content/**.md'
  push:
    branches:
      - main
    paths:
      - 'content/**.md'

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    if: github.event.pull_request.labels.*.name contains 'publish' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"

      - name: Install requirements
        run: |
          python -m pip install --upgrade pip
          pip install jinja2 markdown python-frontmatter requests

      - name: Convert & translate (if needed)
        run: |
          python scripts/translate.py --content_dir content --langs en,hi,sa,mr,gu,te,ta,bn --dry_run False \
            --google_key "${{ secrets.GOOGLE_TRANSLATE_API_KEY || '' }}" \
            --openai_key "${{ secrets.OPENAI_API_KEY || '' }}"
          python scripts/md_to_html.py --content_dir content --out_dir q --site_url "${{ secrets.SITE_URL || 'https://swadharma.dharmaposhanam.in' }}"

      - name: Insert OG tags
        run: |
          for f in q/*.html; do
            if ! grep -q 'og:title' "$f"; then
              sed -i 's|<title>|<meta property="og:title" content="Swadharma — Vedic Knowledge Portal">\n<meta property="og:description" content="Explore scholar-reviewed answers on Dharma, Veda, Sanskrit, and Indian heritage.">\n<meta property="og:type" content="website">\n<meta property="og:image" content="/assets/swadharma-share.png">\n<meta property="og:url" content="${{ secrets.SITE_URL || 'https://swadharma.dharmaposhanam.in' }}">\n<meta name="twitter:card" content="summary_large_image">\n<title>|' "$f"
            fi
          done

      - name: Update index.json
        run: |
          python scripts/update_index.py --qdir q --out q/index.json

      - name: Commit published files
        run: |
          git config user.name "Swadharma CI"
          git config user.email "ci@dharmaposhanam.in"
          git add q/*.html q/index.json || true
          if [ -n "$(git status --porcelain)" ]; then
            git commit -m "publish: add html for published Q&A"
            git push
          else
            echo "No publish changes"
          fi


Behavior

When a PR is labeled publish OR you push to main, this pipeline:

Ensures translations, converts MD→HTML

Adds OG tags (if missing)

Regenerates q/index.json

Commits published files to q/

This gives a safe editorial flow: author writes content/*.md, opens PR, reviewer labels publish, and CI does the rest.

Helper scripts (create scripts/ folder)
scripts/md_to_html.py

Save this in scripts/md_to_html.py. It uses python-frontmatter and markdown to render HTML inside a small Jinja template.

#!/usr/bin/env python3
# scripts/md_to_html.py
import os, sys, argparse, frontmatter, markdown, jinja2, pathlib

TEMPLATE = """<!doctype html>
<html lang="{{lang}}">
<head>
  <meta charset="utf-8">
  <title>{{title}} — Swadharma</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#FAF7EF] text-[#1F2937]">
  <main class="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow mt-6">
    <h1 class="text-3xl font-bold text-[#D97706] mb-4">{{title}}</h1>
    <article class="prose lg:prose-xl">{{content|safe}}</article>
    <footer class="text-sm text-gray-600 mt-6">
      Contact: <a href="mailto:swadharma@dharmaposhanam.in">swadharma@dharmaposhanam.in</a>
    </footer>
  </main>
</body>
</html>
"""

def convert(md_path, out_dir, site_url):
    post = frontmatter.load(md_path)
    meta = post.metadata
    title = meta.get('title', post.get('title', pathlib.Path(md_path).stem))
    slug = meta.get('slug', pathlib.Path(md_path).stem)
    lang = meta.get('lang', 'en')
    html = markdown.markdown(post.content, extensions=['extra','toc'])
    tmpl = jinja2.Template(TEMPLATE)
    out_html = tmpl.render(title=title, content=html, lang=lang, site_url=site_url)
    out_path = os.path.join(out_dir, f"{slug}.html")
    os.makedirs(out_dir, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write(out_html)
    print("WROTE", out_path)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--content_dir', default='content')
    p.add_argument('--out_dir', default='q')
    p.add_argument('--site_url', default='')
    args = p.parse_args()
    for fname in os.listdir(args.content_dir):
        if not fname.endswith('.md'): continue
        convert(os.path.join(args.content_dir, fname), args.out_dir, args.site_url)

if __name__ == "__main__":
    main()

scripts/update_index.py
#!/usr/bin/env python3
# scripts/update_index.py
import os, json, argparse
def main():
    p = argparse.ArgumentParser()
    p.add_argument('--qdir', default='q')
    p.add_argument('--out', default='q/index.json')
    args = p.parse_args()
    entries = []
    for fname in sorted(os.listdir(args.qdir)):
        if not fname.endswith('.html'): continue
        path = os.path.join(args.qdir, fname)
        # naive extract: read first <h1> and maybe first paragraph
        with open(path, 'r', encoding='utf-8') as fh:
            html = fh.read()
        # simple parse (quick but robust enough for our generated pages)
        import re
        m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S|re.I)
        title = m.group(1).strip() if m else fname.replace('.html','')
        p = re.search(r'<p[^>]*>(.*?)</p>', html, re.S|re.I)
        excerpt = (p.group(1).strip()[:200]) if p else ''
        slug = fname.replace('.html','')
        entries.append({"title": title, "slug": slug, "date": "", "lang": "en", "excerpt": excerpt, "tags": ""})
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(entries, fh, ensure_ascii=False, indent=2)
    print("WROTE", args.out)

if __name__ == "__main__":
    main()

scripts/translate.py (starter wrapper)

Important: This is a starter. Translation providers require keys and possibly billing. The script supports Google Cloud Translate (REST) if you set GOOGLE_TRANSLATE_API_KEY as a repository secret, or OpenAI if you prefer. It will skip if no key is provided.

#!/usr/bin/env python3
# scripts/translate.py
import os, sys, argparse, frontmatter, json, requests, time

def google_translate(text, target, key):
    url = "https://translation.googleapis.com/language/translate/v2"
    resp = requests.post(url, params={'key': key}, json={'q':text,'target':target})
    resp.raise_for_status()
    data = resp.json()
    return data['data']['translations'][0]['translatedText']

def translate_file(path, langs, google_key, openai_key):
    post = frontmatter.load(path)
    content = post.content
    # look for blocks like :::en ... ::: or you can define your own multi-block format
    for lang in langs:
        marker = f"\n:::{lang}\n"
        if marker in post.content:
            # already present
            continue
    # For simplicity: treat entire content as source english -> translate to missing langs
    for lang in langs:
        if f":::{lang}" not in post.content:
            if google_key:
                translated = google_translate(content, lang, google_key)
                post.content += f"\n:::{lang}\n{translated}\n:::\n"
            else:
                print("No google key; skipping translation for", path, lang)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(frontmatter.dumps(post))

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--content_dir', default='content')
    p.add_argument('--langs', default='en,hi,sa').help = 'comma list'
    p.add_argument('--google_key', default='')
    p.add_argument('--openai_key', default='')
    args = p.parse_args()
    langs = [l.strip() for l in args.langs.split(',')]
    for fname in os.listdir(args.content_dir):
        if not fname.endswith('.md'): continue
        translate_file(os.path.join(args.content_dir, fname), langs, args.google_key, args.openai_key)

if __name__ == "__main__":
    main()


NOTE: scripts/translate.py is deliberately simple — it's a starting point. I can expand it to:

use structured frontmatter multi-language blocks,

use better segmentation, and

use OpenAI translations with prompt engineering if you prefer.

4) Admin Authentication (FastAPI starter)

Create backend/ with a minimal FastAPI app using JWT authentication for admin panel.

backend/main.py:

from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
import jwt, time, os

SECRET = os.environ.get("ADMIN_JWT_SECRET", "change_this_secret")
app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/admin/token")

# very small in-memory example (load from file in production)
ADMINS = {"admin@dharmaposhanam.in": "strongpasswordhash"}  # store hashes

class Token(BaseModel):
    access_token: str
    token_type: str

@app.post("/admin/token", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Extremely simplified for demo: replace with proper hash check
    username = form_data.username
    password = form_data.password
    if username not in ADMINS or password != "changeme":
        raise HTTPException(status_code=400, detail="Incorrect credentials")
    payload = {"sub": username, "exp": int(time.time()) + 3600*24}
    token = jwt.encode(payload, SECRET, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer"}

def get_current_admin(token: str = Depends(oauth2_scheme)):
    try:
        data = jwt.decode(token, SECRET, algorithms=["HS256"])
        return data["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/admin/me")
def me(user=Depends(get_current_admin)):
    return {"admin": user}


Notes

This is a minimal example. For production, use hashed passwords, HTTPS, proper session management, and a DB (or Google Secret Manager) for admin credentials.

Deploy this backend to Cloud Run or App Engine (see below).

Your React admin UI can call /admin/token to authenticate and store JWT in localStorage, then call protected endpoints.

5) Deployment to GCP — recommended path

Two practical production options:

A) Cloud Run (recommended)

Containerize the FastAPI backend (Docker).

Use GitHub Actions to build and push container to Google Container Registry or Artifact Registry, then deploy to Cloud Run.

Cloud Run provides HTTPS, autoscaling, and easy environment variable configuration.

Quick steps

Create a GCP project

Enable Cloud Run and Artifact Registry

Create a service account and give proper permissions

Add GCP service account key as GCP_SA_KEY in GitHub secrets

Add a workflow to build and deploy container on main push

Sample deploy action snippet (to add to your workflow):

- name: Set up Cloud SDK
  uses: google-github-actions/setup-gcloud@v1
  with:
    service_account_key: ${{ secrets.GCP_SA_KEY }}
    project_id: ${{ secrets.GCP_PROJECT }}

- name: Deploy to Cloud Run
  run: |
    gcloud run deploy swadharma-backend \
      --image gcr.io/${{ secrets.GCP_PROJECT }}/swadharma-backend:${{ github.sha }} \
      --region=${{ secrets.GCP_REGION }} \
      --platform=managed \
      --allow-unauthenticated

B) App Engine (Standard / Flexible)

Simpler for small-scale apps; upload code via gcloud app deploy.

Less flexible for containerized microservices but fine for FastAPI.

6) How to kickstart everything now (step-by-step)

Add the scripts and workflows into your repo:

scripts/ — put the three Python scripts

.github/workflows/ — put the three YAML files (md-to-html, auto-translate, publish-qna)

Create content/ and add one sample file:

content/what-is-dharma.md with frontmatter:

---
title: What is Dharma?
slug: what-is-dharma
lang: en
tags: dharma
---
Dharma is the underlying order...


Add secrets (GitHub → Settings → Secrets → Actions):

SITE_URL = https://yourdomain

GOOGLE_TRANSLATE_API_KEY (optional)

OPENAI_API_KEY (optional)

GCP_PROJECT, GCP_REGION, GCP_SA_KEY (if using Cloud Run)

Upload the OG share image (from your local workspace path):

Take the file at:

/mnt/data/A_2D_digital_graphic_design_features_the_logo_and_.png


and upload it into your GitHub repo at:

assets/swadharma-share.png


Push a Markdown to content/ (kickstarts translate + md->html workflows). Open a PR and label it publish to test the publish pipeline.

Deploy backend:

If you use Cloud Run: add Dockerfile, create GCP secrets, add deploy workflow.

Or run locally for testing: uvicorn backend.main:app --reload --port 8000

Wire the admin UI to backend endpoints (e.g., host admin static pages on GitHub Pages or same domain; backend at Cloud Run).
