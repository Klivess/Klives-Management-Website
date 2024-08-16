export{KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI};

const KliveAPIUrl = "http://81.78.164.204:7777";

async function RequestGETFromKliveAPI(query: string, content = "") {
    return await $fetch(KliveAPIUrl+query, {method: "GET", body: content, mode: 'no-cors', });
}

async function RequestPOSTFromKliveAPI(query: string, content = "") {
    return await $fetch(KliveAPIUrl+query, {method: "POST", body: content, mode: 'no-cors', });
}