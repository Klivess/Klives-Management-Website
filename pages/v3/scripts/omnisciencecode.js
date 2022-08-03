let omnisciencedata = "";

function LoadOmniscience() {
    MakeRequest('/omniscience/GetOmniscienceAnalytics').then(response => {
        omnisciencedata = JSON.parse(response);
        //reverse json array
        omnisciencedata.KlivesMentions.reverse();
        for (let i = 0; i < omnisciencedata.KlivesMentions.length; i++) {
            let items = omnisciencedata.KlivesMentions[i];
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
        document.getElementById('omniscienceKlivesMentions').innerHTML=json.KlivesMentions.length+" messages about Klives.";
        json.FrequentSpeakers.reverse();
        for (let index = 0; index < json.FrequentSpeakers.length; index++) {
            const element = json.FrequentSpeakers[index];
            let ele = document.getElementById("frequentspeakersbox");
            let ele2 = document.createElement('button');
            ele2.className = "kbutton fadein";
            ele2.style = "height: 50px; font-size: 20px; text-transform: none; display: grid; grid-template-columns: 1fr 1fr;";
            ele2.innerHTML = "<p class='special' style='font-size: large;'>" + element.Key.Username + "</p><p class ='special' style='color: cyan;'>" + element.Value+" Messages sent" + "</p>";
            ele.appendChild(ele2);
        }
        json.WordFrequency.reverse();
        for (let index = 0; index < json.WordFrequency.length; index++) {
            const element = json.WordFrequency[index];
            if(element.Value>30){
                let ele = document.getElementById("wordfrequency");
                let ele2 = document.createElement('button');
                ele2.className = "kbutton fadein";
                ele2.style = "height: 50px; font-size: 20px; text-transform: none; display: grid; grid-template-columns: 1fr 1fr;";
                ele2.innerHTML = "<p class='special' style='font-size: large;'>'" + element.Key + "'</p><p class ='special' style='color: cyan;'> Mentioned " + element.Value+" times." + "</p>";
                ele.appendChild(ele2);
            }
        }
    });
}

function LoadOmniscienceMentions(name) {
    let data = omnisciencedata.KlivesMentions[name];
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