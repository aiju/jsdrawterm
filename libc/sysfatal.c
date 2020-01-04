#include <u.h>
#include <libc.h>

#undef long
#include <emscripten.h>

static void
_sysfatalimpl(char *fmt, va_list arg)
{
	char buf[1024];

	vseprint(buf, buf+sizeof(buf), fmt, arg);
	EM_ASM({throw new Error(UTF8ToString($0))}, buf);
}

void (*_sysfatal)(char *fmt, va_list arg) = _sysfatalimpl;

void
sysfatal(char *fmt, ...)
{
	va_list arg;

	va_start(arg, fmt);
	(*_sysfatal)(fmt, arg);
	va_end(arg);
}
