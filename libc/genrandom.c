#include <u.h>
#include <libc.h>

#undef long
#undef ulong
#include <emscripten.h>

void
genrandom(uchar *buf, int nbytes)
{
	EM_ASM({window.crypto.getRandomValues(HEAPU8.subarray($0, $1))}, buf, buf+nbytes);
}
