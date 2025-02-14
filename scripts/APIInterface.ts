
export { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, VerifyLogin };

const KliveAPIUrl = "https://klive.dev";

async function RequestGETFromKliveAPI(query: string) {
    const pass = GetLocalPassword();
    const response = await fetch(`${KliveAPIUrl}${query}`, {
        method: 'GET',
        mode: 'cors',
        headers: {
            'Authorization': pass,
        },
    });
    return response;
}
async function RequestPOSTFromKliveAPI(query: string, content = "") {
    const pass = GetLocalPassword();
    return Promise.resolve(fetch(KliveAPIUrl + query, {
        method: "POST",
        mode: 'cors',
        body: content,
        headers: {
            "Authorization": pass,
        }
    }));
}

function GetLocalPassword() {
    const cook = useCookie('password').value;
    return cook || "";
}

async function VerifyLogin() {
    var response = await RequestGETFromKliveAPI("/KMProfiles/LoginStatus");
    let json = await response.json();
    if(json == "ProfileDisabled") {
        window.location.replace('/');
        alert("Your profile has been disabled.");
    }
    else if(json == "ProfileNotFound") {
        window.location.replace('/');
        alert("You don't even have a profile or a password here, get out!!");
    }
}