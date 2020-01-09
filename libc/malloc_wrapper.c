#include <u.h>
#include <libc.h>

#undef malloc
#undef free
#undef ulong
#undef long
#include <emscripten.h>

static char buf[65536];

void *
malloc0(size_t n)
{
	void *v;

	v = malloc(n);
	if(v == nil) return nil;
	emscripten_get_callstack(0, buf, sizeof(buf));
	EM_ASM(C.record_malloc($0, $1, UTF8ToString($2)), v, n, buf);
	return v;
}

void
free0(void *v)
{
	EM_ASM(C.record_free($0), v);
	return free(v);
}
