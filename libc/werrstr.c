#include <u.h>
#include <libc.h>

char errbuf[ERRMAX];

int
rerrstr(char *buf, uint n)
{
	utfecpy(buf, buf+n, errbuf);
	return utflen(buf);
}

void
werrstr(char *f, ...)
{
	va_list arg;

	va_start(arg, f);
	vsnprint(errbuf, sizeof errbuf, f, arg);
	va_end(arg);
}

