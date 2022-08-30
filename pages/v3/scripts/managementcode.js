let api = "https://90.255.227.194:80";
let apistatus = true;
const unauthMessage = "Only Klives is authorized to perform this action.";

window.addEventListener('load', function () {
    // on website load
    let allInfoBoxes = document.getElementsByClassName("infobox");
    for (let i = 0; i < allInfoBoxes.length; i++) {
    }
    AutomaticAuthentication();
})
function createCookie(name, value, days) {
    var expires;
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toGMTString();
    }
    else {
        expires = "";
    }
    document.cookie = name + "=" + value + expires + "; path=/";
}

function ConstructCardIntoDiv(caption, imageURL, box){
    console.log(box);
    let movie = document.createElement('div');
    movie.className = "movieImage";
    let image = document.createElement("img");
    if (imageURL == "") {
        image.src = "images/noimage.png";
        image.style = "width: 150px; height: 175px; filter: invert();";
    }
    else {
        image.src = imageURL;
        image.style = "width: 150px; height: 175px;";
    }
    let divvy = document.createElement("div");
    divvy.appendChild(image);
    movie.appendChild(divvy);
    let text = document.createElement('span');
    text.style = "font-weight: bold; align-self: center; width: 200px; word-wrap: break-word; z-index: 3;";
    text.innerHTML = caption;
    movie.appendChild(text);
    let moviegrid = document.getElementById(box);
    moviegrid.appendChild(movie);
    return movie;
}

function SetPerformance() {
    UpdatePerformance();
    setInterval(function () {
        UpdatePerformance();
    }, 1500);
}

function AutomaticAuthentication() {
    Authentication();
    setInterval(() => {
        Authentication();
    }, 2000);
}

function DownloadFileFromServer(file, filename) {
    //make post request 
    let formData = new FormData;
    console.log(file.replace("\\", "/"));
    formData.append("filename", String.raw(file));
    var url = api + "/storage/DownloadFile";
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = 'blob';
    xhr.onload = function (res) {
        if (this.status === 200) {
            var type = xhr.getResponseHeader('Content-Type');
            var blob = new Blob([this.response], { type: type });
            if (typeof window.navigator.msSaveBlob !== 'undefined') {
                /*
                 * For IE
                 * >=IE10
                 */
                window.navigator.msSaveBlob(blob, filename);
            } else {
                /*
                 * For Non-IE (chrome, firefox)
                 */
                var URL = window.URL || window.webkitURL;
                var objectUrl = URL.createObjectURL(blob);
                if (filename) {
                    var a = document.createElement('a');
                    if (typeof a.download === 'undefined') {
                        window.location = objectUrl;
                    } else {
                        a.href = objectUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    }
                } else {
                    window.location = objectUrl;
                }
            }
        }
    }
    xhr.send(formData);
}

function getCookie(c_name) {
    if (document.cookie.length > 0) {
        c_start = document.cookie.indexOf(c_name + "=");
        if (c_start != -1) {
            c_start = c_start + c_name.length + 1;
            c_end = document.cookie.indexOf(";", c_start);
            if (c_end == -1) {
                c_end = document.cookie.length;
            }
            return unescape(document.cookie.substring(c_start, c_end));
        }
    }
    return "";
}

function ClearLogs() {
    MakeRequest("/v1/ClearLogs").then(response => {
        console.log(response);
    });
    LoadLogs();
}

function RemoveAllElementsInGrid(gridID) {
    //remove all elements in grid
    let grid = document.getElementById(grid);
    while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
    }
}

