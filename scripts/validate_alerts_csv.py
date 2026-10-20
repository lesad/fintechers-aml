#!/usr/bin/env python3
"""Validates the FINREG alert CSV against the mandated format and, with --data, against the ČNB source data.

Usage: python3 scripts/validate_alerts_csv.py data/out/alerts-7.csv [--data data/raw/CNB]
       python3 scripts/validate_alerts_csv.py --self-test
Exits 1 when any check fails.
"""

import argparse
import collections
import csv
import json
import sys
import tempfile

HEADER = [
    "alert_id", "alert_type", "client_id", "transaction_id", "triage", "priority",
    "executive_role", "executive_person", "approver", "reason", "log",
]
TRIAGE = {"FP", "REVIEW"}
# Rule A and C are one alert per client, rule B one per transaction (the brief).
ONE_PER_CLIENT = {"A", "C"}


def read_source(data_dir):
    def rows(name):
        with open(f"{data_dir}/{name}", encoding="utf-8-sig", newline="") as f:
            return list(csv.reader(f, delimiter=";"))[1:]

    clients = {r[0]: r for r in rows("clients.csv")}
    tx_client = {r[0]: r[1] for r in rows("transactions.csv")}
    return clients, tx_client


def validate(path, source=None):
    errors, warnings = [], []
    csv.field_size_limit(sys.maxsize)
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header != HEADER:
            return [f"header is {header}, expected {HEADER}"], warnings, collections.Counter()
        rows = list(reader)

    seen_ids, per_client, per_tx = set(), collections.Counter(), collections.Counter()
    stats = collections.Counter()
    for n, row in enumerate(rows, start=2):
        def err(msg):
            errors.append(f"line {n}: {msg}")

        if len(row) != len(HEADER):
            err(f"{len(row)} fields, expected {len(HEADER)}")
            continue
        r = dict(zip(HEADER, row))
        stats[f"type {r['alert_type']}"] += 1
        stats[f"triage {r['triage']}"] += 1

        if not r["alert_id"].isdigit():
            err(f"alert_id {r['alert_id']!r} is not a positive integer")
        elif r["alert_id"] in seen_ids:
            err(f"alert_id {r['alert_id']} is duplicated")
        seen_ids.add(r["alert_id"])

        if r["alert_type"] not in {"A", "B", "C"}:
            warnings.append(f"line {n}: alert_type {r['alert_type']!r} is outside A/B/C")
        if not r["client_id"]:
            err("client_id is empty")
        if r["alert_type"] == "B" and not r["transaction_id"]:
            err("a type B alert has no transaction_id")
        if r["triage"] not in TRIAGE:
            err(f"triage {r['triage']!r} is not FP or REVIEW")
        try:
            if not 0 <= int(r["priority"]) <= 100:
                err(f"priority {r['priority']} is outside 0-100")
        except ValueError:
            err(f"priority {r['priority']!r} is not an integer")
        for col in ("executive_role", "executive_person", "approver"):
            if not r[col].strip():
                err(f"{col} is empty")
        if r["approver"] and r["approver"] == r["executive_person"]:
            err(f"four eyes broken: {r['approver']} is both executive and approver")
        if len(r["reason"].strip()) < 20:
            err(f"reason {r['reason']!r} is too short to justify a decision")
        try:
            json.loads(r["log"])
        except json.JSONDecodeError as e:
            err(f"log is not valid JSON: {e}")

        if r["alert_type"] in ONE_PER_CLIENT:
            per_client[(r["alert_type"], r["client_id"])] += 1
        else:
            per_tx[(r["alert_type"], r["transaction_id"])] += 1

        if source:
            clients, tx_client = source
            if r["client_id"] not in clients:
                err(f"client {r['client_id']} is not in clients.csv")
            if r["transaction_id"]:
                owner = tx_client.get(r["transaction_id"])
                if owner is None:
                    err(f"transaction {r['transaction_id']} is not in transactions.csv")
                elif owner != r["client_id"]:
                    err(f"transaction {r['transaction_id']} belongs to {owner}, not {r['client_id']}")
            client = clients.get(r["client_id"])
            if client and client[4] == "Y":
                stats[f"PEP approver {r['approver']}"] += 1

    errors += [f"{t}: client {c} has {k} alerts, expected one" for (t, c), k in per_client.items() if k > 1]
    errors += [f"{t}: transaction {x} has {k} alerts, expected one" for (t, x), k in per_tx.items() if k > 1]
    stats["rows"] = len(rows)
    return errors, warnings, stats


def self_test():
    good = [
        HEADER,
        ["1", "A", "K1", "T1", "FP", "10", "ANALYST", "J. Novák", "M. Svobodová", "AUTO_CLOSE, score 10: base score for A1.", "{}"],
        ["2", "B", "K1", "T2", "REVIEW", "70", "ANALYST", "J. Novák", "M. Svobodová", "REVIEW_HIGH, score 70: base score for B2.", '{"a":1}'],
    ]
    bad = good + [
        ["2", "A", "K1", "", "MAYBE", "101", "ANALYST", "X", "X", "OK", "not json"],
    ]
    for rows, expect_ok in ((good, True), (bad, False)):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8") as f:
            csv.writer(f).writerows(rows)
        errors, _, _ = validate(f.name)
        assert (not errors) == expect_ok, errors
    errors, _, _ = validate(f.name)
    for needle in ("duplicated", "not FP or REVIEW", "outside 0-100", "four eyes", "too short", "not valid JSON", "expected one"):
        assert any(needle in e for e in errors), f"missing check: {needle}"
    print("self-test ok")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", nargs="?")
    parser.add_argument("--data", help="folder with the ČNB clients.csv and transactions.csv")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if not args.csv:
        parser.error("pass a CSV path or --self-test")

    errors, warnings, stats = validate(args.csv, read_source(args.data) if args.data else None)
    for key in sorted(stats):
        print(f"{key}: {stats[key]}")
    for w in warnings[:20]:
        print("WARN", w)
    for e in errors[:50]:
        print("FAIL", e)
    print(f"{len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
