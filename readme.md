# Swadharma — Vedic Knowledge Portal

A non-commercial knowledge portal dedicated to preserving and explaining the scriptural, linguistic, and cultural heritage of India through scholar-reviewed Q&A content.

## Overview

Swadharma is a static website that provides authentic answers to questions about Dharma, Veda, Sanskrit, and Indian heritage. The platform emphasizes scholarly accuracy, neutral explanation, and public accessibility.

## Features

- **Browse Questions**: Search and view all published Q&A pages with filtering by language and keywords
- **Ask Questions**: Submit questions anonymously or with contact details for follow-up
- **Scholar-Reviewed Content**: All answers are verified by scholars before publication
- **Multi-language Support**: Content available in multiple languages with auto-translation
- **Static HTML**: Long-term accessibility through static file hosting
- **Responsive Design**: Mobile-friendly interface using Tailwind CSS
- **Automated Workflows**: Markdown to HTML conversion, auto-translation, and publication pipeline

## Project Structure

```
swadharma/
├── index.html          # Homepage with navigation and overview
├── about.html          # About page explaining mission and process
├── browse.html         # Browse/search interface for Q&A content
├── submit.html         # Question submission form
├── faq.html           # Frequently asked questions
├── assets/            # Images and static assets
│   ├── swadharma_logo.png
│   └── swadharma-share.png
├── content/           # Source markdown files for Q&A content
│   └── *.md          # Markdown files with frontmatter
├── q/                 # Generated Q&A content directory
│   ├── index.json     # Search index for all questions
│   └── *.html         # Individual Q&A pages (auto-generated)
├── scripts/           # Python automation scripts
│   ├── md_to_html.py  # Markdown to HTML converter
│   ├── update_index.py # Index generator
│   └── translate.py   # Auto-translation script
├── backend/           # FastAPI backend for admin functionality
│   └── main.py        # Admin authentication and API
└── .github/workflows/ # GitHub Actions for automation
    ├── add-og-tags.yml    # Auto-adds Open Graph tags
    ├── md-to-html.yml     # Markdown to HTML conversion
    ├── auto-translate.yml # Auto-translation pipeline
    └── publish-qna.yml    # Publication workflow
```

## Technology Stack

- **Frontend**: HTML5, Tailwind CSS (via CDN)
- **JavaScript**: Vanilla JS for search and filtering functionality
- **Backend**: FastAPI with JWT authentication (optional admin panel)
- **Content**: Markdown with YAML frontmatter
- **Automation**: Python scripts with GitHub Actions
- **Translation**: Google Translate API / OpenAI API integration
- **Hosting**: Static site hosting (GitHub Pages compatible) + Cloud Run for backend
- **Deployment**: Google Cloud Platform (Cloud Run recommended)

## Content Management

### Question Submission Process
1. Questions submitted by the public (anonymous allowed)
2. Draft answers created as Markdown files in `content/` directory
3. Refinement and verification by scholars
4. Auto-translation to multiple languages (if API keys configured)
5. Markdown converted to HTML and published to `q/` directory
6. Index automatically updated for search functionality

### Content Standards
- Scholarly accuracy
- Neutral, respectful explanation
- Authentic interpretation of Dharma traditions
- Public accessibility
- Multi-language support

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/vkghanapathi/swadharma.git
cd swadharma
```

2. Install Python dependencies:
```bash
pip install jinja2 markdown python-frontmatter requests
```

3. Serve locally (any static file server):
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

4. Open `http://localhost:8000` in your browser

## Adding New Q&A Content

### Method 1: Direct Markdown (Recommended)
1. Create a new Markdown file in `content/` directory:
```markdown
---
title: What is Dharma?
slug: what-is-dharma
lang: en
tags: dharma, philosophy
---

Dharma is the underlying order, duty, and righteousness...
```

2. Push to repository - automation will:
   - Auto-translate to configured languages
   - Convert to HTML in `q/` directory
   - Update search index
   - Add Open Graph tags

### Method 2: Direct HTML (Legacy)
1. Create HTML file in `q/` directory following existing template
2. Manually update `q/index.json` with metadata
3. GitHub Action will add Open Graph tags on push

## Automation Workflows

### 1. Markdown to HTML Conversion (`md-to-html.yml`)
- Triggers on changes to `content/*.md`
- Converts Markdown files to HTML using Jinja2 templates
- Updates search index automatically
- Commits generated files

### 2. Auto-Translation (`auto-translate.yml`)
- Supports multiple languages: en, hi, sa, mr, gu, te, ta, bn
- Uses Google Translate API or OpenAI API
- Requires API keys in repository secrets
- Translates missing language blocks in Markdown files

### 3. Publication Pipeline (`publish-qna.yml`)
- Triggers on PR labeled 'publish' or push to main
- Runs translation → HTML conversion → OG tag insertion
- Safe editorial workflow for content review

### 4. Open Graph Tags (`add-og-tags.yml`)
- Automatically adds social media meta tags to HTML files
- Ensures proper sharing on social platforms

## Configuration

### Required Repository Secrets
- `SITE_URL`: Your domain (e.g., https://swadharma.dharmaposhanam.in)
- `GOOGLE_TRANSLATE_API_KEY`: For auto-translation (optional)
- `OPENAI_API_KEY`: Alternative translation provider (optional)
- `GCP_PROJECT`: Google Cloud project ID (for deployment)
- `GCP_REGION`: Deployment region
- `GCP_SA_KEY`: Service account key for deployment

### Backend Setup (Optional Admin Panel)
1. Navigate to backend directory:
```bash
cd backend
pip install fastapi uvicorn python-jose
```

2. Run locally:
```bash
uvicorn main:app --reload --port 8000
```

3. Deploy to Google Cloud Run (see deployment section)

## Deployment

### Static Site (GitHub Pages)
The repository is configured for GitHub Pages deployment of the static site.

### Backend Deployment (Google Cloud Run)
1. Create GCP project and enable Cloud Run
2. Set up service account with proper permissions
3. Add deployment secrets to repository
4. Push to main branch triggers automatic deployment

### Alternative: App Engine
For simpler deployment, use Google App Engine Standard environment.

## Multi-Language Support

The platform supports automatic translation to:
- English (en)
- Hindi (hi) 
- Sanskrit (sa)
- Marathi (mr)
- Gujarati (gu)
- Telugu (te)
- Tamil (ta)
- Bengali (bn)

Configure translation providers in repository secrets for automatic translation of new content.

## Contact

- **Email**: swadharma@dharmaposhanam.in
- **Website**: https://swadharma.dharmaposhanam.in

## License

This project is dedicated to preserving and sharing knowledge about Indian heritage and Dharma traditions for educational and cultural purposes.

## Contributing

Contributions are welcome for:
- Content improvements and corrections
- Technical enhancements
- Translation to additional languages
- Accessibility improvements
- Automation workflow enhancements

Please ensure all content maintains the scholarly standards and respectful approach outlined in the project mission.

### Development Workflow
1. Fork the repository
2. Create content in `content/` directory using Markdown
3. Open pull request
4. Maintainer reviews and labels PR with 'publish'
5. Automation handles conversion and deployment