function Authentication() {
    try {
        let formData = new FormData;
        formData.append("p", getCookie("password"));
        var url = api + "/v1/CheckPassword";
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.status == 200 && xhr.readyState == 4) {
                if (xhr.response == "" || xhr.response == null || xhr.response == undefined) {
                    console.log(xhr.responseText);
                    alert("The API could not be reached.");
                    apistatus = false;
                    LogOut();
                }
                else {
                    console.log("API Online");
                }
                if (xhr.response == "PASS") {
                    apistatus = true;
                    if (document.readyState == "complete") {
                        document.body.style.visibility = "visible";
                    }
                    else {
                        window.onload = function () {
                            document.body.style.visibility = "visible";
                        };
                    }
                }
                else if (xhr.response == "DISABLED") {
                    alert("The owner of this website has disabled logins.");
                    apistatus = false;
                    LogOut();
                }
                else if (xhr.response == "NOENTRY") {
                    apistatus = false;
                    console.log('Not logged in >:(');
                    LogOut();
                }
            }
        };
        xhr.open("POST", url, true);
        xhr.send(formData);
    }
    catch (err) {
        alert(err);
        window.location.replace('../../index.html');
    }
}

function ImageSwitch() {
    document.getElementById('logo').setAttribute("src", "../../images/klivebot2.png");
}

function UpdatePerformance() {
    let cpuperformance = document.getElementById("cpuPerf");
    let ramperformance = document.getElementById("ramPerf");
    MakeRequest("/v1/metrics").then(response => {
        response = JSON.parse(response);
        cpuperformance.innerHTML = "CPU Usage: " + response.CPUPercent + "%";
        ramperformance.innerHTML = "RAM Usage: " + response.MemoryUsed + "%";
    });
}

function RestartServer(textToUpdate) {
    IsKliveAdmin().then(resp =>{
        if(resp==true){
            let ele = document.getElementById(textToUpdate);
            ele.innerHTML = "Restarting...";
            MakeRequest("/v1/RestartServer").then(response => {
                ele.innerHTML = "Restarted.";
                LogOut();
            });
        }
        else{
            swal("Unauthorized", unauthMessage);
        }
    })
}
function RestartBot(textToUpdate) {
    IsKliveAdmin().then(resp =>{
        if(resp==true){
            let ele = document.getElementById(textToUpdate);
            ele.innerHTML = "Restarting...";
            MakeRequest("/v1/RestartBot").then(response => {
                ele.innerHTML = "Restarted.";
                window.location.replace('../../index.html');
            }).then(r => {
                window.location.replace('../../index.html');
            });
        }
        else{
            swal("Unauthorized", unauthMessage);
        }
    })
}
function ShutdownServer(textToUpdate) {
    IsKliveAdmin().then(resp =>{
        if(resp==true){
            let ele = document.getElementById(textToUpdate);
            ele.innerHTML = "Shutting Down...";
            MakeRequest("/v1/ShutdownServer").then(response => {
                ele.innerHTML = "Shutdown.";
            }).then(r => {
                window.location.replace('../../index.html');
            });
        }
        else{
            swal("Unauthorized", unauthMessage);
        }
    })
}
function ShutdownBot(textToUpdate) {
    IsKliveAdmin().then(resp =>{
        if(resp==true){
            let ele = document.getElementById(textToUpdate);
            ele.innerHTML = "Shutting Down...";
            MakeRequest("/v1/TurnOffBot").then(response => {
                ele.innerHTML = "Shutdown.";
            }).then(r => {
                window.location.replace('../../index.html');
            });
        }
        else{
            swal("Unauthorized", unauthMessage);
        }
    })
}
function UpdateBot(textToUpdate) {
    IsKliveAdmin().then(resp =>{
        if(resp==true){
            let ele = document.getElementById(textToUpdate);
            ele.innerHTML = "Updating...";
            MakeRequest("/v1/UpdateBot").then(response => {
                ele.innerHTML = "Updated!";
            });
            window.location.replace('../../index.html');
        }
        else{
            swal("Unauthorized", unauthMessage);
        }
    })
}
function SendToSpeaker(speaker, textToUpdate) {
    let ele = document.getElementById(textToUpdate);
    let eleprev = ele.innerHTML;
    let ele2 = document.getElementById(speaker).value;
    ele.innerHTML = "Sending...";
    MakeRequest("/v1/Speaker?t=" + ele2).then(response => {
        if (response == "DISABLED") {
            ele.innerHTML = "Speaker Is Disabled.";
        }
        else {
            ele.innerHTML = "Sent.";
        }
        setTimeout(function () {
            ele.innerHTML = "Send To Speaker";
        }, 1000);
    });
}

