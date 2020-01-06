#include <u.h>
#include <libc.h>
#include <draw.h>
#include <memdraw.h>

int
memimageflags(Memimage *i, int set, int clr)
{
	int r;

	r = i->flags;
	i->flags |= set;
	i->flags &= ~clr;
	return r;
}
