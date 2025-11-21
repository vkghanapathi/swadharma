#!/usr/bin/env python3
import json
import os
import re
from pathlib import Path

def extract_title_from_html(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='latin-1') as f:
            content = f.read()
    
    title_match = re.search(r'<title>(.*?)</title>', content, re.IGNORECASE)
    if title_match:
        return title_match.group(1).strip()
    h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', content, re.IGNORECASE)
    if h1_match:
        return h1_match.group(1).strip()
    return os.path.basename(file_path).replace('.html', '').replace('-', ' ').title()

def generate_index():
    q_dir = Path('q')
    index_data = []
    
    for html_file in q_dir.glob('*.html'):
        # Skip macOS metadata files
        if html_file.name.startswith('._'):
            continue
            
        title = extract_title_from_html(html_file)
        slug = html_file.stem
        
        index_data.append({
            'title': title,
            'slug': slug,
            'url': f'q/{slug}.html',
            'lang': 'en',  # Default to English for now
            'date': '',
            'excerpt': '',
            'tags': ''
        })
    
    with open('q/index.json', 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)
    
    print(f"Generated index with {len(index_data)} entries")

if __name__ == '__main__':
    generate_index()
