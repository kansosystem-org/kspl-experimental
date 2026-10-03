// ==========================================
// std/math's cfg(freestanding) side (a software implementation with zero dependencies) is called
// from this hosted C program and compared against a real libm, which the harness may use freely.
// The steps for building and running it have their one source in `make test-freestanding-math`
// (mk/test.mk).
// ==========================================
#include <stdio.h>
#include <math.h>
#include <string.h>

double probe_sqrt(double x);
double probe_exp(double x);
double probe_log(double x);
double probe_sin(double x);
double probe_cos(double x);
double probe_tan(double x);
double probe_pow(double a, double b);
// std/strfmt's formatting (its own implementation, not using libc's snprintf).
size_t probe_format_float(char* out, size_t cap, double v, int precision);
size_t probe_format_ptr(char* out, size_t cap, void* p);
size_t probe_exact_precision(void);

static int fails = 0;
// A relative error of 1e-9, well tighter than inference's F32 (~1e-7).
static const double kTol = 1e-9;

static double rel_err(double got, double want) {
    return fabs(want) > 1e-12 ? fabs(got - want) / fabs(want) : fabs(got - want);
}

static void check1(const char* name, double got, double want, double x) {
    double e = rel_err(got, want);
    if (e > kTol) {
        printf("FAIL %s(%.10g) got=%.17g want=%.17g rel_err=%.3g\n", name, x, got, want, e);
        fails++;
    }
}

static void check2(const char* name, double got, double want, double a, double b) {
    double e = rel_err(got, want);
    if (e > kTol) {
        printf("FAIL %s(%.10g,%.10g) got=%.17g want=%.17g rel_err=%.3g\n", name, a, b, got, want, e);
        fails++;
    }
}

// std/strfmt's equivalent of `%.*f` is compared **as a string** against a real libc's snprintf:
// a rounding one step out (ties to even: 0.5 under `%.0f` as "1" or "0") escapes a relative error.
static void check_float_format(void) {
    static const double vals[] = {
        0.0, -0.0, 1.0, -1.0, 0.5, -0.5, 1.5, 2.5, 3.5, 0.125, 0.375, 0.0625,
        42.0, -42.0, 3.14159265358979, 2.718281828459045, 1.0 / 3.0, 2.0 / 3.0,
        1e-7, 1e-3, 123456.789, 999999.9999, 0.999999999, 1e6, 1e15, 1e17,
        1.386294, 0.016988, 2.479055, -0.280846,
        // Integer parts past a U64, and both ends (the digits are multiple precision).
        1e18, 1e22, 1e23, 1e300, 1.7976931348623157e308, 5e-324, 2.2250738585072014e-308,
        0.1 + 0.2, 9.995, 0.045, 1.0e21, 123456789012345680000.0,
    };
    size_t pmax = probe_exact_precision();
    char got[512];
    char want[512];
    for (size_t i = 0; i < sizeof(vals) / sizeof(vals[0]); i++) {
        for (size_t p = 0; p <= pmax; p++) {
            size_t n = probe_format_float(got, sizeof(got) - 1, vals[i], (int)p);
            got[n] = 0;
            snprintf(want, sizeof(want), "%.*f", (int)p, vals[i]);
            if (strcmp(got, want) != 0) {
                printf("FAIL fmt %%.%zuf of %.17g: got=\"%s\" want=\"%s\"\n", p, vals[i], got, want);
                fails++;
            }
        }
    }
    // libc puts "nan"/"inf" out for NaN / Inf as well (a signed infinity is "-inf").
    struct { double v; const char* want; } specials[] = {
        { 1.0 / 0.0, "inf" }, { -1.0 / 0.0, "-inf" }, { 0.0 / 0.0, "nan" },
    };
    for (size_t i = 0; i < sizeof(specials) / sizeof(specials[0]); i++) {
        size_t n = probe_format_float(got, sizeof(got) - 1, specials[i].v, 6);
        got[n] = 0;
        if (strcmp(got, specials[i].want) != 0) {
            printf("FAIL fmt special: got=\"%s\" want=\"%s\"\n", got, specials[i].want);
            fails++;
        }
    }
}

