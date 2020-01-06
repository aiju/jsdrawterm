#include <u.h>
#include <libc.h>

#undef long
#undef ulong
#include <emscripten.h>

int
write(int fd, void *buf, int n)
{
	EM_ASM({console.log(UTF8ToString($0, $1))}, buf, n);
}