async function IsKliveAdmin() {
    let isAdmin = false;
    await MakeRequest('/v1/IsKliveAdmin?password=' + getCookie('password')).then(response => {
        isAdmin=response=="PASS";
        console.log("Is admin?: "+isAdmin.toString());
    });
    return Promise.resolve(isAdmin);
}

function SendToKlives(speaker, textToUpdate) {
    let ele = document.getElementById(textToUpdate);
    let eleprev = ele.innerHTML;
    let ele2 = document.getElementById(speaker).value;
    ele.innerHTML = "Sending...";
    MakeRequest("/v1/SendMessageToKlive?message=" + ele2).then(response => {
        if (response == "DISABLED") {
            ele.innerHTML = "Messaging Is Disabled.";
        }
        else {
            ele.innerHTML = "Sent.";
        }
        setTimeout(function () {
            ele.innerHTML = "Send To Klives";
        }, 1000);
    });
}

function getRandomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function ColorLuminance(lum) {
    // validate hex string
    hex = getRandomColor();
    lum = lum || 0;

    // convert to decimal and change luminosity
    var rgb = "#", c, i;
    for (i = 0; i < 3; i++) {
        c = parseInt(hex.substr(i * 2, 2), 16);
        c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
        rgb += ("00" + c).substr(c.length);
    }

    return rgb;
}

