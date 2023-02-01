let accountBeingMade = false;
let currentAccountID = "";

function LoadTumblrSocialPage() {
    LoadAllAccounts('allAccounts');
    LoadPostLog();
    LoadTumblrPostPackages();
}

function LoadTumblrPostPackages(){
    MakeRequest("/tumblr/GetAllPostPackages").then(resp => {
        let json = JSON.parse(resp);
        let grid = document.getElementById('postpackages');
        for (let index = 0; index < json.length; index++) {
            const element = json[index];
            let button = document.createElement('button');
            button.className="kbutton";
            button.innerHTML=element.package.Name;
            button.setAttribute('data', JSON.stringify(element));
            button.setAttribute('onclick', "LoadTumblrPostPackage(this.getAttribute('data'))");
            button.style.height="80px";
            grid.appendChild(button);
        }
        LoadTumblrPostPackage(JSON.stringify(json[0]));
    });
}

function LoadTumblrPostPackage(data){
    let json = JSON.parse(data);
    document.getElementById('postpkgName').innerHTML="Name: "+json.package.Name;
    document.getElementById('postpkgAccountsInUse').innerHTML="Amount Of Accounts In Use: "+json.AmountOfAccountsUsing;
    document.getElementById('postpkgVariety').innerHTML="Variety: "+json.PossibleVariaties+" possible posts.";
    document.getElementById('postpkgDescription').innerHTML="Description: "+json.package.Description;
    let button = document.getElementById('managePackage');
    button.innerHTML="Manage "+json.package.Name;
    button.setAttribute("href", "tumblrpostpackagemanagement.html?id="+json.package.ID);
}

function CreateNewPostPackage(){
    let container = document.createElement('div');
    container.style.width="400px";
    container.style.height="180px";
    container.style.gap="20px";
    container.style.padding="20px;"
    let name = document.createElement('input')
    name.className="kinput";
    name.placeholder="Name Of Post Package?";
    let description = document.createElement('input')
    description.className="kinput";
    description.placeholder='Description?';
    description.style.height="100px";
    description.style.marginTop="20px";
    container.appendChild(name);
    container.appendChild(description);
    swal({
        text: 'Create New Post Package',
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
            MakeRequest("/tumblr/CreateNewPostPackage?name="+name.value+
            "&description="+description.value).then(r => {
                if(r=="OK"){
                    swal("Complete!");
                }
                else{
                    swal("Error", r);
                }
            });
        }
    });
}

