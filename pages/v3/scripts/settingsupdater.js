function GetSettings() {
    MakeRequest('/v1/CheckAdminPassword?p=' + getCookie('password')).then(response => {
        if (response != "PASS") {
            alert("You are not authorized to enter this page.");
            window.location.replace("main.html");
        }
        else {
            document.getElementById('body').style.visibility = "visible";
            MakeRequest('/settings/GetSettings').then(response => {
                let json = JSON.parse(response);
                let speakerscheck = document.getElementById("speakerscheck");
                let discordbotcheck = document.getElementById("discordbotcheck");
                let tumblrbotcheck = document.getElementById("tumblrbotcheck");
                let memescrapercheck = document.getElementById("memescrapercheck");
                let websitelogincheck = document.getElementById("websitelogincheck");
                let omnisciencecheck = document.getElementById("omnisciencecheck");
                let guestpasscheck = document.getElementById("guestpasscheck");
                let guestpassword = document.getElementById("guestpasspassword");
                speakerscheck.checked = json.SpeakersEnabled;
                discordbotcheck.checked = json.DiscordBotEnabled;
                tumblrbotcheck.checked = json.TumblrBotEnabled;
                memescrapercheck.checked = json.MemeScraperEnabled;
                websitelogincheck.checked = json.WebsiteLoginEnabled;
                omnisciencecheck.checked = json.OmniscienceEnabled;
                guestpasscheck.checked = json.GuestPassEnabled;
                if(json.GuestPassEnabled){
                    guestpassword.style.display="block";
                }
                else{
                    guestpassword.style.display="none";
                }
                guestpassword.value = json.GuestPassword;
            });
        }
    });
}

function SendFinalMessage() {
    alert("Don't betray me like this, I gave you my administrator password and you click this forbidden button? \n \nThis button is not to be pressed yet. There is a certain date in which this button will be unlocked.");
    LogOut();
}

function UpdateSettings() {
    MakeRequest('/settings/GetSettings').then(response => {
        let json = JSON.parse(response);
        let speakerscheck = document.getElementById("speakerscheck");
        let discordbotcheck = document.getElementById("discordbotcheck");
        let tumblrbotcheck = document.getElementById("tumblrbotcheck");
        let memescrapercheck = document.getElementById("memescrapercheck");
        let websitelogincheck = document.getElementById("websitelogincheck");
        let omnisciencecheck = document.getElementById("omnisciencecheck");
        let guestpasscheck = document.getElementById("guestpasscheck");
        let guestpassword = document.getElementById("guestpasspassword");
        json.SpeakersEnabled = speakerscheck.checked;
        json.DiscordBotEnabled = discordbotcheck.checked;
        json.TumblrBotEnabled = tumblrbotcheck.checked;
        json.MemeScraperEnabled = memescrapercheck.checked;
        json.WebsiteLoginEnabled = websitelogincheck.checked;
        json.OmniscienceEnabled = omnisciencecheck.checked;
        json.GuestPassEnabled = guestpasscheck.checked;
        if(json.GuestPassEnabled){
            guestpassword.style.display="block";
        }
        else{
            guestpassword.style.display="none";
        }
        json.GuestPassword = guestpassword.value;
        console.log(JSON.stringify(json));
        MakeRequest('/settings/UpdateSettings?json=' + JSON.stringify(json)).then(response => {
            console.log(response);
        });
    });
}