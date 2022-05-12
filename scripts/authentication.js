let kliveAPI = "https://90.255.227.194:80";

if (window.location.href.includes("mana")) {
    if (CheckLoginCookie() == false) {
        console.log('Not logged in, cheater!');
        //window.location.replace("../index.html");
    }
}
function autoInputPasswordFromCookie(id) {
    if (window.location.href.includes('index.html')) {
        console.log('Jesus christ, what was I smoking when I wrote all of this code');
        let password = getCookie("login");
        let cookie = CheckLoginCookie();
        if (CheckLoginCookie() == true) {
            console.log('Logged in, cheater!');
            document.getElementById(id).value = getCookie("login");
        }
        else {
            console.log(password);
            console.log(cookie);
            console.log(id);
            console.log(document.getElementById(id));
            document.getElementById(id).value = getCookie("login");
            console.log('Not logged in, cheater!');
        }
    }
}

function CreateLoginCookie(password) {
    setCookie("login", password, 1);
}

function CheckLoginCookie() {
    let user = getCookie("login");
    if (Login(user)) {
        return true;
    }
    else {
        return false;
    }
}

function Login(password) {
    fetch(kliveAPI + "/v1/CheckPassword?p=" + password)
        .then(res => res.text())
        .then((data) => {
            responsetext = data;
            console.log(responsetext);
            if (responsetext == "PASS") {
                console.log('Password accepted.')
                return true;
            }
            else if (responsetext == "NOENTRY") {
                console.log('Password refused.')
                return false;
            }
        })
        .catch(err => { throw err });
}

function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    let expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname) {
    let name = cname + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}