// The host libc's `%p` differs per implementation (glibc, MSVC UCRT), so what is checked is **its
// own contract of "0x" plus lower-case hex**.
static void check_ptr_format(void) {
    char got[64];
    int dummy = 0;
    struct { void* p; const char* want; } cases[] = {
        { NULL, "0x0" }, { (void*)(size_t)0x1, "0x1" }, { (void*)(size_t)0xdeadbeef, "0xdeadbeef" },
        { (void*)(size_t)0x10, "0x10" },
    };
    for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
        size_t n = probe_format_ptr(got, sizeof(got) - 1, cases[i].p);
        got[n] = 0;
        if (strcmp(got, cases[i].want) != 0) {
            printf("FAIL ptr fmt: got=\"%s\" want=\"%s\"\n", got, cases[i].want);
            fails++;
        }
    }
    // A real pointer too must begin with "0x" and put out no character but hex.
    size_t n = probe_format_ptr(got, sizeof(got) - 1, &dummy);
    got[n] = 0;
    if (n < 3 || got[0] != '0' || got[1] != 'x') {
        printf("FAIL ptr fmt: real pointer produced \"%s\"\n", got);
        fails++;
    }
    for (size_t i = 2; i < n; i++) {
        if (!((got[i] >= '0' && got[i] <= '9') || (got[i] >= 'a' && got[i] <= 'f'))) {
            printf("FAIL ptr fmt: non-hex digit in \"%s\"\n", got);
            fails++;
            break;
        }
    }
}

int main(void) {
    // sqrt/exp/log/sin/cos/tan: sampled over a wide range including the boundaries
    // (sqrt_reduce's base-4 boundary, log's base-2 boundary, and around sin/cos's quadrant
    // boundaries).
    double xs[] = {
        0.0001,  0.1,     0.25,    0.5,     0.9999,  1.0,     1.0001,
        1.5,     2.0,     3.99999, 4.0,     4.00001, 7.5,     10.0,
        100.0,   1000.0,  1e6,     1e-6,    3.14159, 6.28318,
    };
    int n = (int)(sizeof(xs) / sizeof(xs[0]));
    for (int i = 0; i < n; i++) {
        double x = xs[i];
        check1("sqrt", probe_sqrt(x), sqrt(x), x);
        check1("exp", probe_exp(x), exp(x), x);
        check1("exp(-x)", probe_exp(-x), exp(-x), -x);
        check1("log", probe_log(x), log(x), x);
        check1("sin", probe_sin(x), sin(x), x);
        check1("cos", probe_cos(x), cos(x), x);
        check1("tan", probe_tan(x), tan(x), x);
        check1("sin(-x)", probe_sin(-x), sin(-x), -x);
        check1("cos(-x)", probe_cos(-x), cos(-x), -x);
    }

    // RoPE's practical range: position (0..4096) * theta^(-2i/d), theta=10000 (ksai's
    // default).
    for (int pos = 0; pos < 4096; pos += 137) {
        for (int i = 0; i < 8; i++) {
            double freq = pow(10000.0, -2.0 * i / 16.0);
            double angle = pos * freq;
            check1("sin(rope)", probe_sin(angle), sin(angle), angle);
            check1("cos(rope)", probe_cos(angle), cos(angle), angle);
        }
    }

    // pow: the base>0 range ksai's apply_rope uses (including negative and non-integer
    // exponents).
    double bases[] = {0.5, 1.0, 2.0, 10.0, 10000.0};
    double exps[] = {-2.0, -0.5, 0.0, 0.3333, 1.0, 2.5};
    for (size_t i = 0; i < sizeof(bases) / sizeof(bases[0]); i++) {
        for (size_t j = 0; j < sizeof(exps) / sizeof(exps[0]); j++) {
            check2("pow", probe_pow(bases[i], exps[j]), pow(bases[i], exps[j]), bases[i], exps[j]);
        }
    }

    check_float_format();
    check_ptr_format();

    if (fails == 0) {
        printf("RESULT: ALL PASS (freestanding std/math vs libm, rel_err < %.0e; std/str fmt vs snprintf)\n",
            kTol);
        return 0;
    }
    printf("RESULT: SOME FAILED (%d)\n", fails);
    return 1;
}
