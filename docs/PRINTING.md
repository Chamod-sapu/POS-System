# Thermal Printing & Hardware Configuration Guide

This guide explains how to configure thermal receipt printers, cash drawers, and continuous roll printing for **Wewala POS**.

---

## 1. Supported Thermal Hardware

Wewala POS supports standard 80mm and 58mm thermal receipt printers:

- **Epson POS**: TM-T88IV, TM-T88V, TM-T88VI, TM-T20II, TM-m30
- **Star Micronics**: TSP100, TSP143, TSP650II
- **Generic ESC/POS**: Xprinter (XP-80C, XP-N160II), POS-58, POS-80, Rongta, HPRT, Zjiang
- **Connection Interfaces**: USB, USB-to-Virtual COM (Serial), Ethernet/LAN, Bluetooth

---

## 2. Printer Driver Configuration (Windows & macOS)

### Windows Driver Setup

1. Open **Settings > Devices > Printers & Scanners**.
2. Select your thermal printer and click **Manage > Printing Preferences**.
3. **Paper Size**:
   - For 80mm printers, choose **`80mm x 297mm`** or **`80mm Continuous Roll`** (Do NOT leave on default `A4` or `Letter`).
   - For 58mm printers, choose **`58mm x 297mm`** or **`58mm Continuous Roll`**.
4. **Margins**: Set all margins (Left, Right, Top, Bottom) to **`0 mm`**.
5. **Cutter Settings**:
   - Cut Paper: Select **`Partial Cut`** or **`Cut at End of Document`**.
6. **Cash Drawer Settings**:
   - Under *Cash Drawer* or *Peripherals*, select **`Open Drawer: Before Printing`** or **`Open Drawer: After Printing`**.

### macOS Driver Setup

1. Open **System Settings > Printers & Scanners**.
2. Set default paper size to **`80mm Roll`** or create a Custom Paper Size:
   - Width: `80 mm` (or `3.15 in`)
   - Height: `297 mm` (or `11.69 in`)
   - Non-printable margins: `0 mm` on all sides.

---

## 3. Disabling Headers & Footers in Browser Print

By default, web browsers print URLs, page numbers, and dates at the corners of pages. To disable these:

1. Press `Ctrl + P` (or `Cmd + P`) in Chrome / Edge.
2. Expand **More Settings**.
3. Uncheck **Headers and Footers**.
4. Set **Margins** to **None** (or **Custom: 0mm**).
5. Ensure **Scale** is set to **100%** (or **Fit to printable area**).

---

## 4. Unattended Kiosk Printing (`--kiosk-printing`)

In a busy supermarket or grocery environment, cashier checkouts require instantaneous, silent printing without displaying the OS print confirmation dialogue.

### Setting up Chrome / Edge Kiosk Printing (Windows)

1. Right-click your Chrome or Edge desktop shortcut and select **Properties**.
2. In the **Target** field, append the flags at the end of the line:
   ```bash
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --kiosk "http://localhost:5173/pos"
   ```
   - `--kiosk-printing`: Automatically executes the print job using the system default printer without popping up the print dialogue.
   - `--kiosk` (optional): Opens Chrome in dedicated full-screen mode preventing accidental closure.
3. Set your 80mm thermal printer as the **Default Windows Printer**.
4. Click **Apply** and launch Wewala POS from this shortcut.

---

## 5. Direct ESC/POS Driverless Mode (Web Serial / WebUSB)

Wewala POS features a direct binary ESC/POS adapter that communicates directly with USB and Serial thermal printers via modern browser APIs:

1. In Wewala POS, navigate to **Settings > Thermal Receipt Printer Profile**.
2. Select **Direct ESC/POS (Web Serial / USB)**.
3. When completing a sale or clicking **Test Print Receipt**, the browser will prompt you to select the connected serial port or USB device once.
4. If the device disconnects or Web Serial is unsupported, Wewala POS automatically and gracefully falls back to the browser print service.

---

## 6. Cash Drawer Pulse (RJ11 / RJ12)

Standard POS cash drawers connect to the thermal printer's DK (Drawer Kick) port using a 6-pin RJ11 or RJ12 modular connector.

- **Pulse Sequence**: `ESC p 0 25 250` (Pin 2, 50ms ON, 500ms OFF).
- When **Automatic Cash Drawer Kick** is enabled under Settings:
  - If using **Direct ESC/POS**, Wewala POS sends the `ESC p` pulse directly on cash sales.
  - If using **Browser Print**, the drawer triggers automatically if configured in the Windows printer driver *Device Settings > Cash Drawer 1: Open Before Printing*.

---

## 7. Troubleshooting Matrix

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **Receipt feeds blank paper endlessly** | Driver paper size is set to standard page (A4/Letter) instead of continuous roll. | Open Windows Printing Preferences > Paper Size > Select `80mm Continuous` or `Roll Paper 80 x 297mm`. |
| **Header prints URL and date "localhost:5173"** | Browser headers and footers are enabled. | In Chrome print dialog > More settings > Uncheck `Headers and footers`. |
| **Barcode does not scan with 2D/1D scanner** | Barcode rendered too small or thermal head temperature too low. | Increase barcode bar width in settings or increase print darkness in printer utility (e.g. Epson TM Utility). |
| **Sinhala / Tamil characters appear as question marks** | Thermal printer firmware is set to English/Latin1 code page without graphics rasterizer. | Use the default **Browser Print Service**, which vectors all glyphs cleanly to the printer spooler. |
| **Cash drawer does not kick open** | Cable is unplugged or plugged into phone jack instead of printer DK port. | Ensure RJ11 cable is firmly connected to the printer's drawer kick port with matching 24V pinout. |
| **Red "Bill totals mismatch" banner** | Checksum verification detected arithmetic inconsistency down to 1 cent. | Check terminal audit logs. Printing is locked for safety. Hand manual receipt and contact manager. |
| **Web Serial prompt does not appear** | Browser permission blocked or non-HTTPS origin. | Ensure site is on `localhost` or HTTPS. Check Chrome settings: *Privacy and security > Site settings > Serial ports*. |

---

## 8. Paper Dimensions Reference

| Paper Width | Printable Width | Max Text Columns | Line Density | Recommended Usage |
| :--- | :--- | :--- | :--- | :--- |
| **80mm (Standard)** | 72 mm | **42 columns** (Font A) / **56** (Font B) | High | Standard retail counters, supermarkets |
| **58mm (Compact)** | 48 mm | **32 columns** (Font A) / **42** (Font B) | Medium | Mobile POS, handheld terminals, tight desks |
| **A4 (Tax Invoice)**| 180 mm | Full page layout | High | Wholesale customers, credit bills |

