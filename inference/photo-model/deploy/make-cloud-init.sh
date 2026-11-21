#!/bin/bash
# Builds cloud-init.sh: ONE script the owner pastes into the Oracle "cloud-init script" box when creating the VM.
# It carries this folder's service files, so the VM needs no access to the (private) GitHub repo.
# Placeholders __HF_TOKEN__ and __PHOTO_MODEL_SECRET__ are filled by the owner, never by anyone else.
set -eu
cd "$(dirname "$0")/.."
OUT="${1:-cloud-init.sh}"
B64=$(tar czf - Dockerfile app.py core.py dump_labels.py check_build.py predict_case.py zones.py requirements.txt SOURCE.sha256 nonet | base64 -w0)
cat > "$OUT" <<SCRIPT
#!/bin/bash
# MRM photo-model service on an Oracle Always Free VM (Ubuntu, ARM or x86). Log: /var/log/mrm-setup.log
set -eu
exec > /var/log/mrm-setup.log 2>&1
HF_TOKEN='__HF_TOKEN__'          # read-only token for chunhee00/mrm-photo-model; revoke it at Hugging Face once this has finished
PHOTO_MODEL_SECRET='__PHOTO_MODEL_SECRET__'
DOMAIN='photo.autopilotclaim.com'
export DEBIAN_FRONTEND=noninteractive HF_TOKEN
case "\$HF_TOKEN\$PHOTO_MODEL_SECRET" in *__*) echo "placeholders not filled"; exit 1;; esac

# open 80/443 in the VM firewall (Oracle images block them by default)
iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
apt-get update -y && apt-get install -y iptables-persistent curl ca-certificates && netfilter-persistent save || true

curl -fsSL https://get.docker.com | sh
mkdir -p /opt/mrm/src && cd /opt/mrm
base64 -d <<'TAR' | tar xz -C src
$B64
TAR

SHA=\$(curl -fsS -H "Authorization: Bearer \$HF_TOKEN" https://huggingface.co/api/models/chunhee00/mrm-photo-model | python3 -c 'import sys,json;print(json.load(sys.stdin)["sha"])')
echo "model revision: \$SHA" > /opt/mrm/REVISION
DOCKER_BUILDKIT=1 docker build --build-arg HF_REVISION="\$SHA" --secret id=HF_TOKEN,env=HF_TOKEN -t photo-model src

umask 077
echo "PHOTO_MODEL_SECRET=\$PHOTO_MODEL_SECRET" > /opt/mrm/env
printf '%s {\n  reverse_proxy photo:7860\n}\n' "\$DOMAIN" > /opt/mrm/Caddyfile
docker network create mrm || true
docker rm -f photo caddy 2>/dev/null || true
docker run -d --name photo --restart always --network mrm --env-file /opt/mrm/env photo-model
docker run -d --name caddy --restart always --network mrm -p 80:80 -p 443:443 -v caddy_data:/data -v /opt/mrm/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2

# the token and secret must not stay in the instance's saved script
rm -f /var/lib/cloud/instance/user-data.txt /var/lib/cloud/instance/scripts/* /var/lib/cloud/instances/*/user-data.txt* 2>/dev/null || true
echo "DONE \$(date)"
SCRIPT
chmod +x "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
