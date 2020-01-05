ROOT=.

include ./Make.config

LIBS=\
	libauthsrv/libauthsrv.a\
	libmp/libmp.a\
	libc/libc.a\
	libsec/libsec.a\

default: $(TARG)
$(TARG): $(LIBS)
	$(CC) $(LDFLAGS) -o $(TARG) $(OFILES) $(LIBS) $(LDADD)

.PHONY: clean
clean:
	rm -f *.o */*.o */*.a *.a wasm.js wasm.wasm

.PHONY: libauthsrv/libauthsrv.a
libauthsrv/libauthsrv.a:
	(cd libauthsrv; $(MAKE))

.PHONY: libmp/libmp.a
libmp/libmp.a:
	(cd libmp; $(MAKE))

.PHONY: libc/libc.a
libc/libc.a:
	(cd libc; $(MAKE))

.PHONY: libsec/libsec.a
libsec/libsec.a:
	(cd libsec; $(MAKE))
