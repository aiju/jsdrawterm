/* connect to cpu server, port 17019 */
var rcpu_url = "ws://localhost:1234";

/* connect to auth server, port 567 */
var auth_url = "ws://localhost:1235";

/* you can set the following items to undefined if you want them queried */

/* default user */
//var user = undefined;
var user = 'glenda';

/* default password */
//var password = undefined;
var password = localStorage.getItem('drawterm password');
