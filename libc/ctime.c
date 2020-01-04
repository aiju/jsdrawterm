/*
 * This routine converts time as follows.
 * The epoch is 0000 Jan 1 1970 GMT.
 * The argument time is in seconds since then.
 * The localtime(t) entry returns a pointer to an array
 * containing
 *
 *	seconds (0-59)
 *	minutes (0-59)
 *	hours (0-23)
 *	day of month (1-31)
 *	month (0-11)
 *	year-1970
 *	weekday (0-6, Sun is 0)
 *	day of the year
 *	daylight savings flag
 *
 * The routine gets the daylight savings time from the environment.
 *
 * asctime(tvec))
 * where tvec is produced by localtime
 * returns a ptr to a character string
 * that has the ascii time in the form
 *
 *	                            \\
 *	Thu Jan 01 00:00:00 GMT 1970n0
 *	012345678901234567890123456789
 *	0	  1	    2
 *
 * ctime(t) just calls localtime, then asctime.
 */

#include <u.h>
#include <libc.h>

static	char	dmsize[12] =
{
	31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
};

/*
 * The following table is used for 1974 and 1975 and
 * gives the day number of the first day after the Sunday of the
 * change.
 */

#define dysize _dysize	/* conflicts on unix */

static int
dysize(int y)
{

	if(y%4 == 0 && (y%100 != 0 || y%400 == 0))
		return 366;
	return 365;
}

Tm*
gmtime(long tim)
{
	int d0, d1;
	long hms, day;
	static Tm xtime;

	/*
	 * break initial number into days
	 */
	hms = tim % 86400L;
	day = tim / 86400L;
	if(hms < 0) {
		hms += 86400L;
		day -= 1;
	}

	/*
	 * generate hours:minutes:seconds
	 */
	xtime.sec = hms % 60;
	d1 = hms / 60;
	xtime.min = d1 % 60;
	d1 /= 60;
	xtime.hour = d1;

	/*
	 * day is the day number.
	 * generate day of the week.
	 * The addend is 4 mod 7 (1/1/1970 was Thursday)
	 */

	xtime.wday = (day + 7340036L) % 7;

	/*
	 * year number
	 */
	if(day >= 0)
		for(d1 = 1970; day >= dysize(d1); d1++)
			day -= dysize(d1);
	else
		for (d1 = 1970; day < 0; d1--)
			day += dysize(d1-1);
	xtime.year = d1-1900;
	xtime.yday = d0 = day;

	/*
	 * generate month
	 */

	if(dysize(d1) == 366)
		dmsize[1] = 29;
	for(d1 = 0; d0 >= dmsize[d1]; d1++)
		d0 -= dmsize[d1];
	dmsize[1] = 28;
	xtime.mday = d0 + 1;
	xtime.mon = d1;
	strcpy(xtime.zone, "GMT");
	return &xtime;
}

