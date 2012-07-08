var consbuf = "";
var unread = "";
var backlog = "";
var online = [];
var onnote = [];

function
writeterminal(msg)
{
	var ta = document.getElementById("terminal");
	backlog += msg;
	ta.firstChild.nodeValue = backlog + consbuf;
	ta.scrollTop = ta.scrollHeight;
}

function
addchar(c)
{
	if(c == 13){
		consbuf += "\n";
		unread += consbuf;
		backlog += consbuf;
		consbuf = "";
		writeterminal("");
		while(unread != "" && online.length > 0)
			online.shift()(consbuf);
		return;
	}
	consbuf += String.fromCharCode(c);
	writeterminal("");
}

function
note(s)
{
	while(onnote.length > 0)
		onnote.shift()(s);
}

function
specialkey(c)
{
	if(c == 46){
		note("interrupt");
		return;
	}
	if(c == 8){
		consbuf = consbuf.substring(0, consbuf.length - 1);
		writeterminal("");
	}
}

function
readterminal(c, f, t)
{
	if(unread != ""){
		f(unread.substring(0, c));
		unread = unread.substring(c);
	} else {
		if(t != undefined){
			var l = online.length;
			onflush(t, function() { online.splice(l, 1); });
		}
		online.push(function() { readterminal(c, f); });
	}
}
