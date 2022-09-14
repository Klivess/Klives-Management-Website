function GetSettings() {
    document.body.style.visibility = "hidden";
    IsProfileAdmin().then(resp => {
        document.body.style.visibility = "visible";
        if (resp == true) {
            document.getElementById('body').style.visibility = "visible";
            MakeRequest('/settings/GetSettings').then(response => {
                let json = JSON.parse(response);
                let fields = Object.keys(json);
                let settingGrid = document.getElementById('settingGrid');
                for (let index = 0; index < fields.length; index++) {
                    const element = fields[index];
                    if (element.toLowerCase().includes("value") != true) {
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
                }
            });
        }
        else {
            document.body.style.visibility = "hidden";
            window.location.replace('main.html');
        }
    })
}

function LoadKlivesManager() {
    GetSettings();
    LoadAllProfiles();
}
function LoadAllProfiles(){
    MakeRequest("/KlivesManagementManager/GetAllProfiles").then(resp => {
        let jsonData = JSON.parse(resp);
        let grid = document.getElementById('kmprofiles');
        for (let index = 0; index < jsonData.length; index++) {
            const element = jsonData[index];
            let profile = document.createElement('button');
            profile.className = "kbutton";
            profile.innerHTML = element.Name;
            profile.setAttribute("data", JSON.stringify(element));
            profile.style = "height: 75px;";
            profile.setAttribute("onclick", "ViewProfile(this.getAttribute('data'))");
            grid.appendChild(profile);
        }
    });
}

function ViewProfile(data) {
    let json = JSON.parse(data);
    let rank = json.KlivesManagementRank;
    let container = document.createElement("div");
    container.style = "width: 100%; height: 150px; display: grid; grid-template-rows: 3fr 3fr 1fr 1fr;";
    let name = document.createElement('input');
    name.className = "kinput";
    name.placeholder = "Username";
    name.value = json.Name;
    container.appendChild(name);
    let password = document.createElement('input');
    password.className = "kinput";
    password.placeholder = "Password";
    password.value = json.Password;
    container.appendChild(password);
    let secondContainer = document.createElement('div');
    secondContainer.style = "display: grid; grid-template-columns: 1fr 1fr;";
    let deleteButton = document.createElement('button');
    let canLogin = document.createElement('input');
    let loginheader = document.createElement('span');
    let Loginbox = document.createElement('div');
    let permissions = document.createElement('select');
    container.appendChild(secondContainer);
    if(json.KlivesManagementRank<3){
        deleteButton.innerHTML = "Delete Profile";
        deleteButton.className = "kbutton";
        deleteButton.setAttribute("onclick", "DeleteProfile(" + json.UserID + ")");
        deleteButton.style = "color: red; border: 2px solid red; font-size: 20px; height: 40px;"
        loginheader.innerHTML = "Can Login?";
        canLogin.type = "checkbox";
        canLogin.className = "toggle";
        canLogin.checked = json.CanLogin;
        Loginbox.appendChild(loginheader);
        Loginbox.appendChild(canLogin);
        secondContainer.appendChild(Loginbox);
        secondContainer.appendChild(deleteButton);
        let guest = document.createElement('option');
        if (rank == "0") {
            guest.setAttribute("selected", "true");
        }
        guest.value = "0";
        guest.innerHTML = "Guest";
        let manager = document.createElement('option');
        manager.value = "1";
        manager.innerHTML = "Manager";
        if (rank == "1") {
            manager.setAttribute("selected", "true");
        }
        let associate = document.createElement('option');
        associate.value = "2";
        associate.innerHTML = "Associate";
        if (rank == "2") {
            associate.setAttribute("selected", "true");
        }
        else if (rank == "3") {
            let admin = document.createElement('option');
            admin.value = "3";
            admin.innerHTML = "Admin";
            admin.setAttribute("selected", "true");
            permissions.appendChild(admin);
        }
        permissions.appendChild(guest);
        permissions.appendChild(manager);
        permissions.appendChild(associate);
        container.appendChild(permissions);
    }
    swal("Modify Profile", {
        content: container,
        buttons: {
            cancel: "Cancel",
            submit: {
                text: "Modify",
                value: "submit",
                closeModal: false
            }
        }
    }).then(result => {
        if (result == "submit") {
            json.Name = name.value;
            json.Password = password.value;
            json.CanLogin = canLogin.checked;
            json.KlivesManagementRank = permissions.value;
            // create an XHR object
            const xhr = new XMLHttpRequest();
            xhr.open('POST', api+"/KlivesManagementManager/ModifyProfile");
            let formData = new FormData();
            formData.append("id", json.UserID);
            formData.append("jsonData", JSON.stringify(json));
            xhr.send(formData);
            xhr.onload = () => {
                if (xhr.status == 200) {
                    if (xhr.responseText == "OK") {
                        swal("Complete", "Account " + json.Name + " has been modified.");
                        RefreshProfiles();
                    }
                    else {
                        swal("Error!", resp);
                    }
                } else {
                    console.error('Error!');
                }
            };
        }
    })
}

function RefreshProfiles(){
    RemoveAllElementsInGrid('kmprofiles');
    LoadAllProfiles();
}

function DeleteProfile(id) {
    swal("Confirm", {
        text: "Are you sure you want to remove this profile?",
        buttons: {
            cancel: "Cancel",
            confirm: {
                text: "Confirm",
                value: "confirm",
                closeModal: false
            }
        }
    }).then(resp => {
        if (resp == "confirm") {
            MakeRequest("/KlivesManagementManager/DeleteProfile?profileid=" + id).then(resp => {
                swal("Success", "Profile " + id + " has been removed.", "confirm");
                RefreshProfiles();
            });
        }
    })
}

function CreateNewProfile() {
    let container = document.createElement("div");
    container.style = "width: 100%; height: 200px; display: grid; grid-template-rows: 3fr 3fr 1fr; gap: 20px;";
    let name = document.createElement('input');
    name.className = "kinput";
    name.placeholder = "Username";
    container.appendChild(name);
    let password = document.createElement('input');
    password.className = "kinput";
    password.placeholder = "Password";
    container.appendChild(password);
    let permissions = document.createElement('select');
    let guest = document.createElement('option');
    guest.value = "0";
    guest.innerHTML = "Guest";
    let manager = document.createElement('option');
    manager.value = "1";
    manager.innerHTML = "Manager";
    let associate = document.createElement('option');
    associate.value = "2";
    associate.innerHTML = "Associate";
    permissions.appendChild(guest);
    permissions.appendChild(manager);
    permissions.appendChild(associate);
    container.appendChild(permissions);
    swal("Create New Profile", {
        content: container,
        buttons: {
            cancel: "Cancel",
            submit: {
                text: "Submit",
                value: "submit",
                closeModal: false
            }
        }
    }).then(result => {
        if (result == "submit") {
            MakeRequest("/KlivesManagementManager/CreateNewProfile?adminPassword=" + getCookie("password") + "&name=" + name.value + "&rank=" + permissions.value + "&password=" + password.value).then(resp => {
                if (resp == "OK") {
                    swal("Complete!", "Profile " + name.value + " has been made.");
                    RefreshProfiles();
                }
                else {
                    swal("Error", resp);
                }
            })
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
        let fieldValue = field + "Value";
        if (json[fieldValue] != null && json[field] == true) {
            let ele = document.createElement('input');
            ele.value = json[fieldValue];
            ele.className = "kinput";
            console.log(json);
            swal({
                text: fieldValue + "?",
                content: ele,
                buttons: {
                    cancel: "Cancel",
                    setty: {
                        text: "Set",
                        value: "set"
                    }
                }
            }).then(value => {
                if (value == "set") {
                    json[fieldValue] = ele.value;
                    MakeRequest('/settings/UpdateSettings?json=' + JSON.stringify(json)).then(response => {
                    });
                }
                else {
                    json[field] = false;
                    document.querySelectorAll("[field=" + field + "]")[1].checked = false;
                }
            })
        }
        else {
            MakeRequest('/settings/UpdateSettings?json=' + JSON.stringify(json)).then(response => {
            });
        }
    });
}