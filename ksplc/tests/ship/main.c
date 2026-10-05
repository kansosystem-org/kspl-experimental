/* The C customer: one program linking the two libraries built from KSPL, through their headers.
 * With an argument it calls the function that panics, so the suite sees how a library stops. */
#include <stdio.h>
#include <string.h>

#include "count.h"
#include "greet.h"

int main(int argc, char **argv) {
    const char *text = "one two  three";
    Greet_point p = { 3, 4 };
    int64_t parsed = 0;
    int32_t bad;
    (void)argv;
    printf("host starts\n");
    if (greet_hello(2) != 16) return 1;
    if (greet_norm(p) != 5) return 2;
    if (count_words(text, (ptrdiff_t)strlen(text)) != 3) return 3;
    if (count_parse("1234", 4, &parsed) != 0 || parsed != 1234) return 4;
    bad = count_parse("12x", 3, &parsed);
    printf("host: parsed %lld, then code %d\n", (long long)parsed, (int)bad);
    if (bad != 1) return 5;
    printf("host: a write to a gone peer %s\n", greet_gone_peer(17690) == 1 ? "failed" : "did not fail");
    if (argc > 1) greet_stop();
    printf("host ends\n");
    return 0;
}
