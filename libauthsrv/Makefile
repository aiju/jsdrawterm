ROOT=..
include ../Make.config
LIB=libauthsrv.a

OFILES=\
	authpak.$O\
	passtokey.$O\
	form1.$O\
	hkdf_x_plan9.$O\
#	_asgetticket.$O\
#	_asrdresp.$O\
#	convA2M.$O\
#	convM2A.$O\
#	convM2PR.$O\
#	convM2T.$O\
#	convM2TR.$O\
#	convPR2M.$O\
#	convT2M.$O\
#	convTR2M.$O\
#	nvcsum.$O\
#	readcons.$O\
#	_asgetpakkey.$O\
#	_asgetresp.$O\
#	_asrequest.$O\
	

default: $(LIB)
$(LIB): $(OFILES)
	$(AR) r $(LIB) $(OFILES)
	$(RANLIB) $(LIB)

authpak.$O:	msqrt.mpc edwards.mpc ed448.mpc decaf.mpc elligator2.mpc spake2ee.mpc

%.$O: %.c
	$(CC) $(CFLAGS) $*.c

