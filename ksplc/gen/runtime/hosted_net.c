/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspls. */
/* ============================================================
 * The TCP/UDP socket and asynchronous-I/O reactor primitives (for std/net.kspls and
 * std/reactor.kspls). Names and address letters both go through `getaddrinfo`, IPv4 and IPv6
 * alike. Like kspl_proc_*, a handle is opaque in an I64 (a raw fd could be 0, which means failure).
 *
 * Caution: **Only one body is written.** Winsock2 is shaped as a copy of POSIX's socket API, so
 * `socket` / `bind` / `listen` / `accept` / `connect` / `getpeername` / `setsockopt` /
 * `inet_pton` / `inet_ntop` have the same names. What differs is only the few points listed under
 * "the rephrasings per environment" below, so those are drawn together and the body is shared.
 * **Split into two, a fix lands on one side** and the other keeps the old behaviour in silence.
 *
 * Caution: **Only CI confirms the Windows side.** After a fix here, put both windows-ucrt64 and
 * windows-msvc through (Linux builds the POSIX side alone).
 * ============================================================ */

/* --- The rephrasings per environment. From here down only one body is written. --- */
#ifndef _WIN32
/* Caution: **Include what is used here.** Leaning on the joining order breaks with "an unknown
 * type" once a file placed before it is taken out (including a header twice is harmless). */
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <fcntl.h>
#include <errno.h>
#include <poll.h>
#include <unistd.h>

typedef int kspl_fd_t;
typedef socklen_t kspl_socklen_t;
typedef struct pollfd kspl_pollfd_t;
#define KSPL_BAD_FD (-1)
#define KSPL_POLL_IN POLLIN
#define KSPL_POLL_OUT POLLOUT
#define kspl_fd_bad(fd) ((fd) < 0)
#define kspl_net_closefd(fd) close(fd)
#define kspl_net_shutdown_wr(fd) shutdown((fd), SHUT_WR)
#define kspl_net_poll_call(p, n, t) poll((p), (nfds_t)(n), (t))
#define kspl_poll_failed(r) ((r) < 0)

/* POSIX needs no preparation for a socket. */
static int kspl_net_start(void) { return 1; }

static int kspl_net_set_nb(kspl_fd_t fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) return 0;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0;
}

/* Puts it back to the blocking shape.
   Caution: **Put a socket that finished connecting through here.** It is opened non-blocking,
 * so returned as is, the caller's read returns would_block without waiting. */
static int kspl_net_set_blk(kspl_fd_t fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) return 0;
    return fcntl(fd, F_SETFL, flags & ~O_NONBLOCK) == 0;
}

/* Whether the last send/recv/accept/connect failed merely because "it is not ready yet".
 * Caution: Call it right after the failed call, with no other system call in between. */
static int kspl_net_wouldblock(void) {
    return errno == EWOULDBLOCK || errno == EAGAIN || errno == EINPROGRESS;
}

/* The four that carry data take types differing per environment (POSIX a void pointer and a
 * size_t, Windows a char pointer and an int); absorbed here so the caller writes no cast. */
static I32 kspl_net_send(kspl_fd_t fd, const U8 *buf, Sz len) {
    return (I32)send(fd, buf, (size_t)len, 0);
}

static I32 kspl_net_recv(kspl_fd_t fd, U8 *buf, Sz cap) {
    return (I32)recv(fd, buf, (size_t)cap, 0);
}

static I32 kspl_net_sendto(kspl_fd_t fd, const U8 *buf, Sz len, struct sockaddr *addr,
    kspl_socklen_t addr_len) {
    return (I32)sendto(fd, buf, (size_t)len, 0, addr, addr_len);
}

static I32 kspl_net_recvfrom(kspl_fd_t fd, U8 *buf, Sz cap, struct sockaddr_storage *from) {
    kspl_socklen_t from_len = sizeof(*from);
    return (I32)recvfrom(fd, buf, (size_t)cap, 0, (struct sockaddr *)from, &from_len);
}

/* How a listening socket is opened. POSIX's `SO_REUSEADDR` only lets it attach past the
 * previous run's TIME_WAIT; it does not take a socket somebody else is listening on. */
