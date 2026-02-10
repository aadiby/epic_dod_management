#!/bin/sh
set -eu

CERT_DIR="/etc/nginx/certs"
CERT_FILE="${TLS_CERT_FILE:-$CERT_DIR/dev.crt}"
KEY_FILE="${TLS_KEY_FILE:-$CERT_DIR/dev.key}"
CERT_CN="${TLS_CERT_CN:-localhost}"
CERT_DAYS="${TLS_CERT_DAYS:-3650}"

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  echo "Generating self-signed TLS certificate for CN=$CERT_CN"
  openssl req \
    -x509 \
    -newkey rsa:2048 \
    -sha256 \
    -nodes \
    -days "$CERT_DAYS" \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=$CERT_CN"
fi
