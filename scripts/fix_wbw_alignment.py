#!/usr/bin/env python3
"""
Fix Malayalam WBW alignment issues.

Root cause: The WBW data source counts يَاأَيُّهَا as 2 words (يَا + أَيُّهَا)
while QCF4 counts it as 1 word. This causes the WBW array to have +1 extra
entries for verses starting with يَاأَيُّهَا, shifting all subsequent meanings
by 1 position.

Fix: Remove the extra entry at index 1 (the أَيُّهَا slot) for affected verses.
"""

import json
import urllib.request
import time
import os
from typing import Optional
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

CDN_URL = "https://cdn.jsdelivr.net/gh/MohamadHajjRabee/quran-qcf4@main"
TOTAL_PAGES = 604
MAX_WORKERS = 20


def fetch_qcf4_page(page: int) -> Optional[dict]:
    padded = f"{page:03d}"
    urls = [
        f"{CDN_URL}/pages/{padded}.json",
        f"https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/main/pages/{padded}.json",
    ]
    for url in urls:
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception:
            pass
    return None


def count_qcf4_words(all_pages_data: dict) -> dict:
    counts = defaultdict(int)
    for page_num, data in all_pages_data.items():
        for line in data.get("lines", []):
            for w in line["words"]:
                if w.get("verse_key") and w["type"] == "word":
                    counts[w["verse_key"]] += 1
    return dict(counts)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    wbw_path = os.path.join(project_dir, "public", "malayalam-wbw.json")

    print("Loading WBW data...")
    with open(wbw_path, "r", encoding="utf-8") as f:
        wbw = json.load(f)
    print(f"  Loaded {len(wbw)} verses")

    print(f"\nFetching QCF4 page data ({TOTAL_PAGES} pages, {MAX_WORKERS} workers)...")
    all_pages_data = {}
    done_count = [0]

    def fetch_and_store(page):
        data = fetch_qcf4_page(page)
        done_count[0] += 1
        if done_count[0] % 50 == 0:
            print(f"  Fetched {done_count[0]}/{TOTAL_PAGES} pages...")
        return (page, data)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch_and_store, p): p for p in range(1, TOTAL_PAGES + 1)}
        for future in as_completed(futures):
            page, data = future.result()
            if data:
                all_pages_data[page] = data

    print(f"  Fetched {len(all_pages_data)}/{TOTAL_PAGES} pages successfully")

    qcf4_counts = count_qcf4_words(all_pages_data)
    print(f"  Found {len(qcf4_counts)} verses in QCF4 data")

    mismatches = []
    for verse_key in sorted(qcf4_counts.keys(),
                            key=lambda x: (int(x.split(':')[0]), int(x.split(':')[1]))):
        qcf4_count = qcf4_counts[verse_key]
        wbw_count = len(wbw.get(verse_key, []))
        diff = wbw_count - qcf4_count
        if diff != 0:
            mismatches.append((verse_key, qcf4_count, wbw_count, diff))

    print(f"\n=== Mismatch Summary ===")
    print(f"Total verses with QCF4 data: {len(qcf4_counts)}")
    print(f"Total verses with WBW data: {len(wbw)}")
    print(f"Verses with mismatch: {len(mismatches)}")

    diff_groups = defaultdict(list)
    for vk, q, w, d in mismatches:
        diff_groups[d].append((vk, q, w))

    for diff_val in sorted(diff_groups.keys()):
        verses = diff_groups[diff_val]
        print(f"\n  Diff {diff_val:+d}: {len(verses)} verses")
        for vk, q, w in verses[:30]:
            print(f"    {vk}: QCF4={q}, WBW={w}")
        if len(verses) > 30:
            print(f"    ... and {len(verses) - 30} more")

    if not mismatches:
        print("\nNo mismatches found! Nothing to fix.")
        return

    print(f"\n=== Applying Fix ===")
    fixed_wbw = dict(wbw)
    fixed_count = 0
    skipped_count = 0

    for verse_key, qcf4_count, wbw_count, diff in mismatches:
        if diff == 1:
            current = list(fixed_wbw[verse_key])
            if len(current) >= 2 and current[1] == "":
                del current[1]
                fixed_wbw[verse_key] = current
                fixed_count += 1
                print(f"  FIXED {verse_key}: removed index 1 (WBW {wbw_count} -> {len(current)}, QCF4={qcf4_count})")
            else:
                print(f"  SKIP {verse_key}: index 1 is not empty: '{current[1][:40] if len(current) > 1 else 'N/A'}'")
                skipped_count += 1
        else:
            print(f"  MANUAL REVIEW {verse_key}: diff={diff:+d} (QCF4={qcf4_count}, WBW={wbw_count})")
            skipped_count += 1

    print(f"\n  Fixed: {fixed_count} verses")
    print(f"  Skipped: {skipped_count} verses")

    backup_path = os.path.join(project_dir, "public", "malayalam-wbw.json.bak")
    print(f"\nCreating backup at {backup_path}...")
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(wbw, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Writing fixed data to {wbw_path}...")
    with open(wbw_path, "w", encoding="utf-8") as f:
        json.dump(fixed_wbw, f, ensure_ascii=False, separators=(",", ":"))

    print("\n=== Verification ===")
    recheck_mismatches = 0
    for verse_key in qcf4_counts:
        qcf4_count = qcf4_counts[verse_key]
        wbw_count = len(fixed_wbw.get(verse_key, []))
        diff = wbw_count - qcf4_count
        if diff != 0:
            recheck_mismatches += 1
            print(f"  Still mismatched: {verse_key}: QCF4={qcf4_count}, WBW={wbw_count}, diff={diff:+d}")

    if recheck_mismatches == 0:
        print("  All mismatches resolved!")
    else:
        print(f"  {recheck_mismatches} mismatches remaining")

    print("\nDone!")


if __name__ == "__main__":
    main()