static void kspl_net_claim_addr(kspl_fd_t fd) {
    int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&yes, sizeof(yes));
}
#else
#include <winsock2.h>
#include <ws2tcpip.h>

typedef SOCKET kspl_fd_t;
typedef int kspl_socklen_t;
typedef WSAPOLLFD kspl_pollfd_t;
#define KSPL_BAD_FD INVALID_SOCKET
#define KSPL_POLL_IN POLLRDNORM
#define KSPL_POLL_OUT POLLWRNORM
#define kspl_fd_bad(fd) ((fd) == INVALID_SOCKET)
#define kspl_net_closefd(fd) closesocket(fd)
#define kspl_net_shutdown_wr(fd) shutdown((fd), SD_SEND)
#define kspl_net_poll_call(p, n, t) WSAPoll((p), (ULONG)(n), (t))
#define kspl_poll_failed(r) ((r) == SOCKET_ERROR)

/* Caution: **Winsock has to be started before use**, or socket() fails; every function that makes a
 * socket goes through here first (later calls do nothing). */
static int kspl_net_start(void) {
    static int started = 0;
    if (!started) {
        WSADATA wsa;
        if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 0;
        started = 1;
    }
    return 1;
}

static int kspl_net_set_nb(kspl_fd_t fd) {
    u_long mode = 1;
    return ioctlsocket(fd, FIONBIO, &mode) == 0;
}

/* Puts it back to the blocking shape (the same role as the POSIX function of that name). */
static int kspl_net_set_blk(kspl_fd_t fd) {
    u_long mode = 0;
    return ioctlsocket(fd, FIONBIO, &mode) == 0;
}

static int kspl_net_wouldblock(void) {
    int e = WSAGetLastError();
    return e == WSAEWOULDBLOCK || e == WSAEINPROGRESS;
}

static I32 kspl_net_send(kspl_fd_t fd, const U8 *buf, Sz len) {
    return (I32)send(fd, (const char *)buf, (int)len, 0);
}

static I32 kspl_net_recv(kspl_fd_t fd, U8 *buf, Sz cap) {
    return (I32)recv(fd, (char *)buf, (int)cap, 0);
}

/* Caution: **Windows's `SO_REUSEADDR` differs from POSIX in meaning.** It lets a later socket cut
 * in on a socket somebody else is listening on, leaving undecided which one an arrival goes to. So
 * on Windows **`SO_EXCLUSIVEADDRUSE` is given**; the same name would share a socket on one OS only.
 * **The price:** re-attaching can fail until the previous run's connections close out.
 * **This one is taken even so** — waiting is visible, while a shared socket breaks in
 * silence: **only half the arrivals come**. */

static void kspl_net_claim_addr(kspl_fd_t fd) {
    int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (const char *)&yes, sizeof(yes));
}

static I32 kspl_net_sendto(kspl_fd_t fd, const U8 *buf, Sz len, struct sockaddr *addr,
    kspl_socklen_t addr_len) {
    return (I32)sendto(fd, (const char *)buf, (int)len, 0, addr, addr_len);
}

static I32 kspl_net_recvfrom(kspl_fd_t fd, U8 *buf, Sz cap, struct sockaddr_storage *from) {
    kspl_socklen_t from_len = sizeof(*from);
    return (I32)recvfrom(fd, (char *)buf, (int)cap, 0, (struct sockaddr *)from, &from_len);
}
#endif

/* --- From here down is the one body that does not mind the environment. --- */

typedef struct { kspl_fd_t fd; } kspl_socket_t;

/* The limit on the addresses tried.
   Caution: **One name can return any number of addresses**; without a limit, as many sockets are
 * opened as the partner's DNS returned. */
#define KSPL_ADDR_MAX 8

typedef struct {
    struct sockaddr_storage sa;
    kspl_socklen_t sa_len;
} kspl_cand_t;