function LoadTumblrReachChart(canvas, allaccountsJson) {
    //add first accounts.
    let playerNames = [];
    let playerFollowers = [];
    let totalFollowers = document.getElementById("tumblrtotalFollowers");
    let totalamountoffollowers = 0;
    //foreach account in response, get total followers
    for (let i = 0; i < allaccountsJson.accountsAnalytics.length; i++) {
        let playerAccount = allaccountsJson.accountsAnalytics[i];
        playerFollowers.push(playerAccount.Followers);
        totalamountoffollowers = totalamountoffollowers + parseInt(playerAccount.Followers);
        playerNames.push(playerAccount.account.playerName);
    }
    totalFollowers.innerHTML = totalamountoffollowers + " total followers reached.";
    const ctx = document.getElementById(canvas).getContext('2d');
    const myChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: playerNames,
            datasets: [{
                label: '# Followers',
                data: playerFollowers,
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
}

function OnSocialsLoadTumblr() {
    console.log("Loaded");
    setTimeout(function () {
        let accountsRunning = document.getElementById("tumblramountOfAccounts");
        let postsMadeInLastHour = document.getElementById("tumblrpostsMadeInLastHour");
        let postsmadealltime = document.getElementById("tumblrpostsAllTime");
        let totalFollowers = document.getElementById("tumblrtotalFollowers");
        let tumblrtotalFollowersAverageDifference = document.getElementById("tumblrtotalFollowersAverageDifference");
        MakeRequest("/tumblr/GetAllTumblrAccountInformation").then(response => {
            let json = JSON.parse(response);
            LoadTumblrReachChart('tumblrFollowerChart', json);
            let accountsRunningAmount = 0;
            let accountsLoadedAmount = 0;
            accountsRunning.innerHTML = accountsRunningAmount + " accounts running. " + accountsLoadedAmount + " accounts loaded.";
            //foreach account in response
            for (let i = 0; i < json.accountsAnalytics.length; i++) {
                let account = json.accountsAnalytics[i];
                if (account.IsValid == true) {
                    console.log("Account " + account.playerName + " is valid");
                    accountsRunningAmount = accountsRunningAmount + 1;
                    accountsLoadedAmount = accountsLoadedAmount + 1;
                }
                else if (account.IsValid == false) {
                    console.log("Account " + account.playerName + " is not valid");
                    accountsLoadedAmount = accountsLoadedAmount + 1;
                }
                accountsRunning.innerHTML = accountsRunningAmount + " accounts running. " + accountsLoadedAmount + " accounts loaded.";
            }
            tumblrtotalFollowersAverageDifference.innerHTML = json.AverageTotalFollowerGain + " average total follower gain.";
            postsMadeInLastHour.innerHTML = "Couldn't get posts made in last hour.";
            MakeRequest("/tumblr/GetAllTumblrPostsMadeInHourRange?hours=12").then(response2 => {
                let json2 = JSON.parse(response2);
                postsMadeInLastHour.innerHTML = json2.length + " posts made in last 12 hours.";
            }), (error) => {
                postsMadeInLastHour.innerHTML = "Couldn't get posts made in last hour.";
            };
            MakeRequest("/tumblr/TumblrPostsLog").then(response3 => {
                let json2 = JSON.parse(response3);
                postsmadealltime.innerHTML = json2.length + " posts made all time.";
            }), (error) => {
                postsmadealltime.innerHTML = "Couldn't get posts made all time.";
            };
        });
    }, 10);
}

function LoadTumblrFollowerChart(canvas, accountStatisticJson) {
    Chart.helpers.each(Chart.instances, function (instance) {
        instance.destroy();
    });
    let json = JSON.parse(accountStatisticJson);
    let followers = [];
    let dates = [];
    let time = new Date();
    for (let i = 0; i < json.FollowersAnalytics.length; i++) {
        followers.push(json.FollowersAnalytics[i].Value)
        time = new Date(json.FollowersAnalytics[i].Key);
        dates.push(time.toLocaleString());
    }
    const ctx = document.getElementById(canvas).getContext('2d');
    const myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: "Followers",
                data: followers,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.2)',
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                ],
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
}
function LoadTumblrTotalFollowerChart(canvas) {
    MakeRequest("/tumblr/TumblrTotalFollowersAnalytics").then(response => {
        let json = JSON.parse(response);
        let followers = [];
        let dates = [];
        let time = new Date();
        for (let i = 0; i < json.length; i++) {
            followers.push(json[i].Value);
            time = new Date(json[i].Key);
            dates.push(time.toLocaleString());
        }
        const ctx = document.getElementById(canvas).getContext('2d');
        const myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: "Tumblr Total Followers",
                    data: followers,
                    backgroundColor: [
                        'rgba(72, 202, 228, 0.2)',
                    ],
                    borderColor: [
                        'rgba(72, 202, 228, 1)',
                    ],
                }]
            },
            options: {
                maintainAspectRatio: false,
            }
        });
    });
}

function RemakeDiscordChannels() {
    let ele = document.getElementById('remakechannels');
    if (ele) {
        ele.innerHTML = "Recreating...";
    }
    MakeRequest("/tumblr/RemakeDiscordChannels?accountID=" + currentAccountID.toString()).then(response => {
        if (response == "OK") {
            if (ele) {
                ele.innerHTML = "Recreating...";
            }
        }
        else {
            if (ele) {
                ele.innerHTML = "Error!";
            }
            swal("Error!", response);
        }
        // 3 second timeout
        setTimeout(function () {
            if (ele) {
                ele.innerHTML = "Remake Discord Channels";
            }
        }, 1500);
    });
}

