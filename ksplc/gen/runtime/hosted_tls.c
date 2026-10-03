/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspls. */
/* ============================================================
 * TLS (delegating to OpenSSL by FFI, for std/tls.kspls), linked only with `make TLS=1`. KSPL_TLS
 * is a C preprocessor macro, apart from the KSPL side's #cfg(tls): the runtime is embedded in
 * every build, so with TLS=0 it must compile without libssl-dev. Client connections alone. The
 * verification is OpenSSL's default CA store plus a host name match (SSL_set1_host), at TLS 1.2
 * or above.
 * ============================================================ */
#ifdef KSPL_TLS
#include <openssl/err.h>
#include <openssl/ssl.h>

static int kspl_tls_inited = 0;
static void kspl_tls_ensure_init(void) {
    if (!kspl_tls_inited) {
        SSL_library_init();
        kspl_tls_inited = 1;
    }
}

/* Builds a verified TLS client context (returned with the default CA store loaded and the peer
 * certificate verification enabled). 0 on failure. */
I64 kspl_tls_client_ctx_new(void) {
    kspl_tls_ensure_init();
    SSL_CTX *ctx = SSL_CTX_new(TLS_client_method());
    if (ctx == NULL) return 0;
    SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, NULL);
    /* Caution: State the lower bound outright. TLS_client_method() allows 1.0 up, so otherwise
     * openssl.cnf's MinProtocol decides and a loose environment connects at 1.0/1.1. */
    if (SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION) != 1) {
        SSL_CTX_free(ctx);
        return 0;
    }
    if (SSL_CTX_set_default_verify_paths(ctx) != 1) {
        SSL_CTX_free(ctx);
        return 0;
    }
    return (I64)(intptr_t)ctx;
}

void kspl_tls_ctx_free(I64 ctx) {
    if (ctx == 0) return;
    SSL_CTX_free((SSL_CTX *)(intptr_t)ctx);
}

/* Assembles an SSL* for the SSL handshake on an already-connected TCP fd (including the SNI
 * setting and naming the host name to verify against). 0 on failure. */
I64 kspl_tls_new(I64 ctx, I32 fd, const U8 *hostname_ptr, Sz hostname_len) {
    if (ctx == 0) return 0;
    char host[256];
    /* A host name too long, or holding a NUL, is failed rather than cut: cut, verification would
     * pass for another host (no legitimate name exceeds DNS's 253 bytes). */
    if (!kspl_to_cstr(hostname_ptr, hostname_len, host, sizeof(host))) return 0;

    SSL *ssl = SSL_new((SSL_CTX *)(intptr_t)ctx);
    if (ssl == NULL) return 0;
    if (SSL_set_fd(ssl, fd) != 1) {
        SSL_free(ssl);
        return 0;
    }
    SSL_set_tlsext_host_name(ssl, host);
    if (SSL_set1_host(ssl, host) != 1) {
        SSL_free(ssl);
        return 0;
    }
    return (I64)(intptr_t)ssl;
}

/* The return value: 1 = success. 0 or below is SSL_connect's return value as it is (failure). */
I32 kspl_tls_connect(I64 ssl) {
    if (ssl == 0) return -1;
    return (I32)SSL_connect((SSL *)(intptr_t)ssl);
}

/* After a successful handshake, whether the chain plus host name verification passed. */
Bool kspl_tls_verify_ok(I64 ssl) {
    if (ssl == 0) return false;
    return SSL_get_verify_result((SSL *)(intptr_t)ssl) == X509_V_OK;
}

I32 kspl_tls_read(I64 ssl, U8 *buf, Sz cap) {
    if (ssl == 0) return -1;
    return (I32)SSL_read((SSL *)(intptr_t)ssl, buf, (int)cap);
}

I32 kspl_tls_write(I64 ssl, const U8 *buf, Sz len) {
    if (ssl == 0) return -1;
    return (I32)SSL_write((SSL *)(intptr_t)ssl, buf, (int)len);
}

/* Shuts down (trying to send a close_notify) and frees the SSL. */
void kspl_tls_free(I64 ssl) {
    if (ssl == 0) return;
    SSL *s = (SSL *)(intptr_t)ssl;
    SSL_shutdown(s);
    SSL_free(s);
}
#endif

