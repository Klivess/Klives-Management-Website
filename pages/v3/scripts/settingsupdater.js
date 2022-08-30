function GetSettings() {
    IsKliveAdmin().then(resp => {
        if (resp == true) {
            document.getElementById('body').style.visibility = "visible";
            MakeRequest('/settings/GetSettings').then(response => {
                let json = JSON.parse(response);
                let fields = Object.keys(json);
                let settingGrid = document.getElementById('settingGrid');
                for (let index = 0; index < fields.length; index++) {
                    const element = fields[index];
                    let container = document.createElement('div');
                    container.className = "settingContainer";
                    let span = document.createElement('span');
                    span.innerHTML = "Configure " + element;
                    container.appendChild(span);
                    let input = document.createElement('input');
                    input.type = "checkbox";
                    input.className = "toggle";
                    input.setAttribute('field', element);
                    input.setAttribute("onchange", 'UpdateSettings(this.getAttribute("field"))')
                    container.appendChild(input);
                    container.setAttribute('field', element);
                    container.setAttribute('name', "settingInput");
                    input.checked = json[element];
                    settingGrid.appendChild(container);
                }
            });
        }
        else {
            swal("Unauthorized!", unauthMessage);
        }
    })
}

function SendFinalMessage() {
    alert("Don't betray me like this, I gave you my administrator password and you click this forbidden button? \n \nThis button is not to be pressed yet. There is a certain date in which this button will be unlocked.");
    LogOut();
}

function UpdateSettings(field) {
    MakeRequest('/settings/GetSettings').then(response => {
        let json = JSON.parse(response);
        let settings = document.getElementsByName('settingInput');
        let fields = Object.keys(json);
        for (let index = 0; index < fields.length; index++) {
            const element = fields[index];
            for (let index2 = 0; index2 < settings.length; index2++) {
                const element2 = settings[index2];
                if (element2.getAttribute('field') == element) {
                    json[element] = element2.lastElementChild.checked;
                }
            }
        }
        if (field == "GuestPassEnabled"&&json.GuestPassEnabled==true) {
            let ele = document.createElement('input');
            ele.value=json.GuestPassword;
            swal({
                text: 'Guest Password?',
                content: ele,
                buttons: {
                    cancel: "Cancel",
                    setty: {
                        text: "Set",
                        value: "set"
                    }
                }
            }).then(value =>{
                console.log(value);
                if(value=="set"){
                    console.log(ele.value);
                    json.GuestPassword = ele.value;
                    MakeRequest('/settings/UpdateSettings?json=' + JSON.stringify(json)).then(response => {
                    });
                }
                else{
                    console.log(":(");
                    json.GuestPassEnabled==false;
                    console.log(document.querySelectorAll("[field="+field+"]"));
                    document.querySelectorAll("[field="+field+"]")[1].checked=false;
                }
            })
        }
        else{
            MakeRequest('/settings/UpdateSettings?json=' + JSON.stringify(json)).then(response => {
            });
        }
    });
}