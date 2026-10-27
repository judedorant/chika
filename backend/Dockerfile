# syntax=docker/dockerfile:1
# Development/CI runtime. Serve production through PHP-FPM behind a TLS proxy.
FROM composer:2
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      export SSL_CERT_FILE=/run/secrets/proxy_ca; \
    fi \
    && apk add --no-cache libpng-dev libjpeg-turbo-dev freetype-dev \
    && docker-php-ext-configure gd --with-jpeg --with-freetype \
    && docker-php-ext-install -j2 gd pdo_mysql pcntl
WORKDIR /app
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000", "--no-reload"]
