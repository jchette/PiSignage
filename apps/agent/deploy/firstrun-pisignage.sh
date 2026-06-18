# ===========================================================================
# PiSignage auto-provision block — paste into the Raspberry Pi Imager-generated
# firstrun.sh on the boot partition, right AFTER the first line (#!/bin/bash).
#
# On first boot it installs + launches the PiSignage agent automatically (as the
# 'pi' user, once the network is up), then reboots into the kiosk. A pairing code
# appears on the TV on the second boot — claim it in the dashboard.
#
# Requirements (all satisfied by a normal Imager flash):
#   - username set to 'pi' with passwordless sudo (Imager's first user has this)
#   - Wi-Fi (or Ethernet) configured so first boot has network
# ===========================================================================
cat > /etc/systemd/system/pisignage-firstboot.service <<'UNIT'
[Unit]
Description=PiSignage first-boot install
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=pi
Environment=HOME=/home/pi
# Pull and run the standard installer (same one used by the manual one-liner).
ExecStart=/bin/bash -lc 'curl -fsSL https://raw.githubusercontent.com/jchette/PiSignage/main/apps/agent/deploy/install.sh | bash'
# Remove this one-shot unit and reboot into the autologin desktop + kiosk.
ExecStartPost=/bin/bash -c 'systemctl disable pisignage-firstboot.service; rm -f /etc/systemd/system/pisignage-firstboot.service; systemctl reboot'

[Install]
WantedBy=multi-user.target
UNIT
systemctl enable pisignage-firstboot.service
# ===========================================================================
