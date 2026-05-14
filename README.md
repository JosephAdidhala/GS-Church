# Church

Starter project folder.

## Structure

- `index.html` - landing page
- `styles.css` - basic styles
- `app.js` - starter JavaScript
- `gmail_board_packet_downloader.py` - downloads Thom's board packet email attachments via Gmail API

## Gmail API downloader

1. Place Google OAuth desktop credentials file at `credentials.json` in this folder.
2. Install Python packages from `requirements.txt`.
3. Run the script:

```bash
python3 gmail_board_packet_downloader.py
```

On first run, a browser consent flow opens and stores `token.json` locally.

Downloads are saved into `downloads/board-packets`.
