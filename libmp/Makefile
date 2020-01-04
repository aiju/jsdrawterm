ROOT=..
include ../Make.config

LIB=libmp.a

OFILES=\
	betomp.$O\
	cnfield.$O\
	crt.$O\
	gmfield.$O\
	letomp.$O\
	mpadd.$O\
	mpaux.$O\
	mpcmp.$O\
	mpdigdiv.$O\
	mpdiv.$O\
	mpexp.$O\
	mpextendedgcd.$O\
	mpfactorial.$O\
	mpfield.$O\
	mpfmt.$O\
	mpinvert.$O\
	mpleft.$O\
	mplogic.$O\
	mpmod.$O\
	mpmodop.$O\
	mpmul.$O\
	mpnrand.$O\
	mprand.$O\
	mpright.$O\
	mpsel.$O\
	mpsub.$O\
	mptobe.$O\
	mptober.$O\
	mptoi.$O\
	mptole.$O\
	mptolel.$O\
	mptoui.$O\
	mptouv.$O\
	mptov.$O\
	mpvecadd.$O\
	mpveccmp.$O\
	mpvecdigmuladd.$O\
	mpvecsub.$O\
	mpvectscmp.$O\
	strtomp.$O

default: $(LIB)
$(LIB): $(OFILES)
	$(AR) r $(LIB) $(OFILES)
	$(RANLIB) $(LIB)

%.$O: %.c
	$(CC) $(CFLAGS) $*.c

