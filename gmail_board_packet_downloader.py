from __future__ import annotations

import base64
import os
import re
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

ROOT = Path(__file__).resolve().parent
TOKEN_PATH = ROOT / "token.json"
CREDENTIALS_PATH = ROOT / "credentials.json"

QUERY = os.getenv(
    "GMAIL_QUERY",
    'from:thamilton@hamiltonedwards.com has:attachment ("board packet" OR boardpacket OR board-packet)',
)
DOWNLOAD_DIR = ROOT / os.getenv("DOWNLOAD_DIR", "downloads/board-packets")
MAX_MESSAGES = int(os.getenv("MAX_MESSAGES", "25"))


def sanitize_filename(name: str) -> str:
    name = re.sub(r"[<>:\"/\\|?*\x00-\x1F]", "_", name)
    return re.sub(r"\s+", " ", name).strip() or "attachment.bin"


def get_header(headers: list[dict[str, str]], key: str) -> str:
    for header in headers:
        if header.get("name", "").lower() == key.lower():
            return header.get("value", "")
    return ""


def collect_attachment_parts(part: dict[str, Any] | None, output: list[dict[str, Any]]) -> None:
    if not part:
        return

    filename = part.get("filename")
    body = part.get("body", {})
    if filename and body.get("attachmentId"):
        output.append(part)

    for child in part.get("parts", []) or []:
        collect_attachment_parts(child, output)


def authorize() -> Credentials:
    creds: Credentials | None = None

    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_PATH.exists():
                raise FileNotFoundError(
                    f"Missing {CREDENTIALS_PATH.name}. Download OAuth desktop credentials from Google Cloud and place it next to this script."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

        TOKEN_PATH.write_text(creds.to_json(), encoding="utf-8")

    return creds


def download_attachment(gmail: Any, message_id: str, part: dict[str, Any], prefix: str) -> Path | None:
    filename = sanitize_filename(part.get("filename") or "attachment.bin")
    attachment_id = part.get("body", {}).get("attachmentId")
    if not attachment_id:
        return None

    attachment = (
        gmail.users()
        .messages()
        .attachments()
        .get(userId="me", messageId=message_id, id=attachment_id)
        .execute()
    )

    raw_data = attachment.get("data")
    if not raw_data:
        return None

    payload = base64.urlsafe_b64decode(raw_data.encode("utf-8"))
    out_path = DOWNLOAD_DIR / f"{prefix}__{filename}"
    out_path.write_bytes(payload)
    return out_path


def main() -> None:
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    creds = authorize()
    gmail = build("gmail", "v1", credentials=creds)

    response = (
        gmail.users()
        .messages()
        .list(userId="me", q=QUERY, maxResults=MAX_MESSAGES)
        .execute()
    )
    messages = response.get("messages", [])

    if not messages:
        print("No matching emails found.")
        return

    downloaded: list[Path] = []

    for message in messages:
        message_id = message.get("id")
        if not message_id:
            continue

        full = gmail.users().messages().get(userId="me", id=message_id, format="full").execute()

        payload = full.get("payload", {})
        headers = payload.get("headers", [])
        subject = sanitize_filename(get_header(headers, "Subject") or "No Subject")
        stamp = full.get("internalDate") or "unknown"
        prefix = f"{stamp}__{subject}"

        parts: list[dict[str, Any]] = []
        collect_attachment_parts(payload, parts)

        for part in parts:
            saved = download_attachment(gmail, message_id, part, prefix)
            if saved:
                downloaded.append(saved)

    if not downloaded:
        print("Matched messages found, but no downloadable attachments were detected.")
        return

    print(f"Downloaded {len(downloaded)} attachment(s):")
    for path in downloaded:
        print(f"- {path}")


if __name__ == "__main__":
    main()