static void kspl_set_port(struct sockaddr_storage *sa, I32 port) {
    if (sa->ss_family == AF_INET6) {
        ((struct sockaddr_in6 *)sa)->sin6_port = htons((uint16_t)port);
    } else {
        ((struct sockaddr_in *)sa)->sin_port = htons((uint16_t)port);
    }
}

/* Solves a name (or an address's letters) into a run of candidates. Returns 0 where it cannot be
 * solved. flags is `AI_PASSIVE` (we are the waiting side), `AI_NUMERICHOST` (do not look a name
 * up) or 0.
 *
 * Caution: **Do not break the order the resolver gave inside an address family.** It follows RFC
 * 6724 and the connectivity at hand; forcing "IPv6 first" misses once every time where IPv6 is
 * absent. The families are only interleaved from whichever came first (RFC 8305).
 *
 * **Do not attach `AI_ADDRCONFIG`.** It empties the answer in a loopback-only
 * environment. An unusable address family is dropped by std/net's overlapping attempts. */
static int kspl_resolve(const U8 *host_ptr, Sz host_len, I32 port, int socktype, int flags,
    kspl_cand_t *out) {
    char host[256];
    struct addrinfo hints;
    struct addrinfo *res;
    struct addrinfo *p;
    kspl_cand_t lead_fam[KSPL_ADDR_MAX];
    kspl_cand_t rest_fam[KSPL_ADDR_MAX];
    int nlead = 0;
    int nrest = 0;
    int n = 0;
    int lead = 0;
    int i;
    if (!kspl_net_start()) return 0;
    /* An empty string on the waiting side is IPv4's every interface (a string, since with the name
     * and service both NULL `getaddrinfo` returns EAI_NONAME).
     * Caution: **An empty string on the connecting side is refused here.** Linux answers "no such
     * name" but Windows returns **every address it holds**, so a program that forgot its
     * destination would connect to itself on Windows alone, in silence. */
    if (host_len == 0 && (flags & AI_PASSIVE) == 0) return 0;
    if (host_len == 0) {
        memcpy(host, "0.0.0.0", 8);
    } else if (!kspl_to_cstr(host_ptr, host_len, host, sizeof(host))) {
        return 0;
    }
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = socktype;
    hints.ai_flags = flags;
    if (getaddrinfo(host, NULL, &hints, &res) != 0) return 0;
    for (p = res; p != NULL; p = p->ai_next) {
        kspl_cand_t *slot;
        if (p->ai_family != AF_INET && p->ai_family != AF_INET6) continue;
        if (lead == 0) lead = p->ai_family;
        if (p->ai_family == lead) {
            if (nlead >= KSPL_ADDR_MAX) continue;
            slot = &lead_fam[nlead++];
        } else {
            if (nrest >= KSPL_ADDR_MAX) continue;
            slot = &rest_fam[nrest++];
        }
        memset(&slot->sa, 0, sizeof(slot->sa));
        memcpy(&slot->sa, p->ai_addr, (size_t)p->ai_addrlen);
        slot->sa_len = (kspl_socklen_t)p->ai_addrlen;
        kspl_set_port(&slot->sa, port);
    }
    freeaddrinfo(res);
    for (i = 0; (i < nlead || i < nrest) && n < KSPL_ADDR_MAX; i++) {
        if (i < nlead && n < KSPL_ADDR_MAX) out[n++] = lead_fam[i];
        if (i < nrest && n < KSPL_ADDR_MAX) out[n++] = rest_fam[i];
    }
    return n;
}

/* Opens a socket for one candidate. KSPL_BAD_FD where it cannot be opened (some environments do
 * not hold that address family).
 * Caution: **An IPv6 socket pins `IPV6_V6ONLY` to 1.** The default is 0 on Linux, 1 on Windows,
 * and fixed at 1 on OpenBSD, so waiting on `"::"` would take IPv4 guests in some environments
 * only. A program wanting both opens two sockets. */
static kspl_fd_t kspl_socket_for(kspl_cand_t *c, int type) {
    kspl_fd_t fd;
    if (!kspl_net_start()) return KSPL_BAD_FD;
    fd = socket((int)c->sa.ss_family, type, 0);
    if (kspl_fd_bad(fd)) return KSPL_BAD_FD;
    if (c->sa.ss_family == AF_INET6) {
        int only = 1;
        setsockopt(fd, IPPROTO_IPV6, IPV6_V6ONLY, (const char *)&only, sizeof(only));
    }
    return fd;
}

