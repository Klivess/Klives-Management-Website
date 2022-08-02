function OnSocialsLoadMScrape(){
    MakeRequest("/mscrape/memeanalytics").then(response => {
        let json = JSON.parse(response);
        document.getElementById('mscrapeTotalMemes').innerHTML=json.TotalAmountOfMemes+" total memes. ("+Math.round(parseFloat(json.VideoMemesInfo.FilesizeGB)+parseFloat(json.ImageMemesInfo.FilesizeGB))+"GB)";
        document.getElementById('mscrapeTotalVideoMemes').innerHTML=json.VideoMemes.length+" total video memes. ("+Math.round(json.VideoMemesInfo.FilesizeGB)+"GB)";
        document.getElementById('mscrapeTotalImageMemes').innerHTML=json.ImageMemes.length+" total image memes. ("+Math.round(json.ImageMemesInfo.FilesizeMB)+"MB)";
        if(json.scrapes.length!=0){
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML=json.scrapes[json.scrapes.length-1].memesDownloaded+" memes downloaded last scrape.";
            document.getElementById('mscrapeScrapesInLifetime').innerHTML=json.scrapes.length+" scrapes completed in lifetime.";
        }
        else{
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML="Couldn't get memes downloaded last scrape.";
            document.getElementById('mscrapeScrapesInLifetime').innerHTML=json.scrapes.length+" scrapes completed in lifetime.";
        }
    });
}

function ViewRandomImageMeme(){
    let meme = api+"/mscrape/RandomImageMeme";
    swal("Your Random Meme", {
        icon: meme
    })
}

function OnManagementPageLoad(){
    MakeRequest("/mscrape/GetSources").then(response => {
        document.getElementById("mscrapeSources").value=response;
    });
    MakeRequest("/mscrape/MemeAnalytics").then(response => {
        let json = JSON.parse(response);
        let logs = document.getElementById('mscrapelogs');
        console.log(json.scrapes);
        json.scrapes.reverse();
        for(let i = 0; i<json.scrapes.length; i++){
            let scrape = json.scrapes[i];
            let box = document.createElement('button');
            box.className="kbutton";
            box.style="height: 60px; font-size: 1vw; color: cyan;";
            let date = new Date(scrape.Date);
            box.innerHTML=scrape.memesDownloaded +" memes downloaded on "+date.toLocaleString();
            logs.append(box);
        }
        document.getElementById('mscrapeTotalMemes').innerHTML=json.TotalAmountOfMemes+" total memes. ("+Math.round(parseFloat(json.VideoMemesInfo.FilesizeGB)+parseFloat(json.ImageMemesInfo.FilesizeGB))+"GB)";
        document.getElementById('mscrapeTotalVideoMemes').innerHTML=json.VideoMemes.length+" total video memes. ("+Math.round(json.VideoMemesInfo.FilesizeGB)+"GB)";
        document.getElementById('mscrapeTotalImageMemes').innerHTML=json.ImageMemes.length+" total image memes. ("+Math.round(json.ImageMemesInfo.FilesizeMB)+"MB)";
        if(json.scrapes.length!=0){
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML=json.scrapes[0].memesDownloaded+" memes downloaded last scrape.";
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