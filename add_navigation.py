#!/usr/bin/env python3
import os
import re
from pathlib import Path

def add_navigation_header(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='latin-1') as f:
            content = f.read()
    
    # Check if navigation already exists
    if 'nav class=' in content or '<header' in content:
        return False
    
    # Navigation header HTML
    nav_header = '''  <header class="bg-white shadow-sm">
    <div class="max-w-5xl mx-auto p-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold text-[#D97706]">स्वधर्म • Swadharma</h1>
      <nav class="space-x-4 text-lg">
        <a href="/" class="hover:text-[#D97706]">Home</a>
        <a href="/browse.html" class="hover:text-[#D97706]">Browse</a>
        <a href="/submit.html" class="hover:text-[#D97706]">Ask</a>
        <a href="/about.html" class="hover:text-[#D97706]">About</a>
        <a href="/faq.html" class="hover:text-[#D97706]">FAQ</a>
      </nav>
    </div>
  </header>

'''
    
    # Insert navigation after <body> tag
    body_pattern = r'(<body[^>]*>)'
    if re.search(body_pattern, content):
        content = re.sub(body_pattern, r'\1\n' + nav_header, content)
        
        # Also fix the CSS path to be relative from q/ directory
        content = content.replace('href="assets/style.css"', 'href="../assets/style.css"')
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    
    return False

def main():
    q_dir = Path('q')
    updated_count = 0
    
    for html_file in q_dir.glob('*.html'):
        # Skip macOS metadata files
        if html_file.name.startswith('._'):
            continue
            
        if add_navigation_header(html_file):
            print(f"Updated: {html_file}")
            updated_count += 1
        else:
            print(f"Skipped: {html_file} (already has navigation)")
    
    print(f"Updated {updated_count} files")

if __name__ == '__main__':
    main()