/* Writes the address as text and adds the port. 0 on success, -1 where it cannot be written.
 *
 * Caution: **Where it does not fit, refuse rather than truncate.** A truncated `2001:db8::1` is a
 * different address, `2001:db8:` (std/net checks the width first; this is a backstop). */
static int kspl_write_addr(struct sockaddr_storage *sa, U8 *host_out, Sz host_cap,
    Sz *host_len_out, I32 *port_out) {
    char ip[INET6_ADDRSTRLEN];
    void *a;
    int port;
    size_t ip_len;
    if (sa->ss_family == AF_INET6) {
        a = &((struct sockaddr_in6 *)sa)->sin6_addr;
        port = (int)ntohs(((struct sockaddr_in6 *)sa)->sin6_port);
    } else if (sa->ss_family == AF_INET) {
        a = &((struct sockaddr_in *)sa)->sin_addr;
        port = (int)ntohs(((struct sockaddr_in *)sa)->sin_port);
    } else {
        return -1;
    }
    if (inet_ntop((int)sa->ss_family, a, ip, sizeof(ip)) == NULL) return -1;
    ip_len = strlen(ip);
    if (ip_len > (size_t)host_cap) return -1;
    memcpy(host_out, ip, ip_len);
    * host_len_out = (Sz)ip_len;
    * port_out = (I32)port;
    return 0;
}

/* Wraps a raw fd in an opaque handle. Closes the fd and returns 0 where it cannot be wrapped. */
static I64 kspl_socket_wrap(kspl_fd_t fd) {
    kspl_socket_t *s = (kspl_socket_t *)malloc(sizeof(kspl_socket_t));
    if (s == NULL) {
        kspl_net_closefd(fd);
        return 0;
    }
    s->fd = fd;
    return (I64)(intptr_t)s;
}

static kspl_socket_t *kspl_socket_of(I64 handle) {
    return (kspl_socket_t *)(intptr_t)handle;
}

/* Whether a connection started non-blocking has finished connecting.
   Caution: **Do not settle it by `poll`'s answer alone.** Windows's `WSAPoll` does not report a
 * failed connection, so a timeout and a refusal look the same; `getpeername` passes only once
 * connected, so it decides. */
static int kspl_fd_connected(kspl_fd_t fd) {
    struct sockaddr_storage peer;
    kspl_socklen_t peer_len = sizeof(peer);
    return getpeername(fd, (struct sockaddr *)&peer, &peer_len) == 0;
}

/* Whether a connection started non-blocking is settled as refused. */
static int kspl_fd_refused(kspl_fd_t fd) {
    int err = 0;
    kspl_socklen_t len = sizeof(err);
    if (getsockopt(fd, SOL_SOCKET, SO_ERROR, (char *)&err, &len) != 0) return 1;
    return err != 0;
}

/* The return value: a handle, 0 = it cannot wait, -1 = the name does not solve to an address.
 * **The waiting side grasps one candidate only**, the one the resolver placed first; to choose a
 * family, write an address. */
I64 kspl_tcp_listen(const U8 *host_ptr, Sz host_len, I32 port, I32 backlog) {
    kspl_cand_t cands[KSPL_ADDR_MAX];
    kspl_fd_t fd;
    if (kspl_resolve(host_ptr, host_len, port, SOCK_STREAM, AI_PASSIVE, cands) == 0) return -1;
    fd = kspl_socket_for(&cands[0], SOCK_STREAM);
    if (kspl_fd_bad(fd)) return 0;
    kspl_net_claim_addr(fd);
    if (bind(fd, (struct sockaddr *)&cands[0].sa, cands[0].sa_len) != 0) {
        kspl_net_closefd(fd);
        return 0;
    }
    if (listen(fd, backlog) != 0) { kspl_net_closefd(fd); return 0; }
    return kspl_socket_wrap(fd);
}