function LoadAllAccounts(element) {
    //have to set timeout otherwise this shitty garbage fucking code refuses to work for some reason
    setTimeout(function () {
        //remove all elements in grid
        let grid = document.getElementById("allAccounts");
        while (grid.firstChild) {
            grid.removeChild(grid.firstChild);
        }
        MakeRequest("/tumblr/GetAllTumblrAccountInformation").then(response => {
            let json = JSON.parse(response);
            //create new element for each account in json array
            for (let i = 0; i < json.accountsAnalytics.length; i++) {
                let account = json.accountsAnalytics[i].account;
                if (json.accountsAnalytics[i].IsValid == true) {
                    let newElement = document.createElement("button");
                    newElement.className = "kbutton";
                    newElement.name = account.playerName;
                    newElement.setAttribute("isvalid", "true");
                    newElement.setAttribute("data", JSON.stringify(json.accountsAnalytics[i]));
                    newElement.id = "ACCOUNT" + account.playerName;
                    newElement.style = "height: 86px;"
                    newElement.innerHTML = account.playerName;
                    newElement.setAttribute('onclick', "LoadAccount('" + account.playerName + "')");
                    grid.appendChild(newElement);
                }
                else {
                    let newElement = document.createElement("button");
                    newElement.className = "kbutton";
                    newElement.name = account.playerName;
                    newElement.setAttribute("isvalid", "false");
                    newElement.setAttribute("data", JSON.stringify(json.accountsAnalytics[i]));
                    newElement.style = "border: 2px solid rgb(200, 0, 0); height: 130px;";
                    newElement.id = "ACCOUNT" + account.playerName;
                    newElement.innerHTML = account.playerName;
                    newElement.setAttribute('onclick', "LoadAccount('" + account.playerName + "')");
                    grid.appendChild(newElement);
                }
                if (grid.firstElementChild.id.startsWith("ACCOUNT")) {
                    LoadAccount(grid.firstElementChild.name);
                }
            }
        });
    }, 20);
}

function MakeNewTumblr() {
    if (accountBeingMade != true) {
        let name = document.getElementById("playerName").value;
        let consumerkey = document.getElementById("consumerKey").value;
        let consumersecret = document.getElementById("consumerSecret").value;
        let tokenPublic = document.getElementById("tokenPublic").value;
        let tokenSecret = document.getElementById("tokenSecret").value;
        let email = document.getElementById("email").value;
        let password = document.getElementById("password").value;
        let file = document.getElementById("imageZip").files[0];
        let buttontext = document.getElementById("submitButtonText");
        let pkgSelectedID = document.getElementById('postPackage').value;
        accountBeingMade = true;
        //upload file to server
        let formData = new FormData;
        formData.append("name", name);
        formData.append("consumerkey", consumerkey);
        formData.append("consumersecret", consumersecret);
        formData.append("tokenPublic", tokenPublic);
        formData.append("tokenSecret", tokenSecret);
        formData.append("email", email);
        formData.append("password", password);
        formData.append("postPackageID", pkgSelectedID);
        formData.append("file", file);
        var url = api + "/tumblr/MakeNewTumblrAccount";
        var xhr = new XMLHttpRequest();
        document.getElementById("uploadProgress").style.visibility = "visible";
        xhr.upload.addEventListener("progress", e => {
            var p = Math.floor(e.loaded / e.total * 100);
            document.getElementById("uploadProgress").style.width = p + "%";
            document.getElementById("uploadProgress").innerHTML = "<span>" + p + "%" + "</span>";
            if (p == 100) {
                buttontext.innerHTML = "Finalizing..";
            }
        })
        xhr.open("POST", url, true);
        xhr.send(formData);
        buttontext.innerHTML = "Submtting..";
        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4 && xhr.status == 200) {
                buttontext.innerHTML = "Created!";
                window.location.replace('tumblrsocial.html');
            }
            else {
                buttontext.innerHTML = "Failed. Error Code: " + xhr.status;
            }
            setTimeout(function () {
                buttontext.innerHTML = "Create!";
            }, 1500);
        }
    }
}

