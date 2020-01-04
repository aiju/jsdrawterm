ROOT=..
include ../Make.config
LIB=libsec.a

OFILES=\
	aes.$O aesni.$O aesCBC.$O aesCFB.$O aesOFB.$O\
	aes_gcm.$O\
	aes_xts.$O\
	blowfish.$O\
	ccpoly.$O\
	chacha.$O chachablock.$O\
	curve25519.$O\
	curve25519_dh.$O\
	decodepem.$O\
	des.$O\
	des3CBC.$O\
	des3ECB.$O\
	desCBC.$O\
	desECB.$O\
	desmodes.$O\
	dh.$O\
	dsaalloc.$O\
	dsagen.$O\
	dsaprimes.$O\
	dsaprivtopub.$O\
	dsasign.$O\
	dsaverify.$O\
	ecc.$O\
	jacobian.$O\
	egalloc.$O\
	egdecrypt.$O\
	egencrypt.$O\
	eggen.$O\
	egprivtopub.$O\
	egsign.$O\
	egverify.$O\
	fastrand.$O\
	genprime.$O\
	genrandom.$O\
	gensafeprime.$O\
	genstrongprime.$O\
	hkdf.$O\
	hmac.$O\
	md4.$O\
	md5.$O\
	md5pickle.$O\
	nfastrand.$O\
	pbkdf2.$O\
	poly1305.$O\
	prng.$O\
	probably_prime.$O\
	rc4.$O\
	ripemd.$O\
	rsaalloc.$O\
	rsadecrypt.$O\
	rsaencrypt.$O\
	rsafill.$O\
	rsagen.$O\
	rsaprivtopub.$O\
	salsa.$O\
	scrypt.$O\
	secp256k1.$O\
	secp256r1.$O\
	secp384r1.$O\
	sha1.$O\
	sha1pickle.$O\
	sha2_128.$O\
	sha2_64.$O\
	sha1block.$O\
	sha2block128.$O\
	sha2block64.$O\
	smallprimes.$O\
	tsmemcmp.$O\
	tlshand.$O\
	x509.$O

default: $(LIB)
$(LIB): $(OFILES)
	$(AR) r $(LIB) $(OFILES)
	$(RANLIB) $(LIB)

%.$O: %.c
	$(CC) $(CFLAGS) $*.c

