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
    let meme = api+"/mscrape/RandomImageMeme?r="+Math.Random;
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
    LoadAllMemeVideos();
}

function LoadAllMemeVideos(){
    MakeRequest("/mscrape/GetAllCompiledMemeVideos").then(response=>{
        let json = JSON.parse(response);
        for (let index = 0; index < json.length; index++) {
            const element = json[index];
            var leafname= element.split('\\').pop().split('/').pop();
            var video = ConstructCardIntoDiv(leafname, "", "compiledMemeComps");
            video.setAttribute("path", element);
            video.setAttribute("onclick", "SelectMemeVideo(this.getAttribute('path'))");

        }
    });
}

function SelectMemeVideo(path)
{
    var leafname= path.split('\\').pop().split('/').pop();
    MakeRequest('/storage/GetFileInfo?p=' + path).then(response3 => {
        let json = JSON.parse(response3);
        let contenttext = "File Name: " + leafname + "\nFilepath: " + leafname + "\n\n";
        //If Kilobyte
        if (json.FilesizeB > 1024 && json.FilesizeKB < 1024) {
            contenttext += "Filesize: " + Math.round(json.FilesizeKB) + "KB";
        }
        //If Megabyte
        else if (json.FilesizeKB >= 1024 && json.FilesizeMB < 1024) {
            contenttext += "Filesize: " + Math.round(json.FilesizeMB) + "MB";
        }
        //If Gigabyte
        else if (json.FilesizeMB >= 1024) {
            contenttext += "Filesize: " + Math.round(json.FilesizeGB) + "GB";
        }
        //If Bytes
        else {
            contenttext += "Filesize: " + Math.round(json.FilesizeB) + "B";
        }
        let uploaded = new Date(json.ModifiedDate);
        let created = new Date(json.CreationDate);
        contenttext += "\nUploaded: " + uploaded.toLocaleString() + "\nFile Created: " + created.toLocaleString();
        swal(contenttext, {
            buttons: {
                cancel: "OK",
                gopost: {
                    text: "Download File",
                    value: "download",
                },
                delpost: {
                    text: "Delete File",
                    value: "delete",
                },
                watchvideo: {
                    text: "Watch Video",
                    value: "watch",
                }
            },
        }).then((value) => {
            if (value == "download") {
                DownloadFile(path, leafname);
            }
            else if (value == "delete") {
                IsKliveAdmin().then(resp => {
                    if (resp == true) {
                        MakeRequest("/storage/DeleteFileInCloudStorage?p=" + file).then(response => {
                            RemoveAllElementsInGrid(compiledMemeComps);
                            LoadAllMemeVideos();
                        });
                    }
                    else {
                        swal("Unauthorized!", unauthMessage)
                    }
                })
            }
            else if (value == "watch") {
                window.open("viewvideo.html?videoPath=" + path);
            }
        });
    });
}

function CreateNewMemeVideo() {
    let amountOfMemes = 0;
    let maximumMemeDuration = 15;
    let memeVideoName = "";
    let container = document.createElement('div');
    container.style.width="400px";
    container.style.height="100px";
    container.style.gap="20px";
    container.style.padding="20px;"
    let amountOfVideosinput = document.createElement('input')
    amountOfVideosinput.className="kinput";
    amountOfVideosinput.placeholder="Amount Of Memes?";
    let MaximumSecondDurationinput = document.createElement('input')
    MaximumSecondDurationinput.className="kinput";
    MaximumSecondDurationinput.placeholder='Maximum second duration of each meme?';
    let nameOfVideoinput = document.createElement('input')
    nameOfVideoinput.className="kinput";
    nameOfVideoinput.placeholder='Name of meme video?';
    container.appendChild(amountOfVideosinput);
    container.appendChild(MaximumSecondDurationinput);
    container.appendChild(nameOfVideoinput);
    IsKliveAdmin().then(r=>{
        if(r==true){
            swal({
                text: 'Configure?',
                content: container,
                buttons: {
                    cancel: "Cancel",
                    next: {
                        text: "Next!",
                        closeModal: false,
                        value: "next",
                    }
                }
            }).then(result => {
                if(result=="next"){
                    MakeRequest("/mscrape/ConstructVideo?amountOfVideos="+amountOfVideosinput.value+
                    "&maximumVideoDuration="+MaximumSecondDurationinput.value+"&nameOfVideo="+nameOfVideoinput.value).then(r => {
                        if(r=="OK"){
                            swal("Complete!", "KliveBot will message you when the video creation is complete. Restarting the server will interrupt this video creation.");
                        }
                        else{
                            swal("Error", r);
                        }
                    });
                }
            });
        }
        else{
            swal("Unauthorized!", unauthMessage);
        }
    }) 
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