I64 kspl_tcp_accept(I64 handle) {
    if (handle == 0) return 0;
    kspl_fd_t fd = accept(kspl_socket_of(handle)->fd, NULL, NULL);
    if (kspl_fd_bad(fd)) return 0;
    return kspl_socket_wrap(fd);
}

/* The connection partner's address. The output shape is the same as kspl_udp_recv_from's
 * from_host_out (the address as text + the port in host order). 0 on success, negative on
 * failure. */
I32 kspl_tcp_peer(I64 handle, U8 *host_out, Sz host_cap, Sz *host_len_out, I32 *port_out) {
    struct sockaddr_storage peer;
    kspl_socklen_t peer_len = sizeof(peer);
    if (handle == 0) return -1;
    memset(&peer, 0, sizeof(peer));
    if (getpeername(kspl_socket_of(handle)->fd, (struct sockaddr *)&peer, &peer_len) != 0) {
        return -1;
    }
    return kspl_write_addr(&peer, host_out, host_cap, host_len_out, port_out);
}

/* The longest address text kspl_net_resolve_all writes: an IPv6 address, `%` and its scope. */
#define KSPL_HOST_TEXT_MAX (INET6_ADDRSTRLEN + 1 + 64)

/* Solves a name into every candidate kspl_resolve keeps, in its order, each as address text with
 * its scope (`fe80::1%eth0`), so connecting to the text reaches the same socket address. Writes
 * texts[i * stride ..] and lens[i]; returns the count, -1 where the name does not solve, -2 where
 * the holder is short (fewer than KSPL_ADDR_MAX slots, or a text longer than stride), refused
 * rather than truncated. */
I32 kspl_net_resolve_all(const U8 *host_ptr, Sz host_len, U8 *texts, Sz stride, Sz *lens,
    Sz cap) {
    kspl_cand_t cands[KSPL_ADDR_MAX];
    char text[KSPL_HOST_TEXT_MAX];
    int n;
    int i;
    if (cap < KSPL_ADDR_MAX) return -2;
    n = kspl_resolve(host_ptr, host_len, 0, SOCK_STREAM, 0, cands);
    if (n == 0) return -1;
    for (i = 0; i < n; i++) {
        size_t len;
        if (getnameinfo((struct sockaddr *)&cands[i].sa, cands[i].sa_len, text, sizeof(text),
            NULL, 0, NI_NUMERICHOST) != 0) {
            return -1;
        }
        len = strlen(text);
        if ((Sz)len > stride) return -2;
        memcpy(texts + (Sz)i * stride, text, len);
        lens[i] = (Sz)len;
    }
    return (I32)n;
}

/* Solves a name into just one address string (the candidate the resolver placed first).
 * 0 = solved, -1 = it does not. */
I32 kspl_net_resolve(const U8 *host_ptr, Sz host_len, U8 *host_out, Sz host_cap,
    Sz *host_len_out) {
    kspl_cand_t cands[KSPL_ADDR_MAX];
    I32 port = 0;
    if (kspl_resolve(host_ptr, host_len, 0, SOCK_STREAM, 0, cands) == 0) return -1;
    return kspl_write_addr(&cands[0].sa, host_out, host_cap, host_len_out, &port);
}

I32 kspl_tcp_send(I64 handle, const U8 *buf, Sz len) {
    if (handle == 0) return -1;
    return kspl_net_send(kspl_socket_of(handle)->fd, buf, len);
}

I32 kspl_tcp_recv(I64 handle, U8 *buf, Sz cap) {
    if (handle == 0) return -1;
    return kspl_net_recv(kspl_socket_of(handle)->fd, buf, cap);
}

/* Closes a socket of either kind: TCP and UDP share kspl_socket_t. */
void kspl_tcp_close(I64 handle) {
    if (handle == 0) return;
    kspl_socket_t *s = kspl_socket_of(handle);
    kspl_net_closefd(s->fd);
    free(s);
}

