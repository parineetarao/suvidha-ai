"""
Finds well-known schemes on myScheme BY NAME and ingests them (published + featured).
Only a search result whose title contains every distinctive word of the name is accepted,
so a wrong or missing scheme is reported as NOT FOUND and skipped.

  python -m scripts.add_famous --only women --resolve-only   # just look, nothing is added
  python -m scripts.add_famous                               # resolve everything, then ingest
  python -m scripts.add_famous --only students unemployed
"""
import argparse
import difflib
import re
import sys
import time

import app.db.base  # noqa: F401
from playwright.sync_api import sync_playwright

from app.ingestion.myscheme_scraper import USER_AGENT
from scripts import ingest_slugs

BASE = "https://www.myscheme.gov.in"
SELF_TEST = ("Atal Pension Yojana", "apy")
RESULT_SEL = 'div[role="article"] h2 a[href^="/schemes/"]'

CATEGORIES = {
    "women": [
        "Lek Ladki Yojana", "Beti Bachao Beti Padhao", "Janani Suraksha Yojana", "Mahila Shakti Kendra",
        "Swadhar Greh", "One Stop Centre", "Support to Training and Employment Programme for Women",
        "Lakhpati Didi", "Namo Drone Didi", "Ladli Lakshmi Yojana", "Kanya Sumangala Yojana",
        "Gruha Lakshmi", "Kalaignar Magalir Urimai Thogai", "Subhadra Yojana", "Lakshmir Bhandar",
        "Mahila Udyam Nidhi", "Annapurna Scheme", "Mukhyamantri Kanya Vivah Yojana",
        "Surakshit Matritva Abhiyan",
    ],
    "students": [
        "Post Matric Scholarship for Scheduled Castes", "Post Matric Scholarship for Scheduled Tribes",
        "Pre Matric Scholarship for Scheduled Tribes", "YASASVI",
        "Scholarship for College and University Students", "National Means cum Merit Scholarship",
        "Pragati Scholarship for Girls", "Saksham Scholarship",
        "Merit cum Means Scholarship Professional Technical Courses", "Maulana Azad National Fellowship",
        "INSPIRE Scholarship", "Vidyalaxmi", "Central Sector Interest Subsidy",
        "Rajarshi Shahu Maharaj Shikshan Shulkh Shishyavrutti", "Panjabrao Deshmukh Vasatigruh Nirvah Bhatta",
        "Ishan Uday", "Post Matric Scholarship for Students with Disabilities", "National Overseas Scholarship",
    ],
    "unemployed": [
        "Employment Generation Programme PMEGP", "Vishwakarma", "National Apprenticeship Promotion Scheme",
        "Deen Dayal Upadhyaya Grameen Kaushalya Yojana", "Mahatma Gandhi National Rural Employment Guarantee",
        "SVANidhi", "Internship Scheme", "Mukhyamantri Yuva Karya Prashikshan Yojana",
        "Chief Minister Employment Generation Programme", "Annasaheb Patil Arthik Magas Vikas Mahamandal",
        "Jan Shikshan Sansthan", "National Career Service",
    ],
    "seniors": [
        "Vaya Vandana Yojana", "Rashtriya Vayoshri Yojana", "Ayushman Vay Vandana", "Shram Yogi Maan-dhan",
        "Atal Vayo Abhyuday Yojana", "Varishtha Pension Bima Yojana", "Mukhyamantri Vayoshri Yojana",
        "Shravan Bal Seva Rajya Nivruttivetan Yojana", "Sanjay Gandhi Niradhar Anudan Yojana",
        "Indira Gandhi National Old Age Pension Scheme", "National Social Assistance Programme",
        "Senior Citizens Welfare Fund",
    ],
    "farmers": [
        "Kisan Credit Card", "Krishi Sinchayee Yojana", "Kisan Maandhan Yojana", "KUSUM", "Soil Health Card",
        "Namo Shetkari Mahasanman Nidhi", "Gopinath Munde Shetkari Apghat Vima Yojana",
        "Mahatma Jyotirao Phule Shetkari Karj Mukti Yojana", "Magel Tyala Shettale",
        "Mukhyamantri Saur Krishi Vahini", "Rashtriya Krishi Vikas Yojana", "Agriculture Infrastructure Fund",
        "Babasaheb Ambedkar Krishi Swavalamban Yojana", "Matsya Sampada Yojana",
        "Paramparagat Krishi Vikas Yojana",
    ],
    "disability": [
        "Indira Gandhi National Disability Pension Scheme",
        "Assistance to Disabled Persons Aids Appliances", "Pre Matric Scholarship for Students with Disabilities",
        "National Fellowship for Persons with Disabilities", "Deendayal Disabled Rehabilitation Scheme",
        "Top Class Education for Students with Disabilities", "Niramaya Health Insurance",
        "Swavalamban Card UDID", "National Handicapped Finance and Development Corporation",
    ],
    "health": [
        "Rashtriya Bal Swasthya Karyakram", "Mahatma Jyotiba Phule Jan Arogya Yojana",
        "National Dialysis Programme", "Rashtriya Arogya Nidhi", "Health Minister Cancer Patient Fund",
        "Mukhyamantri Sahayata Nidhi", "Janaushadhi Pariyojana", "Janani Shishu Suraksha Karyakram",
        "Health Care of the Elderly", "Chief Minister Comprehensive Health Insurance Scheme",
        "Rajiv Gandhi Jeevandayee Arogya Yojana",
    ],
    "housing": [
        "Awas Yojana Urban", "Ramai Awas Yojana", "Shabari Adivasi Gharkul Yojana", "Pardhi Gharkul Yojana",
        "Credit Linked Subsidy Scheme", "Rural Housing Interest Subsidy", "Indira Awaas Yojana",
    ],
    "workers": [
        "Jeevan Jyoti Bima Yojana", "Atal Beemit Vyakti Kalyan Yojana", "e-Shram",
        "Building and Other Construction Workers Welfare", "Unorganised Workers Social Security",
        "Scholarship for Children of Beedi Workers",
    ],
    "transgender": [
        "SMILE Support for Marginalised Individuals", "Garima Greh", "Scholarship for Transgender Students",
        "National Portal for Transgender Persons", "Transgender Welfare Board", "NAMASTE",
    ],
    "reserved": [
        "Venture Capital Fund for Scheduled Castes", "SHREYAS", "PM AJAY", "Nai Manzil", "Seekho Aur Kamao",
        "DAKSH", "Inter Caste Marriage Social Integration", "PM JANMAN", "Padho Pardesh", "Naya Savera",
        "Virasat Ka Samvardhan",
    ],
    "children": [
        "Poshan Shakti Nirman", "Mission Vatsalya", "Integrated Child Development Services",
        "Sponsorship and Foster Care", "PM CARES for Children", "Samagra Shiksha",
        "National Child Labour Project", "Bal Sangopan Yojana",
    ],
}

