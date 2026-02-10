FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY app.conf.template /etc/nginx/templates/default.conf.template
COPY generate-cert.sh /docker-entrypoint.d/40-generate-cert.sh

RUN chmod +x /docker-entrypoint.d/40-generate-cert.sh
