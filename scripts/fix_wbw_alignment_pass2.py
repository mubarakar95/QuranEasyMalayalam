#!/usr/bin/env python3
"""
Second pass: Fix remaining WBW alignment issues.

Handles:
1. Verses with +1 diff where index 1 is non-empty (address formulas
   like "يا موسى" where WBW counts ya + ism as 2 words)
   → Merge index 0 and 1 into a combined phrase, then remove index 1
2. Verses with +2 diff (two extra entries)
3. Verses with -1 diff (WBW is missing an entry) - flagged for manual review
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

    print("Loading WBW data (after first pass)...")
    with open(wbw_path, "r", encoding="utf-8") as f:
        wbw = json.load(f)
    print(f"  Loaded {len(wbw)} verses")

    print(f"\nFetching QCF4 page data ({TOTAL_PAGES} pages, {MAX_WORKERS} workers)...")
    all_pages_data = {}
    done_count = [0]

    def fetch_and_store(page):
        data = fetch_qcf4_page(page)
        done_count[0] += 1
        if done_count[0] % 100 == 0:
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

    print(f"\n=== Remaining Mismatches: {len(mismatches)} ===")

    fixed_wbw = dict(wbw)
    fixed_count = 0
    skipped_count = 0

    for verse_key, qcf4_count, wbw_count, diff in mismatches:
        current = list(fixed_wbw[verse_key])

        if diff == 1 and len(current) >= 2:
            if current[1] == "":
                # Already handled in first pass (shouldn't happen)
                del current[1]
                fixed_wbw[verse_key] = current
                fixed_count += 1
                print(f"  FIXED (empty idx 1) {verse_key}: WBW {wbw_count} -> {len(current)}")
            else:
                # Address formula: merge index 0 and 1, then remove index 1
                # e.g., "ഓ മൂസാ" → merge into single entry
                merged = current[0].rstrip() + " " + current[1].lstrip()
                current[0] = merged
                del current[1]
                fixed_wbw[verse_key] = current
                fixed_count += 1
                print(f"  FIXED (merged) {verse_key}: '{current[0][:50]}...' (WBW {wbw_count} -> {len(current)})")

        elif diff == 2 and len(current) >= 3:
            # Two extra entries - need to find and remove them
            # Strategy: remove first empty entry, then check again
            if current[1] == "":
                del current[1]
                # Now check if it's still +1
                if len(current) - qcf4_count == 1:
                    if current[1] == "":
                        del current[1]
                    else:
                        # Merge
                        merged = current[0].rstrip() + " " + current[1].lstrip()
                        current[0] = merged
                        del current[1]
                fixed_wbw[verse_key] = current
                fixed_count += 1
                print(f"  FIXED (double) {verse_key}: WBW {wbw_count} -> {len(current)}")
            else:
                # Try removing two non-empty entries
                # This is tricky - flag for manual review
                print(f"  MANUAL REVIEW (diff +2) {verse_key}: QCF4={qcf4_count}, WBW={wbw_count}")
                print(f"    First 5 entries: {current[:5]}")
                skipped_count += 1

        elif diff == -1:
            # WBW is MISSING an entry - this is a data quality issue
            # Can't auto-fix, flag for manual review
            print(f"  MISSING ENTRY {verse_key}: QCF4={qcf4_count}, WBW={wbw_count}")
            skipped_count += 1

        else:
            print(f"  UNKNOWN PATTERN {verse_key}: diff={diff:+d}")
            skipped_count += 1

    print(f"\n  Fixed: {fixed_count} verses")
    print(f"  Skipped: {skipped_count} verses")

    # Write fixed data
    print(f"\nWriting fixed data to {wbw_path}...")
    with open(wbw_path, "w", encoding="utf-8") as f:
        json.dump(fixed_wbw, f, ensure_ascii=False, separators=(",", ":"))

    # Verify
    print("\n=== Verification ===")
    remaining = 0
    for verse_key in qcf4_counts:
        qcf4_count = qcf4_counts[verse_key]
        wbw_count = len(fixed_wbw.get(verse_key, []))
        diff = wbw_count - qcf4_count
        if diff != 0:
            remaining += 1
            if remaining <= 20:
                print(f"  {verse_key}: QCF4={qcf4_count}, WBW={wbw_count}, diff={diff:+d}")

    if remaining == 0:
        print("  All mismatches resolved!")
    else:
        print(f"  {remaining} mismatches remaining (mostly -1 diff, missing WBW entries)")

    print("\nDone!")


if __name__ == "__main__":
    main()