/* The return value's meaning is the same as kspl_tcp_listen's (waiting, the candidate is one). */
I64 kspl_udp_open(const U8 *host_ptr, Sz host_len, I32 port) {
    kspl_cand_t cands[KSPL_ADDR_MAX];
    kspl_fd_t fd;
    if (kspl_resolve(host_ptr, host_len, port, SOCK_DGRAM, AI_PASSIVE, cands) == 0) return -1;
    fd = kspl_socket_for(&cands[0], SOCK_DGRAM);
    if (kspl_fd_bad(fd)) return 0;
    if (bind(fd, (struct sockaddr *)&cands[0].sa, cands[0].sa_len) != 0) {
        kspl_net_closefd(fd);
        return 0;
    }
    return kspl_socket_wrap(fd);
}

/* Caution: **The destination takes an address string alone** (`AI_NUMERICHOST`); a name would be
 * looked up per datagram at a cost the caller cannot see. Solve it once with `kspl_net_resolve`.
 * The return value: the bytes sent, -1 = it cannot send, -2 = not an address string. */
I32 kspl_udp_send_to(I64 handle, const U8 *buf, Sz len, const U8 *host_ptr, Sz host_len,
    I32 port) {
    kspl_cand_t cands[KSPL_ADDR_MAX];
    if (handle == 0) return -1;
    if (kspl_resolve(host_ptr, host_len, port, SOCK_DGRAM, AI_NUMERICHOST, cands) == 0) return -2;
    return kspl_net_sendto(kspl_socket_of(handle)->fd, buf, len,
        (struct sockaddr *)&cands[0].sa, cands[0].sa_len);
}

I32 kspl_udp_recv_from(I64 handle, U8 *buf, Sz cap, U8 *from_host_out, Sz from_host_cap,
    Sz *from_host_len_out, I32 *from_port_out) {
    struct sockaddr_storage from;
    I32 n;
    if (handle == 0) return -1;
    memset(&from, 0, sizeof(from));
    n = kspl_net_recvfrom(kspl_socket_of(handle)->fd, buf, cap, &from);
    if (n < 0) return -1;
    if (kspl_write_addr(&from, from_host_out, from_host_cap, from_host_len_out,
        from_port_out) != 0) {
        return -1;
    }
    return n;
}

/* ============================================================
 * The asynchronous-I/O reactor primitives (for std/reactor.kspls). TCP and UDP sockets share
 * kspl_socket_t{fd}, so non-blocking mode and polling work across both kinds. Opt-in; the
 * blocking API of std/net.kspls stays as it is.
 * ============================================================ */

Bool kspl_net_set_nonblocking(I64 handle) {
    if (handle == 0) return false;
    return kspl_net_set_nb(kspl_socket_of(handle)->fd) ? true : false;
}

/* Puts it back to blocking: std/net's connect hands the candidate that won back so. */
Bool kspl_net_set_blocking(I64 handle) {
    if (handle == 0) return false;
    return kspl_net_set_blk(kspl_socket_of(handle)->fd) ? true : false;
}

/* Whether the last send/recv/accept/connect failed merely because "it is not ready yet".
 * Caution: Call it right after the failed call, with no other system call in between. */
Bool kspl_net_would_block(void) {
    return kspl_net_wouldblock() ? true : false;
}

/* Looks at the read/write readiness of handles[0..n) together in one poll. interest[i] /
 * revents_out[i] are bit0 = readable, bit1 = writable, bit2 = unusable, bit3 = the partner closed
 * its sending side.
 * **The mark values must line up with `std/reactor.kspls`** (the matching is
 * `tests/support/conventions_win.kspls`). Returns the number of fds ready (0 = timeout, negative =
 * poll failed).
 * Caution: **Do not fold `POLLHUP` into `POLLERR`'s mark.** `WSAPoll` returns `POLLHUP` on a FIN
 * alone, where POSIX returns `POLLIN`; folded, Windows treats a half-closed connection as broken.
 * `events` takes `POLLIN` / `POLLOUT` alone (`WSAPoll` fails on `POLLHUP` in the input). */
