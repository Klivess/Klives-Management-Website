
import { useCookie } from '#imports';

export { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, VerifyLogin, KMPermissions };

const KliveAPIUrl = "https://klive.dev";

enum DeniedRequestReason {
    NoProfile = 0,
    InvalidPassword = 1,
    TooLowClearance = 2,
    IncorrectHTTPMethod = 3,
    ProfileDisabled = 4
}

enum KMPermissions {
    Anybody = 0,
    Guest = 1,
    Manager = 2,
    Associate = 3,
    Admin = 4,
    Klives = 5
}

async function RequestGETFromKliveAPI(query: string, kickToDashboardIfUnauthorized = true) {
    const pass = GetLocalPassword();
    let response;
    response = await fetch(`${KliveAPIUrl}${query}`, {
        method: 'GET',
        mode: 'cors',
        headers: {
            'Authorization': pass,
        },
    });
    if (response.status == 401 && kickToDashboardIfUnauthorized) {
        alert("You are not authorized to do whatever you're doing right now.");
        window.location.replace('/dashboard');
    }
    return response;
}

async function RequestPOSTFromKliveAPI(query: string, content = "", kickToDashboardIfUnauthorized = true) {
    const pass = GetLocalPassword();
    let response;
    response = await fetch(KliveAPIUrl + query, {
        method: "POST",
        mode: 'cors',
        body: content,
        headers: {
            "Authorization": pass,
        }
    });
    if (response.status == 401 && kickToDashboardIfUnauthorized) {
        alert("You are not authorized to do whatever you're doing right now.");
        window.location.replace('/dashboard');
    }
    return response;
}

function GetLocalPassword() {
    const cook = useCookie('password').value;
    return cook || "";
}

async function VerifyLogin() {
    var response = await RequestGETFromKliveAPI("/KMProfiles/LoginStatus", false);
    let json = await response.json();
    if (json == "ProfileDisabled") {
        window.location.replace('/');
        alert("Your profile has been disabled.");
    }
    else if (json == "ProfileNotFound") {
        if (window.location.pathname != "/") {
            window.location.replace('/');
            alert("You don't even have a profile or a password here, get out!!");
        }
    }
}