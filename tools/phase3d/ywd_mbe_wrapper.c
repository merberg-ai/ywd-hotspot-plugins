#include <stdint.h>
#include <string.h>
#include "mbelib.h"

static mbe_parms cur_mp;
static mbe_parms prev_mp;
static mbe_parms prev_mp_enhanced;
static char ambe_bits[49];
static short pcm_out[160];
static int initialized = 0;

void ywd_mbe_reset(void)
{
    memset(ambe_bits, 0, sizeof(ambe_bits));
    memset(pcm_out, 0, sizeof(pcm_out));
    mbe_initMbeParms(&cur_mp, &prev_mp, &prev_mp_enhanced);
    initialized = 1;
}

uintptr_t ywd_mbe_bits_ptr(void)
{
    return (uintptr_t)ambe_bits;
}

uintptr_t ywd_mbe_pcm_ptr(void)
{
    return (uintptr_t)pcm_out;
}

int ywd_mbe_decode(void)
{
    int errs = 0;
    int errs2 = 0;
    char err_str[128];
    memset(err_str, 0, sizeof(err_str));
    if (!initialized)
        ywd_mbe_reset();

    mbe_processAmbe2450Data(
        pcm_out,
        &errs,
        &errs2,
        err_str,
        ambe_bits,
        &cur_mp,
        &prev_mp,
        &prev_mp_enhanced,
        3
    );
    return errs2;
}