I32 kspl_net_poll(I64 *handles, U8 *interest, Sz n, I32 timeout_ms, U8 *revents_out) {
    if (n == 0) return 0;
    kspl_pollfd_t *pfds = (kspl_pollfd_t *)malloc(sizeof(kspl_pollfd_t) * n);
    if (pfds == NULL) return -1;
    for (Sz i = 0; i < n; i++) {
        pfds[i].fd = (handles[i] == 0) ? KSPL_BAD_FD : kspl_socket_of(handles[i])->fd;
        short ev = 0;
        if (interest[i] & 0x1) ev |= KSPL_POLL_IN;
        if (interest[i] & 0x2) ev |= KSPL_POLL_OUT;
        pfds[i].events = ev;
        pfds[i].revents = 0;
    }
    int r = kspl_net_poll_call(pfds, n, timeout_ms);
    if (kspl_poll_failed(r)) { free(pfds); return -1; }
    for (Sz i = 0; i < n; i++) {
        U8 rv = 0;
        if (pfds[i].revents & KSPL_POLL_IN) rv |= 0x1;
        if (pfds[i].revents & KSPL_POLL_OUT) rv |= 0x2;
        if (pfds[i].revents & (POLLERR | POLLNVAL)) rv |= 0x4;
        if (pfds[i].revents & POLLHUP) rv |= 0x8;
        revents_out[i] = rv;
    }
    free(pfds);
    return (I32)r;
}

/* Starts a non-blocking TCP connection (returning the handle as it is, as a connecting handle,
 * even where connect() returned the EINPROGRESS equivalent). The caller must wait for
 * writable with kspl_net_poll and then confirm success or failure with kspl_net_connect_result.
 *
 * **One candidate alone is used** (the first one that starts), since moving on means waiting.
 * std/net's Tcp_stream.connect overlaps the candidates over this, one address text each. */
I64 kspl_tcp_connect_nonblocking(const U8 *host_ptr, Sz host_len, I32 port) {
    kspl_cand_t cands[KSPL_ADDR_MAX];
    int n = kspl_resolve(host_ptr, host_len, port, SOCK_STREAM, 0, cands);
    int i;
    if (n == 0) return -1;
    for (i = 0; i < n; i++) {
        kspl_fd_t fd = kspl_socket_for(&cands[i], SOCK_STREAM);
        if (kspl_fd_bad(fd)) continue;
        if (!kspl_net_set_nb(fd)) { kspl_net_closefd(fd); continue; }
        if (connect(fd, (struct sockaddr *)&cands[i].sa, cands[i].sa_len) != 0 &&
            !kspl_net_wouldblock()) {
            kspl_net_closefd(fd);
            continue;
        }
        return kspl_socket_wrap(fd);
    }
    return 0;
}

/* A non-blocking connection's success or failure. 1 = connected, -1 = failed, 0 = not settled
 * yet.
 * Caution: **Do not answer "it connected" merely because `SO_ERROR` is 0.** A socket just after
 * being started is 0 too, so it would answer "it connected" to a side that asked before waiting. */
I32 kspl_net_connect_result(I64 handle) {
    kspl_fd_t fd;
    if (handle == 0) return -1;
    fd = kspl_socket_of(handle)->fd;
    if (kspl_fd_connected(fd)) return 1;
    return kspl_fd_refused(fd) ? -1 : 0;
}

I32 kspl_net_raw_fd(I64 handle) {
    if (handle == 0) return -1;
    return (I32)kspl_socket_of(handle)->fd;
}

/* Closes the sending side alone to hand the partner an EOF. 0 = closed, -1 = it cannot be closed.
 *
 * Caution: **Do not declare `shutdown` in the caller.** Windows takes a 64-bit `SOCKET`, so
 * a KSPL `extern "C"` declaration conflicts with winsock2.h and **the compilation fails there
 * alone**; hence the wrapper.
 *
 * **Write the number by name too** (`SHUT_WR` and `SD_SEND`); equal today, they may drift.
 */


I32 kspl_net_shutdown_write(I64 handle) {
    if (handle == 0) return -1;
    return kspl_net_shutdown_wr(kspl_socket_of(handle)->fd) == 0 ? 0 : -1;
}
