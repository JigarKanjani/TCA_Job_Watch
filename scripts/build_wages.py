#!/usr/bin/env python3
"""
Builds lib/pay/data/wages.json — the wage benchmarks behind JobWatch's pay
estimates — from two official open datasets:

  Canada: Job Bank wages 2025 (ESDC; reference period 2023-2024), by NOC 2021
          occupation and economic region. Open Government Licence - Canada.
          https://open.canada.ca/data/en/dataset/adad580f-76b0-4502-bd05-20c125de9116
  US:     BLS Occupational Employment and Wage Statistics, May 2025, by SOC
          occupation, national and state. Public domain.
          https://www.bls.gov/oes/tables.htm

Only the occupations referenced in lib/pay/data/occupations.json are kept.
Every value is annual pay in local dollars (hourly x 2080, i.e. full time),
stored as [low, 25th pct, median, 75th pct, high] (Job Bank low/high are
roughly the 10th/90th percentiles).

Usage (needs openpyxl):
  python scripts/build_wages.py <download-dir>
The download dir must hold the Job Bank CSV and the unzipped BLS files
(oesm25nat/national_M2025_dl.xlsx, oesm25st/state_M2025_dl.xlsx).
"""

import csv
import glob
import io
import json
import os
import sys

import openpyxl

HOURS = 2080
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OCC = os.path.join(ROOT, "lib", "pay", "data", "occupations.json")
OUT = os.path.join(ROOT, "lib", "pay", "data", "wages.json")


def num(v):
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if s == "#":  # BLS top-code: at least $239,200/yr ($115/hr)
        return 239200.0
    try:
        return float(s)
    except ValueError:
        return None


def five(low, q1, med, q3, high, annual):
    """Fill gaps and annualise; returns None without a median."""
    if med is None:
        return None
    q1 = q1 if q1 is not None else (med + low) / 2 if low is not None else med * 0.82
    q3 = q3 if q3 is not None else (med + high) / 2 if high is not None else med * 1.2
    low = low if low is not None else q1 * 0.85
    high = high if high is not None else q3 * 1.2
    mult = 1 if annual else HOURS
    return [round(x * mult / 100) * 100 for x in (low, q1, med, q3, high)]


def main(src):
    occ = json.load(open(OCC))["occupations"]
    nocs = {f"NOC_{o['noc']}" for o in occ}
    socs = {o["soc"] for o in occ}

    # ---- Canada (Job Bank)
    path = glob.glob(os.path.join(src, "*.csv"))[0]
    raw = open(path, "rb").read().decode("utf-8-sig", errors="replace")
    ca = {}
    for r in csv.DictReader(io.StringIO(raw)):
        if r["NOC_CNP"] not in nocs:
            continue
        vals = five(
            num(r["Low_Wage_Salaire_Minium"]),
            num(r["Quartile1_Wage_Salaire_Quartile1"]),
            num(r["Median_Wage_Salaire_Median"]),
            num(r["Quartile3_Wage_Salaire_Quartile3"]),
            num(r["High_Wage_Salaire_Maximal"]),
            r["Annual_Wage_Flag_Salaire_annuel"].strip() == "1",
        )
        if not vals:
            continue
        prov, er = r["prov"], r["ER_Name"]
        key = "NAT" if prov == "NAT" else prov if er in PROVINCE_NAMES else f"{prov}/{er}"
        ca.setdefault(r["NOC_CNP"][4:], {})[key] = vals

    # ---- US (BLS OEWS)
    us = {}
    for file, scope in ((glob.glob(os.path.join(src, "**", "national_M2025_dl.xlsx"), recursive=True)[0], "nat"),
                        (glob.glob(os.path.join(src, "**", "state_M2025_dl.xlsx"), recursive=True)[0], "state")):
        ws = openpyxl.load_workbook(file, read_only=True).active
        rows = ws.iter_rows(values_only=True)
        idx = {h: i for i, h in enumerate(next(rows))}
        for r in rows:
            code = r[idx["OCC_CODE"]]
            if code not in socs:
                continue
            if scope == "nat" and (r[idx["I_GROUP"]] or "cross-industry") != "cross-industry":
                continue
            vals = [num(r[idx[c]]) for c in ("A_PCT10", "A_PCT25", "A_MEDIAN", "A_PCT75", "A_PCT90")]
            if vals[2] is None:
                continue
            filled = five(*vals, annual=True)
            us.setdefault(code, {})["US" if scope == "nat" else r[idx["PRIM_STATE"]]] = filled

    out = {
        "meta": {
            "ca": "Job Bank wages 2025 (ESDC, reference period 2023-2024)",
            "us": "U.S. Bureau of Labor Statistics OEWS, May 2025",
            "format": "[low, p25, median, p75, high] annual, hourly x 2080",
        },
        "ca": ca,
        "us": us,
    }
    json.dump(out, open(OUT, "w"), separators=(",", ":"), sort_keys=True)
    missing_ca = sorted(n[4:] for n in nocs if n[4:] not in ca)
    missing_us = sorted(s for s in socs if s not in us)
    print(f"wrote {OUT}: {os.path.getsize(OUT) // 1024} KB, {len(ca)} NOC, {len(us)} SOC")
    if missing_ca or missing_us:
        print("no data for:", missing_ca, missing_us)


PROVINCE_NAMES = {
    "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia",
    "Northwest Territories", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon Territory",
}

if __name__ == "__main__":
    main(sys.argv[1])