function LoadAccount(name) {
    try{
        let accountName = document.getElementById("accountName");
        let accountFollowers = document.getElementById("accountFollowers");
        let accountLink = document.getElementById("accountLink");
        let accountNextPost = document.getElementById("accountNextPost");
        let button = document.getElementById("accountManageButton");
        accountName.innerHTML = "Name: " + "Downloading data...";
        accountFollowers.innerHTML = "Followers: Downloading data...";
        accountLink.innerHTML = "Downloading data...";
        accountNextPost.innerHTML = "Next Post: Downloading data...";
        button.innerHTML = "<a>Downloading data for" + name + "</a>";
        if (document.getElementsByName(name)[0].getAttribute("isvalid") == "true") {
            let json = JSON.parse(document.getElementsByName(name)[0].getAttribute("data"));
            accountName.innerHTML = "Name: " + json.account.playerName;
            accountFollowers.innerHTML = "Followers: " + json.Followers;
            accountLink.href = json.BlogLinks[0];
            accountLink.innerHTML = "Go to Tumblr Page"
            var d = new Date(json.account.TimeUntilNextPost);
            accountNextPost.innerHTML = "Next Post: " + d.toLocaleString();
            button.innerHTML = "Manage " + name;
            button.setAttribute("href", "tumblraccountmanagement.html?name=" + name);
            LoadTumblrFollowerChart('accountFollowerGraph', document.getElementsByName(name)[0].getAttribute("data"));
        }
        else if (document.getElementsByName(name)[0].getAttribute("isvalid") == "false") {
            accountFollowers.innerHTML = "";
            accountName.innerHTML = "This is an invalid account, please make sure you have the correct key and secret.";
            accountImages.innerHTML = "";
            accountBlogMessages.innerHTML = "";
            button.innerHTML = "Delete " + name;
            button.style = "border: 2px solid rgb(200, 0, 0); color: rgb(200, 0, 0);'>";
            button.setAttribute("onclick", "RemoveTumblrAccount('" + name + "')");
        }
    }
    catch(err){
        console.error(err);
    }
}


function RemoveTumblrAccount(name, page) {
    swal("Are you sure you want to delete this tumblr account?", {
        buttons: {
            cancel: "No, what am I doing!!",
            gopost: {
                text: "Delete Account",
                value: "delete",
            },
        },
    }).then((value) => {
        if (value == "delete") {
            IsProfileAdmin(resp => {
                if(resp==true){
                    try {
                        MakeRequest("/tumblr/RemoveTumblrAccount?name=" + name).then(response => {
                            if (response != "OK") {
                                alert("An error occurred while trying to remove the account.");
                            }
                            else {
                                if (page == undefined) {
                                    LoadAllAccounts();
                                }
                                else if (page == "tumblrmanagement") {
                                    window.location.replace("tumblrsocial.html");
                                }
                            }
                        })
                    }
                    catch (err) {
                        alert(err.message);
                    }
                }
                else{
                    swal("Unauthorized!", unauthMessage)
                }
            })
        }
    });
}

function LoadPostLog() {
    MakeRequest("/tumblr/TumblrPostsLog").then(response => {
        let json = JSON.parse(response);
        json.reverse();
        let grid = document.getElementById('tumblrpostlogs');
        for (let i = 0; i < json.length; i++) {
            let item = json[i];
            let button = document.createElement("button");
            button.className = "kbutton";
            button.setAttribute("name", JSON.stringify(item));
            button.setAttribute("onclick", "LoadPostLogDetails(this.getAttribute('name'))");
            let date = new Date(item.timeMade);
            button.style = "height: 70px; color: yellow; font-size: 20px;";
            if (item.PostType == "0") {
                button.innerHTML = item.Account.playerName + " made an image post at " + date.toLocaleString();
            }
            else if (item.PostType == "1") {
                button.innerHTML = item.Account.playerName + " made an video post at " + date.toLocaleString();
            }
            else if (item.PostType == "2") {
                button.innerHTML = item.Account.playerName + " made an text post at " + date.toLocaleString();
            }
            grid.appendChild(button);
        }
    });
}

