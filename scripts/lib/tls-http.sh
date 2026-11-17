#!/bin/sh
# Read-only readiness requests may be retried after Docker/Nginx resets a connection.
# Keep certificate verification enabled. Buffer successful output to avoid duplicate partial bodies.
tls_http_get() (
    response=$(mktemp) || return "$?"
    trap 'rm -f -- "$response"' EXIT
    if curl --noproxy '*' --fail --silent --show-error \
        --connect-timeout 5 --max-time 10 \
        --retry "${KAIROS_HTTP_RETRIES:-10}" --retry-all-errors \
        --retry-delay 1 --retry-max-time 30 --output "$response" "$@"; then
        cat -- "$response"
    else
        result=$?
        return "$result"
    fi
)
