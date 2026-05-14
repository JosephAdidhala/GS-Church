from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from PyPDF2 import PdfReader

ROOT = Path(__file__).resolve().parent
PACKET_DIR = ROOT / "downloads" / "board-packets"
OUTPUT_PATH = ROOT / "data" / "board_packets_data.json"

CURRENCY_PATTERN = re.compile(r"\$\s?\d[\d,]*(?:\.\d{2})?")
DATE_PATTERNS = [
    re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})"),
    re.compile(r"(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})"),
]
MONTH_NAME_PATTERN = re.compile(
    r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})",
    re.IGNORECASE,
)
KEYWORDS = [
    "finance",
    "budget",
    "income",
    "expense",
    "expenses",
    "revenue",
    "cash",
    "balance",
    "giving",
    "offering",
    "donation",
    "loan",
    "mortgage",
]

# Financial extraction patterns
GIVING_PATTERN = re.compile(
    r"(was given|offering|donations?|givings?)\s+(?:in\s+)?(\w+),?\s*(\d+%?)\s+of\s+(?:budget|goal)",
    re.IGNORECASE,
)
BUDGET_VARIANCE_PATTERN = re.compile(
    r"(?:YTD|Budget)\s+(?:actual|variance)?\s*\$?([\d,]+)\s+.*?variance\s*\$?([\d,]+)\s*\(([+-]?\d+%)\)",
    re.IGNORECASE,
)
EXPENSE_PATTERN = re.compile(
    r"(?:Salaries?|Staff|Building|Utilities?|Maintenance|Missions?|Outreach|Program|Admin|Operations?|Facilities?|Staff)\s*\$?\s*([\d,]+)",
    re.IGNORECASE,
)


@dataclass
class FinancialData:
    giving_monthly: dict[str, float]
    giving_ytd: float | None
    budget_ytd: float | None
    actual_ytd: float | None
    variance_ytd: float | None
    top_expenses: list[tuple[str, float]]


@dataclass
class PacketSummary:
    file_name: str
    title: str
    meeting_date: str | None
    sent_date: str | None
    display_date: str | None
    timestamp_ms: int | None
    page_count: int
    currency_mentions: int
    top_amounts: list[float]
    keyword_counts: dict[str, int]
    finance_score: int
    financial_data: FinancialData


def clean_title_from_file_name(file_name: str) -> str:
    stem = file_name.rsplit(".", 1)[0]
    parts = stem.split("__")
    if len(parts) >= 3:
        return parts[1].replace("_", " ").strip()
    return stem.replace("_", " ").strip()


def parse_date_from_text(text: str) -> str | None:
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue

        month, day, year = match.groups()
        year = f"20{year}" if len(year) == 2 else year
        try:
            parsed = datetime(int(year), int(month), int(day))
            return parsed.date().isoformat()
        except ValueError:
            continue

    named_match = MONTH_NAME_PATTERN.search(text)
    if named_match:
        month_name, day, year = named_match.groups()
        try:
            parsed = datetime.strptime(f"{month_name} {day} {year}", "%B %d %Y")
            return parsed.date().isoformat()
        except ValueError:
            return None

    return None


def parse_date_from_filename(file_name: str) -> str | None:
    for pattern in DATE_PATTERNS:
        match = pattern.search(file_name)
        if not match:
            continue
        month, day, year = match.groups()
        year = f"20{year}" if len(year) == 2 else year
        try:
            parsed = datetime(int(year), int(month), int(day))
            return parsed.date().isoformat()
        except ValueError:
            continue
    return None


def extract_amounts(text: str) -> list[float]:
    values = []
    for token in CURRENCY_PATTERN.findall(text):
        raw = token.replace("$", "").replace(" ", "").replace(",", "")
        try:
            values.append(float(raw))
        except ValueError:
            continue
    return values


