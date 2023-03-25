function OnSocialsLoadInstagram(){
    MakeRequest("/instagram/GetAllInstagramAccountAnalytics").then(resp =>{
        if(resp.includes("ERROR")){
            swal(resp);
        }
        else{
            let json = JSON.parse(resp);
            document.getElementById('instaAccountsLoad').innerHTML=json.AccountsLoaded+" accounts loaded. "+json.AccountsRunning+" accounts running.";
            document.getElementById('instapostsMadeInLast12Hours').innerHTML="Couldn't get posts made in last 12 hours.";
            document.getElementById('instapostsMadeAllTime').innerHTML=json.AmountOfPostsMadeAllTime+" posts made all time.";
            document.getElementById('instaTotalFollowers').innerHTML=json.TotalFollowers+" total followers.";
            document.getElementById('instaamountofpackages').innerHTML=json.AmountOfPostPackages+" total post packages.";
            LoadAccountDistributionPieIntoCanvas("instaDistributionChart", JSON.stringify(json.AccountStatistics));
        }
    })
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
            let data = new FormData();
            data.append("name", name.value);
            data.append("description", description.value);
            MakePostRequest("/instagram/CreateNewInstagramPostPackage", data).then(r => {
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
function LoadAccountDistributionPieIntoCanvas(canvasID, accountStatisticsJSON){
    let json = JSON.parse(accountStatisticsJSON);
    playerNames = [];
    playerFollowers = [];
    for (let index = 0; index < json.length; index++) {
        const element = json[index];
        playerNames.push(element.account.playerName);
        playerFollowers.push(element.Followers);
    }
    const ctx = document.getElementById(canvasID).getContext('2d');
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