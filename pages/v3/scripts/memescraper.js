function OnSocialsLoadMScrape(){
    MakeRequest("/mscrape/memeanalytics").then(response => {
        let json = JSON.parse(response);
        document.getElementById('mscrapeTotalMemes').innerHTML=json.TotalAmountOfMemes+" total memes.";
        document.getElementById('mscrapeTotalVideoMemes').innerHTML=json.VideoMemes.length+" total video memes.";
        document.getElementById('mscrapeTotalImageMemes').innerHTML=json.ImageMemes.length+" total image memes.";
        if(json.scrapes.length!=0){
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML="";
            document.getElementById('mscrapeScrapesInLifetime').innerHTML=json.scrapes.length+" scrapes completed in lifetime.";
        }
        else{
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML="Couldn't get memes downloaded last scrape.";
            document.getElementById('mscrapeScrapesInLifetime').innerHTML=json.scrapes.length+" scrapes completed in lifetime.";
        }
    });
}

function OnManagementPageLoad(){
    MakeRequest("/mscrape/GetSources").then(response => {
        document.getElementById("mscrapeSources").value=response;
    });
    MakeRequest("/mscrape/MemeAnalytics").then(response => {
        let json = JSON.parse(response);
        let logs = document.getElementById('mscrapelogs');
        for(let i = 0; i<json.scrapes; i++){
            let scrape = json[i];
            let box = document.createElement('button');
            box.className="kbutton";
            box.style="height: 100px; font-size: 1vw;";
            let date = new Date(scrape.Date);
            box.innerHTML=scrapes.memesDownloaded +" downloaded on "+date.toLocaleString();
            logs.append(box);
        }
        document.getElementById('mscrapeTotalMemes').innerHTML=json.TotalAmountOfMemes+" total memes.";
        document.getElementById('mscrapeTotalVideoMemes').innerHTML=json.VideoMemes.length+" total video memes.";
        document.getElementById('mscrapeTotalImageMemes').innerHTML=json.ImageMemes.length+" total image memes.";
        if(json.scrapes.length!=0){
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML="";
            document.getElementById('mscrapeScrapesInLifetime').innerHTML=json.scrapes.length+" scrapes completed in lifetime.";
        }
        else{
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML="Couldn't get memes downloaded last scrape.";
            document.getElementById('mscrapeScrapesInLifetime').innerHTML=json.scrapes.length+" scrapes completed in lifetime.";
        }
    });
}

function SaveSourcesToAPI(){
    let button = document.getElementById('saveSourcesButton');
    button.innerHTML="Saving..."
    let data = document.getElementById("mscrapeSources").value.replaceAll(/\r\n|\r|\n/g, "<br>").replaceAll("#", "%23");
    MakeRequest("/mscrape/UpdateSources?t="+data).then(response => {
        button.innerHTML="Saved!";
        setInterval( function () {
            button.innerHTML="Save";
        }, 1500)
    });
}