function LoadPostLogDetails(details) {
    let item = JSON.parse(details);
    swal("Account: " + item.Account.playerName + "\n\nCaption: " + item.Caption + "\n\nBody: " + item.Body + "\n\nAmount Of Hashtags: " + item.Hashtags.length, {
        buttons: {
            cancel: "OK",
            gopost: {
                text: "Go To Post",
                value: "gotopost",
            },
            delpost: {
                text: "Delete Post",
                value: "delpost",
            }
        },
    }).then((value) => {
        switch (value) {
            case "gotopost":
                window.location.href = "https://" + item.PostURL;
                break;
            case "delpost":
                DeleteTumblrPost(details);
                break;
        }
    })
}

function DeleteTumblrPost(postdata) {
    let data = JSON.parse(postdata);
    MakeRequest("/tumblr/DeleteTumblrPost?postID=" + data.PostID + "&playername=" + data.Account.playerName).then(response => {
        if (response == "OK") {
            swal("Post Deleted!");
            RemoveAllElementsInGrid('tumblrpostlogs');
            LoadPostLog();
        }
    });
}

function LoadData(textBox, data) {
    let ele = document.getElementById(textBox);
    let button = document.getElementById('saveButton');
    if (data == "caption") {
        MakeRequest("/tumblr/GetCaptions").then(response => {
            document.getElementById(textBox).value = response;
            button.setAttribute('name', 'caption');
        });
    }
    else if (data == "hashtags") {
        MakeRequest("/tumblr/GetHashtags").then(response => {
            document.getElementById(textBox).value = response;
            button.setAttribute('name', 'hashtags');
        });
    }
    else if (data == "plugs") {
        MakeRequest("/tumblr/GetPlugs").then(response => {
            document.getElementById(textBox).value = response;
            button.setAttribute('name', 'plugs');
        });
    }
    else if (data == "extrawords") {
        MakeRequest("/tumblr/GetExtraWords").then(response => {
            document.getElementById(textBox).value = response;
            button.setAttribute('name', 'extrawords');
        });
    }
}
function SaveData() {
    let ele = document.getElementById('contenttext');
    let button = document.getElementById('saveButton');
    button.innerHTML = "<a>Saving...</a>";
    let data = ele.value.replaceAll(/\r\n|\r|\n/g, "<br>").replaceAll("#", "%23");
    if (data == "") {
        data = "no-text";
    }
    if (button.getAttribute('name') == "caption") {
        MakeRequest("/tumblr/UpdateCaptions?t=" + data).then(response => {
            button.innerHTML = "<a>Saved</a>";
        });
    }
    else if (button.getAttribute('name') == "hashtags") {
        MakeRequest("/tumblr/UpdateHashtags?t=" + data).then(response => {
            button.innerHTML = "<a>Saved</a>";
        });
    }
    else if (button.getAttribute('name') == "plugs") {
        MakeRequest("/tumblr/UpdatePlugs?t=" + data).then(response => {
            button.innerHTML = "<a>Saved</a>";
        });
    }
    else if (button.getAttribute('name') == "extrawords") {
        MakeRequest("/tumblr/UpdateExtraWords?t=" + data).then(response => {
            button.innerHTML = "<a>Saved</a>";
        });
    }
    console.log(data);
    setTimeout(function () {
        button.innerHTML = '<a>SAVE</a>';
    }, 1000);
}

let isPhotoPost = false;

