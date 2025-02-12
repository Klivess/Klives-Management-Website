export { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, VerifyLogin };

const KliveAPIUrl = "https://klive.dev";

async function RequestGETFromKliveAPI(query: string): Promise<XMLHttpRequest> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', KliveAPIUrl+query, true);
        xhr.setRequestHeader('Authorization', GetLocalPassword() || "");
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    resolve(xhr);
                } else {
                    reject(new Error('Error: ' + xhr.statusText));
                }
            }
        };
        xhr.send();
    });
}

async function RequestPOSTFromKliveAPI(query: string, content = "") {
    let pass = GetLocalPassword();
    return Promise.resolve(fetch(KliveAPIUrl + query, {
        method: "POST",
        body: content,
    }));
}

function GetLocalPassword() {
    const cook = useCookie('password').value;
    return cook;
}

async function VerifyLogin() {
    var response = await RequestGETFromKliveAPI("/KMProfiles/LoginStatus?password=" + GetLocalPassword());
    if (response.status == 401) {
        window.location.replace('/');
        alert("You've been logged out by Klives.");
    }
}