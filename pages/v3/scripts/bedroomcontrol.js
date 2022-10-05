function LoadBedroomPage(){
    MakeRequest("/klivesbedroom/GetAllDevices").then(resp => {
        let json = JSON.parse(resp);
        let grid = document.getElementById('deviceGrid');
        for (let index = 0; index < json.length; index++) {
            const element = json[index];
            let deviceBox = document.createElement('div');
            deviceBox.className="deviceButton";
            deviceBox.setAttribute("data", JSON.stringify(element));
            deviceBox.id=element.DeviceMAC;
            deviceBox.setAttribute("onclick", "ToggleDevice(this.getAttribute('id'))")
            let title = document.createElement("span");
            title.innerHTML=element.DeviceName;
            deviceBox.appendChild(title);
            grid.append(deviceBox);
            if(element.IsOn==true){
                title.style.color="greenyellow";
            }
        }
    })
}

function ToggleDevice(id){
    let button = document.getElementById(id);
    let data = JSON.parse(button.getAttribute("data"));
    button.firstChild.innerHTML="Adjusting...";
    try{
        GetProfilePermissionRank().then(rank => {
            if(rank!="0"){
                MakeRequest("/klivesbedroom/UseDevice?name="+data.DeviceName+"&isOn="+(!data.IsOn)).then(resp => {
                    if(resp=="OK"){
                        if(!data.IsOn==true){
                            button.firstChild.style.color="greenyellow";
                        }
                        else{
                            button.firstChild.style.color="white";
                        }
                        button.firstChild.innerHTML=data.DeviceName;
                        data.IsOn=(!data.IsOn);
                        button.setAttribute("data", JSON.stringify(data));
                    }
                    else if(resp=="DISABLED"){
                        button.firstChild.innerHTML=data.DeviceName;
                        swal("Unauthorized!", "Klives has disabled lighting control.");
                    }
                    else{
                        button.firstChild.innerHTML=data.DeviceName;
                        swal("Error", resp);
                    }
                });
            }
            else{
                swal("Unauthorized", "Your profile is not authorized to do this.")
            }
        })
    }
    catch(err){
       console.error(err);
       button.firstChild.innerHTML=data.DeviceName;
    }
}