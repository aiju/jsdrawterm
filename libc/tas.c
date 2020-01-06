#include <u.h>
#include <libc.h>

int
tas(int *p)
{
	int old;

	old = *p;
	*p = 1;
	return old;
}