STOP = {"the", "of", "for", "and", "to", "in", "a", "an", "scheme", "schemes", "yojana", "pradhan", "mantri",
        "pm", "programme", "program", "national", "mukhyamantri", "chief", "minister", "state", "government"}


def toks(text):
    return re.findall(r"[a-z0-9]+", (text or "").lower().replace("yojna", "yojana"))


def distinct(ts):
    return [w for w in ts if w not in STOP and len(w) >= 2]


def same(a, b):
    return a == b or (len(a) >= 4 and len(b) >= 4 and difflib.SequenceMatcher(None, a, b).ratio() >= 0.84)


def title_matches(query, title):
    q, t = distinct(toks(query)), toks(title)
    return bool(q) and all(any(same(w, x) for x in t) for w in q)


def first_href(page):
    el = page.query_selector(RESULT_SEL)
    return el.get_attribute("href") if el else None


def search(page, name):
    """Types `name` into myScheme's search box and returns [(slug, title), ...]."""
    page.goto(f"{BASE}/search", wait_until="networkidle")
    try:
        page.wait_for_selector(RESULT_SEL, timeout=15000)
    except Exception:
        pass
    before = first_href(page)
    box = page.locator('input[placeholder*="earch" i]')
    if box.count() == 0:
        box = page.locator('input[type="text"], input[type="search"], input:not([type])')
    if box.count() == 0:
        raise RuntimeError("could not find the search box on myscheme.gov.in/search")
    box = box.first
    box.fill(name)
    box.press("Enter")
    deadline = time.time() + 10
    while time.time() < deadline:
        page.wait_for_timeout(500)
        if first_href(page) != before or "No Schemes Found" in page.inner_text("body"):
            break
    page.wait_for_timeout(1000)
    out = []
    for a in page.query_selector_all(RESULT_SEL)[:8]:
        href = a.get_attribute("href") or ""
        out.append((href.removeprefix("/schemes/"), (a.inner_text() or "").strip()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="+", choices=list(CATEGORIES))
    ap.add_argument("--resolve-only", action="store_true")
    ap.add_argument("--skip-selftest", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    resolved, missing = {}, []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)
        if not args.skip_selftest:
            results = search(page, SELF_TEST[0])
            if SELF_TEST[1] not in [s for s, _ in results]:
                print("SELF-TEST FAILED: searching", SELF_TEST[0], "did not return slug", SELF_TEST[1])
                print("results seen:", results)
                browser.close()
                return
            print("self-test passed: the search mechanism works\n")
        for cat in (args.only or list(CATEGORIES)):
            print(f"== {cat}")
            found = 0
            for name in CATEGORIES[cat]:
                try:
                    results = search(page, name)
                except Exception as exc:
                    print(f"   ERROR   {name}: {exc}")
                    continue
                hit = next(((s, t) for s, t in results if title_matches(name, t)), None)
                if hit:
                    resolved.setdefault(hit[0], (cat, name, hit[1]))
                    found += 1
                    print(f"   OK      {name} -> {hit[0]}  [{hit[1][:70]}]")
                else:
                    missing.append(name)
                    print(f"   MISSING {name}")
                time.sleep(2)
            print(f"   {found} of {len(CATEGORIES[cat])} found\n")
        browser.close()

    slugs = list(resolved)
    with open("famous_slugs_resolved.txt", "w", encoding="utf-8") as f:
        f.write(" ".join(slugs))
    print(f"{len(slugs)} schemes resolved ({len(missing)} not found on myScheme). Saved to famous_slugs_resolved.txt")
    if args.resolve_only or not slugs:
        return
    ingest_slugs.main(slugs)


if __name__ == "__main__":
    main()