def extract_financial_data(text: str) -> FinancialData:
    giving_monthly = {}
    giving_ytd = None
    budget_ytd = None
    actual_ytd = None
    variance_ytd = None
    top_expenses = []

    # Extract monthly giving
    for match in GIVING_PATTERN.finditer(text):
        month = match.group(2).strip()
        amount_str = match.group(3).strip("%")
        try:
            giving_monthly[month] = float(amount_str)
        except ValueError:
            pass

    # Extract YTD giving
    ytd_match = re.search(
        r"(was given|giving).*?YTD,?\s*\$?([\d,]+)\s*(?:,\s*)?(\d+(?:\.\d)?%)\s+of\s+budget",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if ytd_match:
        try:
            giving_ytd = float(ytd_match.group(2).replace(",", ""))
        except ValueError:
            pass

    # Extract budget vs actual
    budget_match = re.search(
        r"YTD\s+[Aa]ctual\s*\$?([\d,]+)\s+vs\s+YTD\s+[Bb]udget\s*\$?([\d,]+),?\s*YTD\s+[Vv]ariance\s*\$?([\d,]+)",
        text,
    )
    if budget_match:
        try:
            actual_ytd = float(budget_match.group(1).replace(",", ""))
            budget_ytd = float(budget_match.group(2).replace(",", ""))
            variance_ytd = float(budget_match.group(3).replace(",", ""))
        except ValueError:
            pass

    # Extract expenses
    for match in EXPENSE_PATTERN.finditer(text):
        category = match.group(0).split("$")[0].strip()
        try:
            amount = float(match.group(1).replace(",", ""))
            top_expenses.append((category, amount))
        except ValueError:
            pass

    top_expenses = sorted(top_expenses, key=lambda x: x[1], reverse=True)[:5]

    return FinancialData(
        giving_monthly=giving_monthly,
        giving_ytd=giving_ytd,
        budget_ytd=budget_ytd,
        actual_ytd=actual_ytd,
        variance_ytd=variance_ytd,
        top_expenses=top_expenses,
    )


def summarize_packet(pdf_path: Path) -> PacketSummary:
    reader = PdfReader(str(pdf_path))
    page_text: list[str] = []

    for page in reader.pages:
        page_text.append(page.extract_text() or "")

    combined = "\n".join(page_text)
    lower = combined.lower()

    keyword_counter = Counter()
    for key in KEYWORDS:
        keyword_counter[key] = len(re.findall(rf"\b{re.escape(key)}\b", lower))

    amounts = extract_amounts(combined)
    top_amounts = sorted(amounts, reverse=True)[:5]

    timestamp_ms = None
    try:
        timestamp_ms = int(pdf_path.name.split("__", 1)[0])
    except (ValueError, IndexError):
        timestamp_ms = None

    date_guess = parse_date_from_filename(pdf_path.name) or parse_date_from_text(combined)

    sent_date = None
    if timestamp_ms is not None:
        sent_date = datetime.utcfromtimestamp(timestamp_ms / 1000).date().isoformat()

    display_date = date_guess or sent_date
    if date_guess and sent_date:
        try:
            meeting = datetime.fromisoformat(date_guess)
            sent = datetime.fromisoformat(sent_date)
            if abs((meeting - sent).days) > 60:
                display_date = sent_date
        except ValueError:
            display_date = sent_date

    finance_score = len(amounts) + sum(keyword_counter.values())

    financial_data = extract_financial_data(combined)

    return PacketSummary(
        file_name=pdf_path.name,
        title=clean_title_from_file_name(pdf_path.name),
        meeting_date=date_guess,
        sent_date=sent_date,
        display_date=display_date,
        timestamp_ms=timestamp_ms,
        page_count=len(reader.pages),
        currency_mentions=len(amounts),
        top_amounts=top_amounts,
        keyword_counts=dict(keyword_counter),
        finance_score=finance_score,
        financial_data=financial_data,
    )


def build_dashboard_payload(packets: list[PacketSummary]) -> dict[str, Any]:
    packets_sorted = sorted(
        packets,
        key=lambda p: (p.display_date or "9999-12-31", p.file_name),
    )

    total_pages = sum(p.page_count for p in packets_sorted)
    total_mentions = sum(p.currency_mentions for p in packets_sorted)

    finance_totals = Counter()
    for packet in packets_sorted:
        finance_totals.update(packet.keyword_counts)

    # Aggregate financial data
    all_giving_monthly = Counter()
    all_expenses = Counter()
    total_giving_ytd = 0.0
    total_budget_ytd = 0.0
    total_actual_ytd = 0.0
    total_variance_ytd = 0.0
    variance_count = 0

    for packet in packets_sorted:
        if packet.financial_data:
            for month, pct in packet.financial_data.giving_monthly.items():
                all_giving_monthly[month] += pct
            for category, amount in packet.financial_data.top_expenses:
                all_expenses[category] += amount
            if packet.financial_data.giving_ytd:
                total_giving_ytd += packet.financial_data.giving_ytd
            if packet.financial_data.budget_ytd:
                total_budget_ytd += packet.financial_data.budget_ytd
            if packet.financial_data.actual_ytd:
                total_actual_ytd += packet.financial_data.actual_ytd
            if packet.financial_data.variance_ytd:
                total_variance_ytd += packet.financial_data.variance_ytd
                variance_count += 1

    trend = [
        {
            "meeting_date": p.meeting_date,
            "sent_date": p.sent_date,
            "display_date": p.display_date,
            "title": p.title,
            "finance_score": p.finance_score,
            "currency_mentions": p.currency_mentions,
            "page_count": p.page_count,
            "giving_ytd": p.financial_data.giving_ytd,
            "budget_ytd": p.financial_data.budget_ytd,
            "actual_ytd": p.financial_data.actual_ytd,
            "variance_ytd": p.financial_data.variance_ytd,
        }
        for p in packets_sorted
    ]

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source_dir": str(PACKET_DIR),
        "summary": {
            "packet_count": len(packets_sorted),
            "total_pages": total_pages,
            "average_pages": round(total_pages / len(packets_sorted), 2) if packets_sorted else 0,
            "currency_mentions": total_mentions,
        },
        "financial_summary": {
            "total_giving_ytd": round(total_giving_ytd, 2),
            "total_budget_ytd": round(total_budget_ytd, 2),
            "total_actual_ytd": round(total_actual_ytd, 2),
            "average_variance_ytd": round(total_variance_ytd / variance_count, 2) if variance_count else 0,
        },
        "finance_keyword_totals": dict(finance_totals),
        "giving_monthly_averages": dict(all_giving_monthly),
        "top_expense_categories": dict(sorted(all_expenses.items(), key=lambda x: x[1], reverse=True)[:8]),
        "trend": trend,
        "packets": [
            {
                **{k: v for k, v in p.__dict__.items() if k != 'financial_data'},
                "financial_data": {
                    "giving_monthly": p.financial_data.giving_monthly,
                    "giving_ytd": p.financial_data.giving_ytd,
                    "budget_ytd": p.financial_data.budget_ytd,
                    "actual_ytd": p.financial_data.actual_ytd,
                    "variance_ytd": p.financial_data.variance_ytd,
                    "top_expenses": p.financial_data.top_expenses,
                },
            }
            for p in packets_sorted
        ],
    }


def main() -> None:
    if not PACKET_DIR.exists():
        raise FileNotFoundError(f"Packet directory not found: {PACKET_DIR}")

    pdfs = sorted(PACKET_DIR.glob("*.pdf"))
    if not pdfs:
        raise FileNotFoundError(f"No PDF files found in {PACKET_DIR}")

    summaries = [summarize_packet(pdf) for pdf in pdfs]
    payload = build_dashboard_payload(summaries)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Analyzed {len(summaries)} PDF packet(s).")
    print(f"Wrote professional dashboard data to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