function GetTumblrManagementData() {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    let name = urlParams.get('name');
    MakeRequest("/tumblr/GetTumblrAccountInformation?accountName=" + name).then(response => {
        let json = JSON.parse(response);
        document.getElementById('playername').innerHTML = "Name: " + json.account.playerName;
        let date1 = new Date(json.account.TimeUntilNextPost);
        document.getElementById('playerdatadirectory').innerHTML = "Data Directory: " + json.account.playerDirectory;
        document.getElementById('playernextpost').innerHTML = "Next Post Time: " + date1.toLocaleString();
        document.getElementById('playerimagelikelihood').innerHTML = "AI Image Post Likelihood: " + json.account.percentageLikelyhoodToPhotoPost + "% | AI Text Post Likelihood: " + (100 - parseInt(json.account.percentageLikelyhoodToPhotoPost)) + "%";
        document.getElementById('playerbotmadeposts').innerHTML = "Amount of Bot Made Posts: " + json.BotMadePosts.length;
        let date = new Date(json.RegistrationDate);
        document.getElementById('playerregistrationdate').innerHTML = "Klives Management Registration Date: " + date.toLocaleString();
        document.getElementById('playerfollowers').innerHTML = "Followers: " + json.Followers;
        document.getElementById('playeramountofimages').innerHTML = "Amount Of Images: " + json.AmountOfImages;
        IsProfileAdmin().then(r=>{
            if(r==true){
                document.getElementById('playeremail').innerHTML = "Email: " + json.account.email;
                document.getElementById('playerpassword').innerHTML = "Password: " + json.account.password;
            }
            else{
                document.getElementById('playeremail').innerHTML = "Email: ************";
                document.getElementById('playerpassword').innerHTML = "Password: ******";
            }
        })
        document.getElementById('removeTumblrAccount').setAttribute("name", name);
        currentAccountID = json.account.playerID;
        MakeRequest("/tumblr/GetAllPostPackages").then(response => {
            let jsonPostPackage = JSON.parse(response);
            for (let index = 0; index < jsonPostPackage.length; index++) {
                const element = jsonPostPackage[index];
                var option = document.createElement('option');
                option.innerHTML=element.package.Name;
                option.value=element.package.ID;
                try{
                    if(element.package.ID==json.account.PostPackageID){
                        option.setAttribute("selected", "true");
                    }
                }
                catch(err){console.error(err)}
                document.getElementById('postPackage').appendChild(option);
            }
            if(json.account.PostPackageID==null){
                var option = document.createElement('option');
                option.innerHTML="";
                option.value="";
                option.setAttribute("selected", "true");
                document.getElementById('postPackage').appendChild(option);
            }
        });
        LoadTumblrFollowerChart('followergraph', response);
    });
}

function OnPostPackageSelectionChanged(){
    IsProfileAdmin().then(r=>{
        if(r==true){
            swal("Confirm",
            {
                text: "Are you sure you want to change this?", 
                buttons: {
                    cancel: "No.",
                    conf:{
                        text: "Yes.",
                        value: "confirm",
                        closeModal: false
                    }
                }
            }).then(resp =>{
                if(resp=="confirm"){
                    MakeRequest("/tumblr/ChangeTumblrAccountPostPackageID?tumblraccountID="+currentAccountID+"&pkgID="+document.getElementById('postPackage').value).then(resp =>{
                        if(resp=="OK"){
                            swal("Complete!");
                        }
                        else{
                            swal(resp);
                        }
                    });
                }
            });
        }
        else{
            swal("Unauthorized.");
        }
    })
}

function FlipPhotoAndImage() {
    isPhotoPost = !isPhotoPost;
    let item = document.getElementById('imageorphoto');
    if (isPhotoPost) {
        item.innerHTML = "Image Post";
    }
    else {
        item.innerHTML = "Text Post";
    }
}

function DownloadTumblrAccountImagePack(buttonID, accountid) {
    if (accountid == "" || accountid == "undefined") {
        accountid = currentAccountID;
    }
    if (buttonID != "undefined" && buttonID != "") {
        document.getElementById(buttonID).innerHTML = "Downloading... This could take a while."
    }
    let filename = accountid + "imagePack.zip"
    //make post request 
    let formData = new FormData;
    formData.append("accountID", currentAccountID);
    var url = api + "/tumblr/DownloadImagePack";
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
        if (buttonID != "undefined" && buttonID != "") {
            document.getElementById(buttonID).innerHTML = "Download Image Pack"
        }
    }
    xhr.send(formData);
}

function ScanAccountForNSFW() {
    let ele = document.getElementById('nsfwscan');
    ele.innerHTML = "Scanning...";
    MakeRequest("/tumblr/ScanAccountForNSFW?accountID=" + currentAccountID).then(response => {
        let json = JSON.parse(response);
        ele.innerHTML = "Scan Account Images for NSFW";
        swal("NSFW Scan Complete", "Account Name: " + json.accountName + "\nAmount of NSFW Images: " + json.amountNSFW + "\nAmount Remaining: " + json.amountRemaining);
    });
}