let omnisciencedata = "";

function LoadOmniscience() {
    MakeRequest('/omniscience/AllParanoiaLogs').then(response => {
        omnisciencedata = JSON.parse(response);
        //reverse json array
        omnisciencedata.reverse();
        for (let i = 0; i < omnisciencedata.length; i++) {
            let items = omnisciencedata[i];
            let mentions = document.getElementById('omnisciencementions');
            let box = document.createElement('button');
            box.className = "kbutton";
            box.style = "height: 70px; font-size: large; color: white;";
            box.setAttribute("name", i);
            if (items.paranoiaType == "0") {
                box.innerHTML = items.AuthorName + " mentioned you at " + items.DateString;
            }
            else if (items.paranoiaType == "1") {
                box.innerHTML = items.AuthorName + " mentioned a related word at " + items.DateString;
            }
            box.setAttribute("onclick", "LoadOmniscienceMentions(this.getAttribute('name'))");
            mentions.appendChild(box);
        }
    });
}

function LoadOmniscienceMentions(name) {
    let data = omnisciencedata[name];
    let contenttext = "Message: " + data.Message + "\n\n" + "Messager: " + data.AuthorName + "\n\n" + "Date: " + data.DateString + "\n\n"
    "Discord Server: " + data.GuildName + "\n\n" + "Discord Channel: " + data.ChannelName;
    swal(contenttext, {
        buttons: {
            cancel: "OK",
            gopost: {
                text: "Go To Message",
                value: "goto",
            },
        },
    }).then((value) => {
        switch (value) {
            case "goto":
                window.open(data.MessageURL);
        }
    })
}