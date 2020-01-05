#include <u.h>
#include <libc.h>
#include <libsec.h>

void
p_sha256(uchar *buf, int nbuf, uchar *key, int nkey, uchar *label, int nlabel, uchar *seed, int nseed)
{
	uchar ai[SHA2_256dlen], tmp[SHA2_256dlen];
	SHAstate *s;
	int n;

	// generate a1
	s = hmac_sha2_256(label, nlabel, key, nkey, nil, nil);
	hmac_sha2_256(seed, nseed, key, nkey, ai, s);

	while(nbuf > 0) {
		s = hmac_sha2_256(ai, SHA2_256dlen, key, nkey, nil, nil);
		s = hmac_sha2_256(label, nlabel, key, nkey, nil, s);
		hmac_sha2_256(seed, nseed, key, nkey, tmp, s);
		n = SHA2_256dlen;
		if(n > nbuf)
			n = nbuf;
		memmove(buf, tmp, n);
		buf += n;
		nbuf -= n;
		hmac_sha2_256(ai, SHA2_256dlen, key, nkey, tmp, nil);
		memmove(ai, tmp, SHA2_256dlen);
	}
}