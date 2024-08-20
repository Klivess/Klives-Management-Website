export{KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI};

const KliveAPIUrl = "https://81.78.164.204:7777";

async function RequestGETFromKliveAPI(query: string, content = "") {
    return await $fetch(KliveAPIUrl+query, {method: "GET", body: content, });
}

async function RequestPOSTFromKliveAPI(query: string, content = "") {
    return Promise.resolve(fetch(KliveAPIUrl+query, {method: "POST", body: content, }));
}