function LoadMainPage() {
    IsKliveAdmin().then(r=>{
        if(r==true){
            setInterval(() => {
                document.getElementById('serverStreamIMG').setAttribute("src", api+"/storage/DownloadScreenshot?r="+Math.random(10));
            }, 1000);
        }
        else{
            document.getElementById('serverStream').remove();
        }
    })
    MakeRequest("/v1/GetKliveBotHealthInfo?logsAdded=false").then(response => {
        let json = JSON.parse(response);
        document.getElementById("botuptime").innerHTML = json.BotUptime.Hours + " hours " + json.BotUptime.Minutes + " minutes.";
        document.getElementById("botuptimeSeconds").innerHTML = "<br>" + json.BotUptime.Seconds + " seconds.";
        let seconds = json.BotUptime.Seconds;
        let minutes = json.BotUptime.Minutes;
        let hours = json.BotUptime.Hours;
        document.getElementById("logactions").innerHTML = (json.AmountOfTotalActions - json.AmountOfErrors) + " actions.";
        document.getElementById("logerrors").innerHTML = "<br>" + json.AmountOfErrors + " errors.";
        setInterval(() => {
            seconds += 1;
            if (seconds > 59) {
                seconds = 0;
                minutes += 1;
                document.getElementById("botuptime").innerHTML = hours + " hours " + minutes + " minutes.";
                document.getElementById("botuptimeSeconds").innerHTML = "<br>" + json.BotUptime.Seconds + " seconds.";
            }
            else {
                document.getElementById("botuptimeSeconds").innerHTML = "<br>" + seconds + " seconds.";
            }
            if (minutes > 59) {
                minutes = 0;
                seconds = 0;
                hours += 1;
                document.getElementById("botuptime").innerHTML = hours + " hours " + minutes + " minutes.";
            }
        }, 1000);
    })
    MakeRequest('/timemanagement/GetUndoneTasks').then(response => {
        let json = JSON.parse(response);
        json.reverse();
        for (let i = 0; i < json.length; i++) {
            let ele = document.getElementById('alltasks');
            let ele2 = document.createElement('button');
            ele2.className = "kbutton fadein";
            ele2.style = "height: 50px; font-size: 20px; text-transform: none; display: grid; grid-template-columns: 1fr 1fr 4fr;";
            let date = new Date(json[i].time);
            ele2.innerHTML = "<p class='special' style='font-size: small;'>" + date.toLocaleString() + "|</p><p class ='special' style='color: cyan;'>" + json[i].topic + "</p> <div>" + json[i].reason + "</div>";
            ele.appendChild(ele2);
        }
    });
    MakeRequest("/mscrape/MemeAnalytics").then(response => {
        let json = JSON.parse(response);
        document.getElementById('mscrapeMemesDownloaded').innerHTML = json.TotalAmountOfMemes + " total memes. (" + Math.round(parseFloat(json.VideoMemesInfo.FilesizeGB) + parseFloat(json.ImageMemesInfo.FilesizeGB)) + "GB)";
        document.getElementById('mscrapeTotalVideoMemes').innerHTML = json.VideoMemes.length + " total video memes. (" + Math.round(json.VideoMemesInfo.FilesizeGB) + "GB)";
        document.getElementById('mscrapeTotalImageMemes').innerHTML = json.ImageMemes.length + " total image memes. (" + Math.round(json.ImageMemesInfo.FilesizeMB) + "MB)";
        if (json.scrapes.length != 0) {
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML = json.scrapes[json.scrapes.length - 1].memesDownloaded + " memes downloaded last scrape.";
        }
        else {
            document.getElementById('mscrapeMemesDownloadedLastScrape').innerHTML = "Couldn't get memes downloaded last scrape.";
        }
    });
    MakeRequest("/KliveMovie/GetAllDownloadedMovies").then(response => {
        let json = JSON.parse(response);
        document.getElementById('klivesmoviesMovies').innerHTML = json.length + " movies in Klives Movies";
    });
    MakeRequest("/KliveMovie/GetOngoingMovieDownloads").then(response => {
        let json = JSON.parse(response);
        document.getElementById('klivesmoviesOngoingDownloads').innerHTML = json.length + " movies being downloaded.";
    });
    MakeRequest("/omniscience/GetOmniscienceAnalytics").then(response => {
        let json = JSON.parse(response);
        const ctx = document.getElementById('omniscienceMessageDistribution').getContext('2d');
        guildNames=[];
        guildValues=[];
        for (let index = 0; index < json.GuildMessageDistribution.length; index++) {
            const element = json.GuildMessageDistribution[index];
            guildNames.push(element.Key);
            guildValues.push(element.Value);
        }
        const graph = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: guildNames,
                datasets: [{
                    label: 'Guild Messages Distribution',
                    data: guildValues,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.2)',
                        'rgba(54, 162, 235, 0.2)',
                        'rgba(255, 206, 86, 0.2)',
                        'rgba(75, 192, 192, 0.2)',
                        'rgba(153, 102, 255, 0.2)',
                        'rgba(255, 159, 64, 0.2)',
                        'rgba(3, 29, 68, 0.2)',
                        'rgba(4, 57, 94, 0.2)',
                        'rgba(112, 162, 136, 0.2)',
                        'rgba(218, 183, 133, 0.2)',
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)',
                        'rgba(3, 29, 68, 1)',
                        'rgba(4, 57, 94, 1)',
                        'rgba(112, 162, 136, 1)',
                        'rgba(218, 183, 133, 1)',
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
        document.getElementById('omniscienceMessagesLogged').innerHTML=json.TotalMessagesLogged+" total messages logged.";
        document.getElementById('omniscienceGuildsBeingWatched').innerHTML=json.GuildsLogged.length+" guilds being watched.";
    });
}

//blahaj

function LogOut() {
    createCookie('password', '');
    window.location.replace('../../index.html');
}

async function MakeRequest(endpoint) {
    try {
        if (apistatus) {
            let response = await fetch(api + endpoint);
            let json = await response.text();
            return json;
        }
    }
    catch (ex) {
        throw ex;
    }
}

async function MakePostRequest(endpoint, data, override = false) {
    if (apistatus) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', api + endpoint);
        xhr.send(data);
        xhr.onload = () => {
            return xhr.response;
        };
    }
}
