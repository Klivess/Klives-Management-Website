export{KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, VerifyLogin};

const KliveAPIUrl = "https://193.237.139.172:7777";

async function RequestGETFromKliveAPI(query: string) {
    return Promise.resolve(fetch(KliveAPIUrl+query, {method: "GET"}));
}

async function RequestPOSTFromKliveAPI(query: string, content = "") {
    return Promise.resolve(fetch(KliveAPIUrl+query, {method: "POST", body: content, }));
}

function GetLocalPassword(){
    const cook = useCookie('password').value;
    return cook;
}

async function VerifyLogin(){
    var response = await RequestGETFromKliveAPI("/KMProfiles/LoginStatus?password="+GetLocalPassword());
    if(response.status == 401){
        window.location.replace('/');
        alert("You've been logged out by Klives.");
    }
}