# Provisioning a Pi for PiSignage

Two ways to set up a new Pi. Both end the same way: a pairing code appears on the
TV → claim it in the dashboard at
`https://pisignageserver-production.up.railway.app`.

Hardware: Raspberry Pi 5, **Raspberry Pi OS (64-bit, _with desktop_)**, plugged
into the TV (any HDMI port — CEC is auto-detected).

---

## Method 1 — One-line installer (manual)

Flash stock Raspberry Pi OS, boot to the desktop, get on the network, open a
**Terminal on the Pi**, and run:

```bash
curl -fsSL https://raw.githubusercontent.com/jchette/PiSignage/main/apps/agent/deploy/install.sh | bash
```

You'll be prompted for the sudo password (apt + autologin/linger). When it
finishes, **reboot once** (`sudo reboot`) so autologin + the transparent cursor
take effect. Best for a Pi that's already running, or for re-running to update.

---

## Method 2 — Flash-and-go (auto-install on first boot) — _simpler_

No SSH, no typing on the Pi. Raspberry Pi Imager does the OS + network setup, and
a small first-boot hook runs the installer for you.

1. **Raspberry Pi Imager** → choose Raspberry Pi OS (64-bit, with desktop) and
   your SD card.
2. Click the **gear / Edit Settings** and set:
   - **Username: `pi`** (required — the auto-install assumes it) + a password
   - **Wi-Fi** (SSID + password) — or skip if using Ethernet
   - **Enable SSH** (optional, handy for debugging)
   - Hostname (e.g. `pisignage-03`), locale/timezone
3. **Write** the image. When it finishes, leave the SD card in (or re-insert it) —
   your computer mounts the small **`bootfs`** partition.
4. On `bootfs`, open **`firstrun.sh`** in a text editor and paste the entire
   contents of [`apps/agent/deploy/firstrun-pisignage.sh`](apps/agent/deploy/firstrun-pisignage.sh)
   **right after the first line** (`#!/bin/bash`). Save.
5. Eject, put the card in the Pi, connect the TV + network, and power on.

First boot installs everything (a few minutes, headless) and reboots; the second
boot comes up in the kiosk and shows the **pairing code** on the TV. Claim it in
the dashboard and you're done.

> Why edit `firstrun.sh` instead of a pure-GUI option? Imager has no "run a
> script" field; `firstrun.sh` is the boot hook it already uses for your settings,
> so appending our block is the supported way to add a first-boot action.

---

### Notes
- Both methods converge on the **same installer**, so a Pi provisioned either way
  updates the same way: re-run the one-liner (Method 1).
- The first user on a Raspberry Pi OS image has **passwordless sudo**, which the
  first-boot service relies on. If you changed that, use Method 1 instead.
- CEC device, kiosk command, screen-blanking, and cursor are all handled
  automatically — no per-device configuration.
